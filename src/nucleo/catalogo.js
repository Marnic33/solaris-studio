/**
 * Catálogo de equipamentos — Trinity Solaris / distribuidor Aldo Solar.
 *
 * Este arquivo é o banco de dados do Solaris Studio. Editá-lo pelo GitHub
 * atualiza o simulador no próximo deploy, sem tocar em código.
 *
 * COMO ADICIONAR UM EQUIPAMENTO
 * Copie um bloco existente, troque os valores conforme o datasheet e salve.
 * Os campos marcados como obrigatórios alimentam a validação de string.
 *
 * ATENÇÃO: os valores abaixo são típicos das linhas citadas e servem de ponto
 * de partida. Antes de assinar projeto, confirme no datasheet do modelo exato —
 * principalmente Voc máxima, faixa de MPPT e corrente por entrada.
 */

export const VERSAO_CATALOGO = '2026-08-02';

/* ==========================================================================
   MÓDULOS
   ========================================================================== */
export const MODULOS = [
  {
    id:'jinko-620n', fabricante:'Jinko Solar', linha:'Tiger Neo N-Type',
    wp:620, tecnologia:'N-Type TOPCon bifacial', celulas:156,
    comprimento:2465, largura:1134, espessura:30, peso:34.6,
    voc:54.4, vmp:45.6, isc:14.4, imp:13.6,
    coefVoc:-0.25, coefP:-0.29, noct:45, eficiencia:22.2,
    garantiaProduto:15, garantiaPotencia:30, distribuidor:'Aldo Solar'
  },
  {
    id:'jinko-585n', fabricante:'Jinko Solar', linha:'Tiger Neo N-Type',
    wp:585, tecnologia:'N-Type TOPCon', celulas:144,
    comprimento:2278, largura:1134, espessura:30, peso:32.0,
    voc:52.0, vmp:43.6, isc:14.2, imp:13.4,
    coefVoc:-0.25, coefP:-0.29, noct:45, eficiencia:22.6,
    garantiaProduto:15, garantiaPotencia:30, distribuidor:'Aldo Solar'
  },
  {
    id:'canadian-550', fabricante:'Canadian Solar', linha:'HiKu6 Mono PERC',
    wp:550, tecnologia:'Mono PERC', celulas:144,
    comprimento:2279, largura:1134, espessura:35, peso:28.6,
    voc:49.6, vmp:41.7, isc:14.0, imp:13.2,
    coefVoc:-0.26, coefP:-0.34, noct:41, eficiencia:21.3,
    garantiaProduto:12, garantiaPotencia:25, distribuidor:'Aldo Solar'
  },
  {
    id:'trina-450', fabricante:'Trina Solar', linha:'Vertex S',
    wp:450, tecnologia:'Mono PERC', celulas:120,
    comprimento:2094, largura:1038, espessura:35, peso:24.5,
    voc:41.4, vmp:34.6, isc:13.8, imp:13.0,
    coefVoc:-0.25, coefP:-0.34, noct:43, eficiencia:20.7,
    garantiaProduto:12, garantiaPotencia:25, distribuidor:'Aldo Solar'
  },
  {
    id:'ja-700', fabricante:'JA Solar', linha:'DeepBlue 4.0 Pro',
    wp:700, tecnologia:'N-Type bifacial', celulas:132,
    comprimento:2384, largura:1303, espessura:33, peso:38.5,
    voc:58.6, vmp:49.2, isc:15.2, imp:14.3,
    coefVoc:-0.24, coefP:-0.29, noct:45, eficiencia:22.5,
    garantiaProduto:15, garantiaPotencia:30, distribuidor:'Aldo Solar'
  }
];

/* ==========================================================================
   INVERSORES
   mppt ......... número de rastreadores independentes
   stringsPorMppt número de strings que cada MPPT aceita
   vMin/vMax .... faixa de operação do MPPT e tensão máxima de entrada
   iMaxMppt ..... corrente máxima por entrada
   ========================================================================== */
export const INVERSORES = [
  { id:'gw3000ns', fabricante:'GoodWe', nome:'GW3000-NS', ca:3000, ccMax:4500,
    fases:1, tensaoCA:220, mppt:1, stringsPorMppt:1,
    vMin:80, vMax:500, vPartida:100, iMaxMppt:16, eficiencia:0.972,
    tipo:'string', garantia:10, distribuidor:'Aldo Solar' },

  { id:'gw5000ns', fabricante:'GoodWe', nome:'GW5000-NS', ca:5000, ccMax:7500,
    fases:1, tensaoCA:220, mppt:2, stringsPorMppt:1,
    vMin:80, vMax:500, vPartida:100, iMaxMppt:16, eficiencia:0.975,
    tipo:'string', garantia:10, distribuidor:'Aldo Solar' },

  { id:'gw6000ns', fabricante:'GoodWe', nome:'GW6000-NS', ca:6000, ccMax:9000,
    fases:1, tensaoCA:220, mppt:2, stringsPorMppt:1,
    vMin:80, vMax:500, vPartida:100, iMaxMppt:16, eficiencia:0.976,
    tipo:'string', garantia:10, distribuidor:'Aldo Solar' },

  { id:'gw8500et', fabricante:'GoodWe', nome:'GW8.5K-ET Híbrido', ca:8500, ccMax:12750,
    fases:3, tensaoCA:380, mppt:2, stringsPorMppt:1,
    vMin:150, vMax:1000, vPartida:180, iMaxMppt:16, eficiencia:0.980,
    tipo:'híbrido', baterias:true, garantia:10, distribuidor:'Aldo Solar' },

  { id:'gw10kdt', fabricante:'GoodWe', nome:'GW10K-DT', ca:10000, ccMax:15000,
    fases:3, tensaoCA:380, mppt:2, stringsPorMppt:1,
    vMin:180, vMax:1000, vPartida:200, iMaxMppt:16, eficiencia:0.983,
    tipo:'string', garantia:10, distribuidor:'Aldo Solar' },

  { id:'gw15kdt', fabricante:'GoodWe', nome:'GW15K-DT', ca:15000, ccMax:22500,
    fases:3, tensaoCA:380, mppt:2, stringsPorMppt:2,
    vMin:180, vMax:1000, vPartida:200, iMaxMppt:22, eficiencia:0.984,
    tipo:'string', garantia:10, distribuidor:'Aldo Solar' },

  { id:'gw20kmt', fabricante:'GoodWe', nome:'GW20K-MT', ca:20000, ccMax:30000,
    fases:3, tensaoCA:380, mppt:2, stringsPorMppt:2,
    vMin:200, vMax:1100, vPartida:200, iMaxMppt:30, eficiencia:0.985,
    tipo:'string', garantia:10, distribuidor:'Aldo Solar' },

  { id:'gw25kmt', fabricante:'GoodWe', nome:'GW25K-MT', ca:25000, ccMax:37500,
    fases:3, tensaoCA:380, mppt:3, stringsPorMppt:2,
    vMin:200, vMax:1100, vPartida:200, iMaxMppt:30, eficiencia:0.985,
    tipo:'string', garantia:10, distribuidor:'Aldo Solar' },

  { id:'gw50kmt', fabricante:'GoodWe', nome:'GW50K-MT', ca:50000, ccMax:75000,
    fases:3, tensaoCA:380, mppt:4, stringsPorMppt:2,
    vMin:200, vMax:1100, vPartida:200, iMaxMppt:30, eficiencia:0.986,
    tipo:'string', garantia:10, distribuidor:'Aldo Solar' },

  { id:'growatt-neo2250', fabricante:'Growatt', nome:'NEO 2250M-X2', ca:2250, ccMax:3000,
    fases:1, tensaoCA:220, mppt:2, stringsPorMppt:1,
    vMin:25, vMax:60, vPartida:30, iMaxMppt:20, eficiencia:0.966,
    tipo:'microinversor', micro:true, garantia:12, distribuidor:'Aldo Solar' },

  { id:'growatt-neo1300', fabricante:'Growatt', nome:'NEO 1300M-X', ca:1300, ccMax:1800,
    fases:1, tensaoCA:220, mppt:1, stringsPorMppt:1,
    vMin:25, vMax:60, vPartida:30, iMaxMppt:20, eficiencia:0.965,
    tipo:'microinversor', micro:true, garantia:12, distribuidor:'Aldo Solar' },

  { id:'deye-sun5k', fabricante:'Deye', nome:'SUN-5K-SG04LP3', ca:5000, ccMax:7500,
    fases:3, tensaoCA:380, mppt:2, stringsPorMppt:1,
    vMin:150, vMax:800, vPartida:160, iMaxMppt:16, eficiencia:0.978,
    tipo:'híbrido', baterias:true, garantia:10, distribuidor:'Aldo Solar' },

  { id:'deye-sun12k', fabricante:'Deye', nome:'SUN-12K-SG04LP3', ca:12000, ccMax:18000,
    fases:3, tensaoCA:380, mppt:2, stringsPorMppt:2,
    vMin:150, vMax:800, vPartida:160, iMaxMppt:26, eficiencia:0.981,
    tipo:'híbrido', baterias:true, garantia:10, distribuidor:'Aldo Solar' }
];

/* ==========================================================================
   BATERIAS
   ========================================================================== */
export const BATERIAS = [
  { id:'unipower-lfp5', fabricante:'Unipower', nome:'Slim LFP 5,12 kWh',
    quimica:'LiFePO4', capacidadeKwh:5.12, tensao:51.2, correnteMax:100,
    ciclos:6000, profundidade:0.95, garantia:5, distribuidor:'Aldo Solar' },
  { id:'goodwe-lynx-f', fabricante:'GoodWe', nome:'Lynx Home F G2 6,4 kWh',
    quimica:'LiFePO4', capacidadeKwh:6.4, tensao:51.2, correnteMax:100,
    ciclos:6000, profundidade:0.90, garantia:10, distribuidor:'Aldo Solar' }
];

/* ==========================================================================
   Consultas
   ========================================================================== */
export const acharModulo   = id => todosModulos().find(m => m.id === id);
export const acharInversor = id => todosInversores().find(i => i.id === id);

/** Inversores compatíveis com uma potência de arranjo, ordenados por aderência. */
export function inversoresPara(potenciaCC, { trifasico = null, hibrido = null } = {}) {
  const alvo = potenciaCC / 1.15;
  return todosInversores()
    .filter(i => !i.micro)
    .filter(i => trifasico === null || (trifasico ? i.fases === 3 : i.fases === 1))
    .filter(i => hibrido === null || (hibrido ? !!i.baterias : true))
    .filter(i => potenciaCC <= i.ccMax)
    .map(i => ({ ...i, fdi: potenciaCC / i.ca, aderencia: Math.abs(i.ca - alvo) }))
    .sort((a, b) => a.aderencia - b.aderencia);
}

/** Quantidade de módulos para atender a um consumo mensal. */
export function dimensionarPorConsumo(consumoKwhMes, hsp, potenciaWp, pr = 0.80) {
  const geracaoPorModulo = (potenciaWp / 1000) * hsp * 30 * pr;
  const n = Math.ceil(consumoKwhMes / geracaoPorModulo);
  return {
    modulos: n,
    potenciaKwp: +(n * potenciaWp / 1000).toFixed(2),
    geracaoEstimada: Math.round(n * geracaoPorModulo),
    geracaoPorModulo: +geracaoPorModulo.toFixed(1)
  };
}

/* ==========================================================================
   Equipamentos importados de datasheet
   Ficam no navegador do usuário. Para virarem catálogo oficial, copie o JSON
   exportado e cole nas listas MODULOS / INVERSORES acima.
   ========================================================================== */
const CHAVE = 'solaris.equipamentos.v1';

function ler() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || { modulos: [], inversores: [] }; }
  catch (_) { return { modulos: [], inversores: [] }; }
}
function gravar(d) {
  try { localStorage.setItem(CHAVE, JSON.stringify(d)); return true; }
  catch (_) { return false; }
}

export const importados = () => ler();

/** Salva um equipamento vindo do datasheet. Substitui se o id já existir. */
export function salvarEquipamento(eq) {
  const d = ler();
  const lista = eq.categoria === 'inversor' ? d.inversores : d.modulos;
  const i = lista.findIndex(x => x.id === eq.id);
  const registro = { ...eq, importadoEm: new Date().toISOString(), origem: 'datasheet' };
  if (i >= 0) lista[i] = registro; else lista.push(registro);
  gravar(d);
  return registro;
}

export function removerEquipamento(id, categoria) {
  const d = ler();
  const chave = categoria === 'inversor' ? 'inversores' : 'modulos';
  d[chave] = d[chave].filter(x => x.id !== id);
  gravar(d);
}

/** Listas completas: catálogo do repositório + importados do usuário. */
export const todosModulos   = () => [...MODULOS, ...ler().modulos];
export const todosInversores = () => [...INVERSORES, ...ler().inversores];

/* ==========================================================================
   TUSD Fio B por distribuidora — referência para estimativa
   ==========================================================================
   Valores aproximados em R$/kWh, sem tributos, para o grupo B (baixa tensão).
   A parcela Fio B é reajustada anualmente no processo tarifário de cada
   concessionária e varia com a bandeira e a alíquota de ICMS do estado.

   USE COMO PONTO DE PARTIDA, NUNCA COMO VALOR FINAL. O número correto está
   na conta do cliente, discriminado como "TUSD Fio B" ou na composição
   tarifária publicada pela distribuidora e pela ANEEL.
   ========================================================================== */
/* Nomes que aparecem na conta e não batem com o nome comercial. */
export const APELIDOS = {
  'eletropaulo':            'Enel SP',
  'ampla':                  'Enel Rio',
  'coelce':                 'Enel Ceará',
  'bandeirante':            'EDP SP',
  'escelsa':                'EDP ES',
  'aes sul':                'RGE',
  'ceee':                   'CEEE Equatorial',
  'celg':                   'Equatorial GO',
  'cepisa':                 'Equatorial PI',
  'cemar':                  'Equatorial MA',
  'celpa':                  'Equatorial PA',
  'ceb':                    'Neoenergia Brasília',
  'elektro':                'Elektro',
  'eletrobras amazonas':    'Amazonas Energia'
};

export const FIO_B_REFERENCIA = {
  'Equatorial GO':      0.30,
  'Equatorial PI':      0.31,
  'CPFL Paulista':      0.28,
  'CPFL Piratininga':   0.27,
  'Enel SP':            0.26,
  'Enel Rio':           0.31,
  'Enel Ceará':         0.29,
  'Light':              0.32,
  'Cemig':              0.30,
  'Copel':              0.24,
  'RGE':                0.27,
  'CEEE Equatorial':    0.29,
  'Celesc':             0.25,
  'Coelba (Neoenergia)':0.30,
  'Celpe (Neoenergia)': 0.30,
  'Cosern (Neoenergia)':0.29,
  'Elektro':            0.28,
  'EDP SP':             0.26,
  'EDP ES':             0.27,
  'Equatorial PA':      0.33,
  'Equatorial MA':      0.31,
  'Amazonas Energia':   0.34,
  'Energisa MT':        0.30,
  'Energisa MS':        0.29,
  'Neoenergia Brasília':0.25,
  'Sulgipe':            0.30
};

/** Busca o Fio B de referência aceitando o nome como vier da conta. */
export function fioBDe(distribuidora) {
  if (!distribuidora) return null;
  const limpa = t => String(t).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(s\.?a\.?|ltda|distribuicao|energia|eletrica|d)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

  let bruto = String(distribuidora).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  /* traduz nome de fachada para o nome comercial atual */
  for (const [apelido, atual] of Object.entries(APELIDOS)) {
    if (bruto.includes(apelido)) { distribuidora = atual; break; }
  }
  const alvo = limpa(distribuidora);
  const entradas = Object.entries(FIO_B_REFERENCIA)
    .map(([nome, valor]) => ({ nome, valor, chave: limpa(nome) }));

  /* 1ª passada: o nome inteiro da tabela aparece no texto da conta.
     Ordena do mais longo para o mais curto para que "cpfl piratininga"
     ganhe de "cpfl paulista" quando os dois começam igual. */
  const porTamanho = [...entradas].sort((a, b) => b.chave.length - a.chave.length);
  for (const e of porTamanho) {
    if (alvo.includes(e.chave) || e.chave.includes(alvo)) return e;
  }

  /* 2ª passada: casa por todas as palavras significativas em comum */
  let melhor = null, maisPalavras = 0;
  const palavrasAlvo = alvo.split(' ').filter(p => p.length > 2);
  for (const e of entradas) {
    const comuns = e.chave.split(' ')
      .filter(p => p.length > 2 && palavrasAlvo.includes(p)).length;
    if (comuns > maisPalavras) { maisPalavras = comuns; melhor = e; }
  }
  return maisPalavras > 0 ? melhor : null;
}
