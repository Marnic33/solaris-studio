/**
 * Leitura de conta de energia.
 *
 * Recebe imagem ou PDF em base64, envia para o Claude e devolve os dados
 * estruturados: endereço, consumo mensal, tipo de ligação, distribuidora.
 *
 * A chave da API fica só aqui, nunca no navegador.
 */
const MODELO = 'claude-sonnet-4-6';
const LIMITE_BYTES = 8 * 1024 * 1024;   // ~8 MB depois do base64

const INSTRUCAO = `Você está lendo uma conta de energia elétrica brasileira.
Extraia os dados abaixo e responda SOMENTE com JSON válido, sem markdown e sem crases.

{
 "titular": "nome do titular ou null",
 "endereco": "logradouro e número completos, como impresso",
 "bairro": "bairro ou null",
 "cidade": "cidade",
 "uf": "sigla do estado",
 "cep": "somente dígitos ou null",
 "distribuidora": "nome da concessionária",
 "unidade_consumidora": "número da UC ou null",
 "tipo_ligacao": "monofasica | bifasica | trifasica ou null",
 "grupo": "A ou B ou null",
 "classe": "residencial | comercial | rural | industrial ou null",
 "tensao_v": número ou null,
 "consumo_mes_kwh": número do mês faturado,
 "historico_kwh": [{"mes":"MM/AAAA","kwh":número}],
 "media_kwh": média do histórico, número,
 "valor_total_rs": número ou null,
 "tarifa_kwh_rs": valor por kWh se estiver visível, número ou null,
 "demanda_contratada_kw": número ou null,
 "ja_tem_geracao": true ou false,
 "creditos_kwh": número ou null,
 "confianca": "alta | media | baixa",
 "observacoes": "o que não deu para ler com certeza, ou null"
}

Regras:
- Use ponto como separador decimal e não use separador de milhar.
- O histórico costuma vir num gráfico de barras com 12 meses; transcreva todos que conseguir ler.
- Se a conta já indicar geração própria (energia injetada, saldo de créditos),
  marque ja_tem_geracao como true.
- Não invente. Campo que você não conseguir ler com segurança vai como null
  e a confiança cai.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use POST' });

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada' });

  const { dados, tipo } = req.body || {};
  if (!dados) return res.status(400).json({ erro: 'arquivo ausente' });
  if (dados.length > LIMITE_BYTES * 1.4)
    return res.status(413).json({ erro: 'arquivo grande demais — use até 8 MB' });

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

    let extraido;
    try {
      extraido = JSON.parse(limpo);
    } catch (_) {
      return res.status(502).json({ erro: 'não consegui interpretar a conta', bruto: limpo.slice(0, 800) });
    }

    /* média de segurança: se o modelo não calculou, faz aqui */
    if (!extraido.media_kwh && Array.isArray(extraido.historico_kwh) && extraido.historico_kwh.length) {
      const vals = extraido.historico_kwh.map(h => Number(h.kwh)).filter(v => isFinite(v) && v > 0);
      if (vals.length) extraido.media_kwh = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(0);
    }

    return res.status(200).json(extraido);
  } catch (e) {
    return res.status(502).json({ erro: 'falha ao processar', detalhe: e.message });
  }
}
