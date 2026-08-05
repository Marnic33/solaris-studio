/**
 * Análise econômica de sistema fotovoltaico no Brasil.
 *
 * Trata o ponto que mais confunde proposta comercial: o Fio B da Lei 14.300/2022.
 * Quem conecta depois de 07/01/2023 paga uma fração crescente da TUSD Fio B sobre
 * a energia injetada e compensada — o desconto na conta não é integral.
 *
 * Referências: Lei 14.300/2022, REN ANEEL 1.059/2023.
 */

/* ==========================================================================
   Fio B — percentual pago sobre a energia compensada
   ========================================================================== */
export const CRONOGRAMA_FIO_B = {
  2023: 0.15, 2024: 0.30, 2025: 0.45, 2026: 0.60,
  2027: 0.75, 2028: 0.90, 2029: 1.00
};

/**
 * Percentual do Fio B devido num ano.
 * Sistemas conectados até 06/01/2023 têm direito adquirido até 2045.
 */
export function percentualFioB(ano, anoConexao = new Date().getFullYear()) {
  if (anoConexao <= 2022) return ano <= 2045 ? 0 : 1;
  if (ano < 2023) return 0;
  return CRONOGRAMA_FIO_B[Math.min(ano, 2029)] ?? 1;
}

/* ==========================================================================
   Tarifas de referência (R$/kWh, valores típicos de 2026 — ajuste ao caso)
   ========================================================================== */
export const TARIFAS = {
  'CPFL Paulista':    { total: 0.98, fioB: 0.28 },
  'CPFL Piratininga': { total: 0.95, fioB: 0.27 },
  'Enel SP':          { total: 0.92, fioB: 0.26 },
  'Elektro':          { total: 0.99, fioB: 0.29 },
  'EDP SP':           { total: 0.94, fioB: 0.27 },
  'Cemig':            { total: 1.02, fioB: 0.30 },
  'Light':            { total: 1.05, fioB: 0.31 },
  'Coelba':           { total: 1.00, fioB: 0.29 },
  'Celesc':           { total: 0.91, fioB: 0.26 },
  'Copel':            { total: 0.89, fioB: 0.25 },
  'Outra':            { total: 0.95, fioB: 0.27 }
};

/** Custo de disponibilidade em kWh, conforme o tipo de ligação. */
export const DISPONIBILIDADE = { monofasica: 30, bifasica: 50, trifasica: 100 };

/* ==========================================================================
   Fluxo de caixa
   ========================================================================== */

/**
 * Projeta o fluxo de caixa do sistema.
 *
 * @param {object} e
 *   investimento      R$ total instalado
 *   geracaoAnual      kWh/ano no primeiro ano
 *   consumoMensal     kWh/mês médio
 *   tarifa            R$/kWh cheia
 *   tarifaFioB        R$/kWh da parcela TUSD Fio B
 *   ligacao           'monofasica' | 'bifasica' | 'trifasica'
 *   anoConexao        ano de conexão
 *   anos              horizonte, padrão 25
 *   inflacaoEnergia   reajuste anual da tarifa, padrão 0.06
 *   degradacao        perda anual dos módulos, padrão 0.005
 *   descontoAnual     taxa para o VPL, padrão 0.10
 *   oem               custo anual de manutenção em R$, padrão 0
 *   trocaInversor     {ano, custo} ou null
 */
export function fluxoDeCaixa(e) {
  const {
    investimento, geracaoAnual, consumoMensal, tarifa, tarifaFioB,
    ligacao = 'monofasica', anoConexao = new Date().getFullYear(),
    anos = 25, inflacaoEnergia = 0.06, degradacao = 0.005,
    descontoAnual = 0.10, oem = 0, trocaInversor = null
  } = e;

  const dispAnual = (DISPONIBILIDADE[ligacao] || 30) * 12;
  const consumoAnual = consumoMensal * 12;
  const linhas = [];
  let acumulado = -investimento;
  let vpl = -investimento;
  let paybackSimples = null, paybackDescontado = null;

  for (let i = 1; i <= anos; i++) {
    const ano = anoConexao + i - 1;
    const geracao = geracaoAnual * Math.pow(1 - degradacao, i - 1);
    const tarifaAno = tarifa * Math.pow(1 + inflacaoEnergia, i - 1);
    const fioBAno = tarifaFioB * Math.pow(1 + inflacaoEnergia, i - 1);

    /* energia efetivamente abatida: não se compensa abaixo da disponibilidade */
    const compensavel = Math.max(0, Math.min(geracao, consumoAnual - dispAnual));
    const excedente = Math.max(0, geracao - compensavel);

    const economiaBruta = compensavel * tarifaAno;
    const custoFioB = compensavel * fioBAno * percentualFioB(ano, anoConexao);
    /* excedente vira crédito; considerado a 70% por caducidade e uso parcial */
    const valorExcedente = excedente * (tarifaAno - fioBAno) * 0.7;

    const manutencao = oem * Math.pow(1 + inflacaoEnergia, i - 1);
    const troca = (trocaInversor && trocaInversor.ano === i) ? trocaInversor.custo : 0;

    const liquido = economiaBruta - custoFioB + valorExcedente - manutencao - troca;
    acumulado += liquido;
    const descontado = liquido / Math.pow(1 + descontoAnual, i);
    vpl += descontado;

    if (paybackSimples === null && acumulado >= 0)
      paybackSimples = i - 1 + (acumulado - liquido < 0
        ? (liquido - acumulado) / liquido : 0);

    linhas.push({
      ano: i, anoCalendario: ano,
      geracao: Math.round(geracao),
      compensavel: Math.round(compensavel),
      excedente: Math.round(excedente),
      tarifa: +tarifaAno.toFixed(3),
      economiaBruta: Math.round(economiaBruta),
      custoFioB: Math.round(custoFioB),
      percentualFioB: percentualFioB(ano, anoConexao),
      valorExcedente: Math.round(valorExcedente),
      manutencao: Math.round(manutencao + troca),
      liquido: Math.round(liquido),
      acumulado: Math.round(acumulado)
    });
  }

  /* payback descontado */
  let ac = -investimento;
  for (const l of linhas) {
    ac += l.liquido / Math.pow(1 + descontoAnual, l.ano);
    if (paybackDescontado === null && ac >= 0) { paybackDescontado = l.ano; break; }
  }

  return {
    linhas,
    investimento,
    vpl: Math.round(vpl),
    tir: calcularTIR(investimento, linhas.map(l => l.liquido)),
    paybackSimples: paybackSimples !== null ? +paybackSimples.toFixed(1) : null,
    paybackDescontado,
    economia25: Math.round(linhas.reduce((s, l) => s + l.liquido, 0)),
    economiaAno1: linhas[0] ? linhas[0].liquido : 0,
    economiaMes1: linhas[0] ? Math.round(linhas[0].liquido / 12) : 0,
    fioB25: Math.round(linhas.reduce((s, l) => s + l.custoFioB, 0)),
    lcoe: calcularLCOE(investimento, linhas, descontoAnual)
  };
}

/** Taxa interna de retorno, por bisseção. */
export function calcularTIR(investimento, fluxos, limite = 2) {
  const vpl = taxa => fluxos.reduce(
    (s, f, i) => s + f / Math.pow(1 + taxa, i + 1), -investimento);
  if (vpl(0) < 0) return null;                    // nunca se paga
  let baixo = 0, alto = limite;
  for (let i = 0; i < 100; i++) {
    const meio = (baixo + alto) / 2;
    if (vpl(meio) > 0) baixo = meio; else alto = meio;
  }
  return +(((baixo + alto) / 2) * 100).toFixed(1);
}

/** Custo nivelado da energia gerada, em R$/kWh. */
export function calcularLCOE(investimento, linhas, desconto = 0.10) {
  let custos = investimento, energia = 0;
  linhas.forEach(l => {
    custos += l.manutencao / Math.pow(1 + desconto, l.ano);
    energia += l.geracao / Math.pow(1 + desconto, l.ano);
  });
  return energia > 0 ? +(custos / energia).toFixed(3) : null;
}

/* ==========================================================================
   Estimativa de investimento
   ========================================================================== */

/** Faixas de preço por kWp instalado, em R$ (mercado brasileiro, 2026). */
export const PRECO_POR_KWP = [
  { ate: 5,   valor: 4200 },
  { ate: 10,  valor: 3800 },
  { ate: 20,  valor: 3400 },
  { ate: 50,  valor: 3000 },
  { ate: 999, valor: 2700 }
];

export function estimarInvestimento(kwp, margem = 0.30) {
  const faixa = PRECO_POR_KWP.find(f => kwp <= f.ate) || PRECO_POR_KWP[PRECO_POR_KWP.length - 1];
  const custo = kwp * faixa.valor;
  return {
    custoBase: Math.round(custo),
    precoKwp: faixa.valor,
    comMargem: Math.round(custo * (1 + margem)),
    margem
  };
}
