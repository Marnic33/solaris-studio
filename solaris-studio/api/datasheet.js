/**
 * Leitura de datasheet de equipamento fotovoltaico.
 *
 * Recebe PDF ou imagem em base64 e devolve os parâmetros estruturados,
 * prontos para entrar no catálogo do Solaris Studio.
 *
 * O tipo é detectado sozinho: inversor ou módulo.
 */
const MODELO = 'claude-sonnet-4-6';
const LIMITE_BYTES = 10 * 1024 * 1024;

const INSTRUCAO = `Você está lendo o datasheet de um equipamento fotovoltaico.
Identifique se é um INVERSOR ou um MÓDULO e responda SOMENTE com JSON válido,
sem markdown e sem crases.

Se for INVERSOR:
{
 "categoria": "inversor",
 "fabricante": "marca",
 "nome": "modelo exato como no datasheet",
 "ca": potência nominal de saída CA em watts (número),
 "ccMax": potência máxima de entrada CC em watts (número),
 "fases": 1 ou 3,
 "tensaoCA": tensão nominal de saída em volts (220, 380...),
 "mppt": quantidade de rastreadores MPPT (número),
 "stringsPorMppt": strings por MPPT (número, use 1 se não informado),
 "vMin": tensão MÍNIMA da faixa de operação do MPPT em volts,
 "vMax": tensão MÁXIMA de entrada CC em volts (a "max DC voltage", NÃO a do MPPT),
 "vPartida": tensão de partida em volts ou null,
 "iMaxMppt": corrente máxima de entrada por MPPT em amperes,
 "eficiencia": eficiência máxima como decimal (exemplo: 0.983),
 "tipo": "string" ou "híbrido" ou "microinversor",
 "baterias": true se aceita baterias, senão false,
 "garantia": anos de garantia (número) ou null
}

Se for MÓDULO:
{
 "categoria": "modulo",
 "fabricante": "marca",
 "linha": "linha ou série",
 "wp": potência nominal em watts pico (número),
 "tecnologia": "N-Type TOPCon, Mono PERC, HJT, etc",
 "celulas": número de células,
 "comprimento": em MILÍMETROS (número),
 "largura": em MILÍMETROS (número),
 "espessura": em MILÍMETROS (número),
 "peso": em quilogramas (número),
 "voc": tensão de circuito aberto em STC, volts,
 "vmp": tensão de máxima potência em STC, volts,
 "isc": corrente de curto-circuito em STC, amperes,
 "imp": corrente de máxima potência em STC, amperes,
 "coefVoc": coeficiente de temperatura da Voc em %/°C (NEGATIVO, ex: -0.25),
 "coefP": coeficiente de temperatura da potência em %/°C (NEGATIVO, ex: -0.29),
 "noct": temperatura nominal de operação em °C (NOCT ou NMOT),
 "eficiencia": eficiência do módulo em PORCENTAGEM (ex: 22.2),
 "garantiaProduto": anos,
 "garantiaPotencia": anos
}

Em ambos os casos acrescente:
 "confianca": "alta" | "media" | "baixa",
 "observacoes": o que não deu para ler com certeza, ou null

Regras importantes:
- Datasheets costumam listar VÁRIOS modelos numa tabela. Se houver mais de um,
  extraia o de MAIOR potência e diga quais outros existem em "observacoes".
- Use ponto decimal. Não use separador de milhar.
- Para inversores, "vMax" é a tensão MÁXIMA DE ENTRADA CC (max DC voltage),
  que é diferente do topo da faixa de MPPT. Se as duas aparecerem, use a máxima
  de entrada e registre a do MPPT em observacoes.
- Valores em kW devem ser convertidos para watts. Dimensões em metros ou
  polegadas, para milímetros.
- Não invente. Campo ilegível vai como null e a confiança cai.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use POST' });

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada' });

  const { dados, tipo } = req.body || {};
  if (!dados) return res.status(400).json({ erro: 'arquivo ausente' });
  if (dados.length > LIMITE_BYTES * 1.4)
    return res.status(413).json({ erro: 'arquivo grande demais — use até 10 MB' });

  const ehPdf = tipo === 'application/pdf';
  const bloco = ehPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: dados } }
    : { type: 'image', source: { type: 'base64', media_type: tipo || 'image/jpeg', data: dados } };

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': chave,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1500,
        messages: [{ role: 'user', content: [bloco, { type: 'text', text: INSTRUCAO }] }]
      })
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return res.status(r.status).json({ erro: e?.error?.message || `API ${r.status}` });
    }

    const d = await r.json();
    const texto = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const limpo = texto.replace(/```json|```/g, '').trim();

    let eq;
    try {
      eq = JSON.parse(limpo);
    } catch (_) {
      return res.status(502).json({ erro: 'não consegui interpretar o datasheet',
                                    bruto: limpo.slice(0, 800) });
    }

    /* validação e coerência: devolve avisos em vez de aceitar em silêncio */
    const avisos = [];
    if (eq.categoria === 'inversor') {
      if (eq.eficiencia > 1) { eq.eficiencia = eq.eficiencia / 100; avisos.push('Eficiência convertida de porcentagem para decimal.'); }
      if (eq.eficiencia && (eq.eficiencia < 0.9 || eq.eficiencia > 1))
        avisos.push(`Eficiência de ${eq.eficiencia} está fora do esperado — confira.`);
      if (eq.vMax && eq.vMin && eq.vMax <= eq.vMin)
        avisos.push('Tensão máxima menor que a mínima — os campos podem ter sido trocados.');
      if (eq.ca && eq.ccMax && eq.ccMax < eq.ca)
        avisos.push('Potência CC menor que a CA — incomum, confira no datasheet.');
      if (!eq.vMax || !eq.vMin || !eq.iMaxMppt)
        avisos.push('Faltam tensões ou corrente de entrada; sem isso a validação de string não roda.');
      eq.id = gerarId(eq.fabricante, eq.nome);
    } else if (eq.categoria === 'modulo') {
      if (eq.comprimento && eq.comprimento < 100) { eq.comprimento *= 1000; avisos.push('Comprimento convertido de metros para milímetros.'); }
      if (eq.largura && eq.largura < 100) { eq.largura *= 1000; avisos.push('Largura convertida de metros para milímetros.'); }
      if (eq.coefVoc > 0) { eq.coefVoc = -Math.abs(eq.coefVoc); avisos.push('Coeficiente de Voc ajustado para negativo.'); }
      if (eq.coefP > 0) { eq.coefP = -Math.abs(eq.coefP); avisos.push('Coeficiente de potência ajustado para negativo.'); }
      if (eq.eficiencia && eq.eficiencia < 1) { eq.eficiencia *= 100; avisos.push('Eficiência convertida para porcentagem.'); }
      if (eq.wp && eq.vmp && eq.imp) {
        const calc = eq.vmp * eq.imp;
        if (Math.abs(calc - eq.wp) / eq.wp > 0.08)
          avisos.push(`Vmp × Imp = ${calc.toFixed(0)} W, mas a potência informada é ${eq.wp} W. Confira.`);
      }
      eq.id = gerarId(eq.fabricante, `${eq.linha || ''} ${eq.wp}`);
    } else {
      return res.status(422).json({ erro: 'não identifiquei se é inversor ou módulo' });
    }

    eq.avisos = avisos;
    return res.status(200).json(eq);
  } catch (e) {
    return res.status(502).json({ erro: 'falha ao processar', detalhe: e.message });
  }
}

function gerarId(fabricante, nome) {
  return `${fabricante || 'eq'}-${nome || ''}`
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
