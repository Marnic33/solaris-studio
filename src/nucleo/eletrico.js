/**
 * Modelo elétrico do sistema fotovoltaico.
 *
 * Substitui o "performance ratio" fixo por cálculo a partir do comportamento real
 * dos componentes: tensão da string com a temperatura, janela de MPPT do inversor,
 * fator de dimensionamento e perdas separadas por origem.
 *
 * Referências: NBR 16690 (arranjos FV), NBR 5410, IEC 61215 (NOCT).
 */

/* ---------------------------------------------------------------- módulos */

/** Coeficientes típicos de módulo de silício cristalino N-type. */
export const MODULO_PADRAO = {
  voc: 54.4,        // tensão de circuito aberto em STC (V)
  vmp: 45.6,        // tensão de máxima potência (V)
  isc: 14.4,        // corrente de curto-circuito (A)
  imp: 13.6,        // corrente de máxima potência (A)
  coefVoc: -0.25,   // %/°C — variação da Voc
  coefP: -0.29,     // %/°C — variação da potência
  noct: 45          // temperatura nominal de operação (°C)
};

/**
 * Escala os parâmetros elétricos para a potência informada.
 * Módulos de potências diferentes mantêm tensão parecida e variam a corrente,
 * porque o que muda é a área da célula, não o número de células em série.
 */
export function parametrosModulo(potenciaWp, base = MODULO_PADRAO) {
  const razao = potenciaWp / 620;
  return {
    ...base,
    isc: +(base.isc * razao).toFixed(2),
    imp: +(base.imp * razao).toFixed(2),
    wp: potenciaWp
  };
}

/* -------------------------------------------------------------- inversores */

/** Inversores comuns no mercado brasileiro. Potências em W, tensões em V. */
export const INVERSORES = [
  { id:'gw3000',  nome:'GoodWe GW3000-NS',      ca:3000,  ccMax:4500,  fases:1,
    mppt:1, stringsPorMppt:1, vMin:80,  vMax:500, vNominal:360, iMaxMppt:16, eficiencia:0.972 },
  { id:'gw5000',  nome:'GoodWe GW5000-NS',      ca:5000,  ccMax:7500,  fases:1,
    mppt:2, stringsPorMppt:1, vMin:80,  vMax:500, vNominal:360, iMaxMppt:16, eficiencia:0.975 },
  { id:'gw8500',  nome:'GoodWe GW8.5K-ET',      ca:8500,  ccMax:12750, fases:3,
    mppt:2, stringsPorMppt:1, vMin:150, vMax:1000, vNominal:620, iMaxMppt:16, eficiencia:0.980 },
  { id:'gw10k',   nome:'GoodWe GW10K-DT',       ca:10000, ccMax:15000, fases:3,
    mppt:2, stringsPorMppt:1, vMin:180, vMax:1000, vNominal:620, iMaxMppt:16, eficiencia:0.983 },
  { id:'gw15k',   nome:'GoodWe GW15K-DT',       ca:15000, ccMax:22500, fases:3,
    mppt:2, stringsPorMppt:2, vMin:180, vMax:1000, vNominal:620, iMaxMppt:22, eficiencia:0.984 },
  { id:'gw20k',   nome:'GoodWe GW20K-MT',       ca:20000, ccMax:30000, fases:3,
    mppt:2, stringsPorMppt:2, vMin:200, vMax:1100, vNominal:620, iMaxMppt:30, eficiencia:0.985 },
  { id:'gw25k',   nome:'GoodWe GW25K-MT',       ca:25000, ccMax:37500, fases:3,
    mppt:3, stringsPorMppt:2, vMin:200, vMax:1100, vNominal:620, iMaxMppt:30, eficiencia:0.985 },
  { id:'gw50k',   nome:'GoodWe GW50K-MT',       ca:50000, ccMax:75000, fases:3,
    mppt:4, stringsPorMppt:2, vMin:200, vMax:1100, vNominal:620, iMaxMppt:30, eficiencia:0.986 },
  { id:'micro2250', nome:'Growatt NEO 2250M-X2', ca:2250, ccMax:3000, fases:1,
    mppt:2, stringsPorMppt:1, vMin:25, vMax:60, vNominal:40, iMaxMppt:20, eficiencia:0.966,
    micro:true }
];

/* --------------------------------------------------- temperatura de célula */

/**
 * Temperatura da célula pelo modelo NOCT.
 * irradiancia em W/m², ambiente em °C.
 */
export const tempCelula = (ambiente, irradiancia, noct = 45) =>
  ambiente + (noct - 20) / 800 * irradiancia;

/** Tensão de circuito aberto corrigida para uma temperatura. */
export const vocNaTemp = (m, t) => m.voc * (1 + m.coefVoc / 100 * (t - 25));

/** Tensão de máxima potência corrigida. */
export const vmpNaTemp = (m, t) => m.vmp * (1 + m.coefVoc / 100 * (t - 25));

/* ------------------------------------------------------ arranjo de strings */

/**
 * Valida uma configuração de string contra os limites do inversor.
 * tMin: menor temperatura ambiente esperada (pior caso para Voc)
 * tMax: temperatura de célula no pior calor (pior caso para Vmp)
 */
export function validarString(modulo, inversor, nSerie, tMin = 5, tMax = 70) {
  const vocFrio = vocNaTemp(modulo, tMin) * nSerie;
  const vmpQuente = vmpNaTemp(modulo, tMax) * nSerie;
  const vmpNominal = modulo.vmp * nSerie;

  const erros = [], avisos = [];
  if (vocFrio > inversor.vMax)
    erros.push(`Tensão a frio ${vocFrio.toFixed(0)} V passa do limite de ${inversor.vMax} V — ` +
               `risco de danificar o inversor.`);
  if (vmpQuente < inversor.vMin)
    erros.push(`No calor a string cai para ${vmpQuente.toFixed(0)} V, abaixo do MPPT ` +
               `mínimo de ${inversor.vMin} V — o inversor desliga nas horas mais quentes.`);
  if (modulo.isc > inversor.iMaxMppt)
    erros.push(`Corrente de ${modulo.isc} A passa do limite de ${inversor.iMaxMppt} A por entrada.`);
  if (vocFrio > inversor.vMax * 0.95 && vocFrio <= inversor.vMax)
    avisos.push(`Tensão a frio a ${(vocFrio / inversor.vMax * 100).toFixed(0)}% do limite — ` +
                `pouca margem para uma manhã atípica.`);

  return {
    ok: erros.length === 0,
    nSerie, vocFrio, vmpQuente, vmpNominal, erros, avisos,
    folgaSuperior: inversor.vMax - vocFrio,
    folgaInferior: vmpQuente - inversor.vMin
  };
}

/** Faixa de módulos em série que atende ao inversor. */
export function faixaSerie(modulo, inversor, tMin = 5, tMax = 70) {
  const min = Math.ceil(inversor.vMin / vmpNaTemp(modulo, tMax));
  const max = Math.floor(inversor.vMax / vocNaTemp(modulo, tMin));
  return { min: Math.max(1, min), max: Math.max(0, max) };
}

/**
 * Arranjo com microinversores.
 *
 * Cada MPPT recebe um módulo, então a conta é de quantas unidades são
 * necessárias — não de strings. É comum sobrar entrada na última unidade.
 */
export function montarArranjoMicro(nModulos, modulo, inversor) {
  const porUnidade = inversor.mppt * (inversor.stringsPorMppt || 1);
  const unidades = Math.ceil(nModulos / porUnidade);
  const distribuicao = [];
  let restam = nModulos;
  for (let i = 0; i < unidades; i++) {
    const n = Math.min(porUnidade, restam);
    distribuicao.push(n);
    restam -= n;
  }

  const avisos = [];
  const ocupacao = nModulos / (unidades * porUnidade);
  const ultima = distribuicao[distribuicao.length - 1];
  if (ultima < porUnidade)
    avisos.push(`A última unidade fica com ${ultima} de ${porUnidade} entradas ocupadas. ` +
                `Entrada livre não atrapalha, mas é capacidade paga sem uso.`);

  /* cada módulo trabalha sozinho no seu MPPT: a checagem é de tensão do módulo */
  const vocFrio = vocNaTemp(modulo, 5);
  const vmpQuente = vmpNaTemp(modulo, 70);
  const erros = [];
  if (vocFrio > inversor.vMax)
    erros.push(`Voc do módulo a frio (${vocFrio.toFixed(0)} V) passa do limite de ` +
               `${inversor.vMax} V deste microinversor.`);
  if (vmpQuente < inversor.vMin)
    erros.push(`Vmp do módulo no calor (${vmpQuente.toFixed(0)} V) fica abaixo do MPPT ` +
               `mínimo de ${inversor.vMin} V.`);
  if (modulo.isc > inversor.iMaxMppt)
    erros.push(`Corrente do módulo (${modulo.isc} A) passa do limite de ` +
               `${inversor.iMaxMppt} A por entrada.`);

  const potenciaCC = nModulos * modulo.wp;
  const potenciaCA = unidades * inversor.ca;
  const fdi = potenciaCC / potenciaCA;
  if (fdi > 1.35) avisos.push(
    `Sobrecarga de ${((fdi - 1) * 100).toFixed(0)}% por unidade — considere um ` +
    `microinversor de potência maior.`);

  return {
    viavel: erros.length === 0,
    micro: true,
    motivo: erros.join(' '),
    unidades, porUnidade, distribuicao,
    comprimentos: distribuicao,
    strings: unidades,
    entradasUsadas: nModulos, entradasTotais: unidades * porUnidade,
    ocupacao,
    validacao: { nSerie: 1, vocFrio, vmpQuente, erros, avisos: [] },
    potenciaCC, potenciaCA, fdi, avisos,
    correnteTotal: +(modulo.imp * nModulos).toFixed(1)
  };
}

/**
 * Monta o arranjo: divide os módulos em strings equilibradas entre os MPPTs.
 * Aceita mais de uma unidade do mesmo inversor.
 */
export function montarArranjo(nModulos, modulo, inversor, tMin = 5, tMax = 70, unidades = 1) {
  if (inversor.micro) return montarArranjoMicro(nModulos, modulo, inversor);
  const faixa = faixaSerie(modulo, inversor, tMin, tMax);
  const entradas = inversor.mppt * inversor.stringsPorMppt * Math.max(1, unidades);

  if (faixa.max < faixa.min || faixa.max === 0) {
    return { viavel: false, motivo:
      `Nenhum comprimento de string atende ao inversor: seria preciso entre ${faixa.min} e ` +
      `${faixa.max} módulos em série, faixa impossível.` , faixa };
  }

  /* procura a combinação que use menos entradas com strings iguais */
  let melhor = null;
  for (let strings = 1; strings <= entradas; strings++) {
    if (nModulos % strings !== 0) continue;
    const nSerie = nModulos / strings;
    if (nSerie < faixa.min || nSerie > faixa.max) continue;
    const v = validarString(modulo, inversor, nSerie, tMin, tMax);
    if (!v.ok) continue;
    const custo = strings + Math.abs(nSerie - (faixa.min + faixa.max) / 2) * 0.1;
    if (!melhor || custo < melhor.custo) melhor = { strings, nSerie, v, custo, iguais: true };
  }

  /* se não fecha exato, aceita strings de comprimentos diferentes */
  if (!melhor) {
    for (let strings = 2; strings <= entradas; strings++) {
      const base = Math.floor(nModulos / strings), resto = nModulos % strings;
      const compr = Array.from({ length: strings }, (_, i) => base + (i < resto ? 1 : 0));
      if (compr.some(c => c < faixa.min || c > faixa.max)) continue;
      const vs = compr.map(c => validarString(modulo, inversor, c, tMin, tMax));
      if (vs.some(v => !v.ok)) continue;
      melhor = { strings, comprimentos: compr, v: vs[0], iguais: false };
      break;
    }
  }

  if (!melhor) {
    const precisa = Math.ceil(nModulos / (faixa.max * inversor.mppt * inversor.stringsPorMppt));
    return { viavel: false, faixa, sugestaoUnidades: Math.max(2, precisa), motivo:
      `Não consegui dividir ${nModulos} módulos em até ${entradas} strings de ` +
      `${faixa.min} a ${faixa.max} módulos.` +
      (precisa > unidades
        ? ` Com ${precisa} unidades deste inversor caberia — aumente a quantidade abaixo.`
        : ` Ajuste a quantidade de módulos ou troque o inversor.`) };
  }

  const comprimentos = melhor.comprimentos || Array(melhor.strings).fill(melhor.nSerie);
  const potenciaCC = nModulos * modulo.wp;
  const potenciaCA = inversor.ca * Math.max(1, unidades);
  const fdi = potenciaCC / potenciaCA;

  const avisos = [...(melhor.v.avisos || [])];
  if (fdi > 1.35) avisos.push(
    `Sobrecarga de ${((fdi - 1) * 100).toFixed(0)}% no inversor. Acima de 35% o corte nos ` +
    `picos começa a custar energia — considere um inversor maior.`);
  if (fdi < 0.85) avisos.push(
    `Inversor sobredimensionado (${(fdi * 100).toFixed(0)}%). Um modelo menor reduz o custo ` +
    `sem perder geração.`);
  if (comprimentos.length > 1 && !melhor.iguais) avisos.push(
    `Strings de tamanhos diferentes (${comprimentos.join(', ')}). Funciona, mas exige MPPTs ` +
    `separados — nunca ligue strings desiguais na mesma entrada.`);

  return {
    viavel: true, faixa, comprimentos, strings: comprimentos.length,
    unidades: Math.max(1, unidades),
    entradasUsadas: comprimentos.length, entradasTotais: entradas,
    validacao: melhor.v, potenciaCC, potenciaCA, fdi, avisos,
    correnteTotal: +(modulo.imp * comprimentos.length).toFixed(1)
  };
}

/* ------------------------------------------------------------------ perdas */

/** Perdas percentuais típicas. Ajustáveis pelo usuário. */
export const PERDAS_PADRAO = {
  sujeira: 3.0,       // acúmulo entre limpezas
  mismatch: 2.0,      // dispersão entre módulos
  cabeamento: 1.5,    // queda ôhmica em CC e CA
  reflexao: 2.5,      // IAM — reflexão em ângulo de incidência alto
  degradacao: 0.5,    // primeiro ano (LID já incluso no primeiro ano)
  indisponibilidade: 0.5
};

/**
 * Fator de desempenho do sistema (equivalente ao PR), em um mês.
 * tempAmbiente em °C, irradiancia média das horas de sol em W/m².
 */
export function fatorDesempenho(opcoes) {
  const {
    modulo, inversor, perdas = PERDAS_PADRAO,
    tempAmbiente = 25, irradiancia = 700, fdi = 1
  } = opcoes;

  const tc = tempCelula(tempAmbiente, irradiancia, modulo.noct);
  const fatorTemp = 1 + modulo.coefP / 100 * (tc - 25);

  let fatorPerdas = 1;
  for (const v of Object.values(perdas)) fatorPerdas *= (1 - v / 100);

  /* corte por sobrecarga: só o que passa da potência CA é perdido */
  const cortePico = fdi > 1 ? Math.max(0, 1 - 1 / fdi) * 0.12 : 0;

  return {
    total: fatorTemp * fatorPerdas * inversor.eficiencia * (1 - cortePico),
    tempCelula: tc,
    fatorTemp,
    fatorPerdas,
    eficienciaInversor: inversor.eficiencia,
    cortePico
  };
}

/** Quantas unidades de um inversor atendem uma quantidade de módulos. */
export function unidadesNecessarias(nModulos, modulo, inversor, tMin = 5, tMax = 70) {
  if (inversor.micro)
    return Math.ceil(nModulos / (inversor.mppt * (inversor.stringsPorMppt || 1)));
  const faixa = faixaSerie(modulo, inversor, tMin, tMax);
  if (faixa.max < 1) return 1;
  const porUnidade = faixa.max * inversor.mppt * inversor.stringsPorMppt;
  return Math.max(1, Math.ceil(nModulos / porUnidade));
}

/** Sugere o inversor mais adequado para uma potência de arranjo. */
export function sugerirInversor(potenciaCC, trifasico = false) {
  const alvo = potenciaCC / 1.15;   // sobrecarga saudável de ~15%
  const candidatos = INVERSORES
    .filter(i => !i.micro && (trifasico ? i.fases === 3 : true))
    .sort((a, b) => Math.abs(a.ca - alvo) - Math.abs(b.ca - alvo));
  return candidatos[0] || INVERSORES[0];
}
