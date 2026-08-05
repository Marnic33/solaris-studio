/**
 * Relatório em PDF da proposta técnica.
 *
 * Monta um documento de 3 a 4 páginas com a imagem da simulação, o
 * dimensionamento, a curva de geração, a análise econômica e a lista de
 * materiais. Pensado para ser entregue ao cliente e anexado à proposta.
 */
import { jsPDF } from 'jspdf';

/* paleta impressa — a da tela é escura demais para papel */
const COR = {
  tinta:   [24, 30, 38],
  suave:   [110, 122, 136],
  linha:   [214, 220, 228],
  ambar:   [196, 132, 0],
  ciano:   [22, 122, 118],
  alerta:  [186, 70, 48],
  fundo:   [246, 248, 250]
};

const brl = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
const num = (v, d = 0) => Number(v || 0).toLocaleString('pt-BR',
  { minimumFractionDigits: d, maximumFractionDigits: d });

export function gerarRelatorio(dados) {
  const { projeto, sistema, geracao, economia, materiais, imagem, local, ressalvas } = dados;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 210, A = 297, M = 16;   // largura, altura, margem
  let y = 0;

  /* ---------------------------------------------------------------- capa */
  doc.setFillColor(...COR.tinta);
  doc.rect(0, 0, L, 52, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('SOLARIS STUDIO', M, 24);
  doc.setFillColor(...COR.ambar);
  doc.rect(M, 28, 26, 1.4, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(190, 200, 212);
  doc.text('TRINITY SOLARIS BRASIL  ·  PROPOSTA TÉCNICA', M, 38);
  doc.setFontSize(8);
  doc.text('trinitysolarisbrasil.com.br  ·  contato@trinitysolarisbrasil.com.br', M, 45);

  y = 66;
  doc.setTextColor(...COR.tinta);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(projeto.nome || 'Projeto fotovoltaico', M, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COR.suave);
  const linhaCliente = [
    projeto.cliente ? `Cliente: ${projeto.cliente}` : null,
    projeto.data ? `Data: ${projeto.data}` : null
  ].filter(Boolean).join('     ');
  if (linhaCliente) { doc.text(linhaCliente, M, y); y += 6; }
  if (local && local.endereco) {
    doc.text(doc.splitTextToSize(local.endereco, L - 2 * M), M, y);
    y += 6;
  }

  /* imagem da simulação */
  y += 4;
  if (imagem) {
    const larg = L - 2 * M;
    const alt = Math.min(88, larg * 0.52);
    try {
      doc.addImage(imagem, 'JPEG', M, y, larg, alt, undefined, 'FAST');
      doc.setDrawColor(...COR.linha);
      doc.rect(M, y, larg, alt);
      y += alt + 8;
    } catch (_) { y += 2; }
  }

  /* números de destaque */
  const destaques = [
    ['POTÊNCIA', `${num(sistema.kwp, 2)} kWp`],
    ['GERAÇÃO', `${num(geracao.media)} kWh/mês`],
    ['ECONOMIA', economia ? `${brl(economia.economiaMes1)}/mês` : '—']
  ];
  const larguraCaixa = (L - 2 * M - 8) / 3;
  destaques.forEach(([rot, val], i) => {
    const x = M + i * (larguraCaixa + 4);
    doc.setFillColor(...COR.fundo);
    doc.rect(x, y, larguraCaixa, 20, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...COR.suave);
    doc.text(rot, x + 4, y + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...COR.ambar);
    doc.text(val, x + 4, y + 15);
    doc.setFont('helvetica', 'normal');
  });
  y += 30;

  rodape(doc, 1);

  /* ------------------------------------------------------- página técnica */
  doc.addPage();
  y = M + 6;
  titulo(doc, 'DIMENSIONAMENTO', M, y); y += 10;

  const tecnicas = [
    ['Módulos', `${sistema.modulos} × ${sistema.moduloNome}`],
    ['Potência instalada', `${num(sistema.kwp, 2)} kWp`],
    ['Área ocupada', `${num(sistema.area, 1)} m²`],
    ['Peso total', `${num(sistema.peso)} kg`],
    ['Inversor', sistema.inversor || '—'],
    ['Configuração', sistema.strings || '—'],
    ['Fator de dimensionamento', sistema.fdi ? `${num(sistema.fdi)}%` : '—'],
    ['Estrutura', sistema.fixacao || '—'],
    ['Inclinação', `${num(sistema.inclinacao)}°`],
    ['Orientação', sistema.orientacao || '—']
  ];
  y = tabela(doc, tecnicas, M, y, L - 2 * M);

  y += 8;
  titulo(doc, 'GERAÇÃO ESTIMADA', M, y); y += 8;
  y = grafico(doc, geracao.meses, M, y, L - 2 * M, 46);
  y += 6;
  doc.setFontSize(8.5);
  doc.setTextColor(...COR.suave);
  const notaGeracao =
    `Total anual de ${num(geracao.total)} kWh, média de ${num(geracao.media)} kWh por mês. ` +
    (geracao.fonte ? `Irradiação: ${geracao.fonte}. ` : '') +
    (geracao.perdaSombra ? `Sombreamento descontado: ${num(geracao.perdaSombra, 1)}%. ` : '') +
    (geracao.pr ? `Desempenho do sistema: ${num(geracao.pr, 1)}%.` : '');
  doc.text(doc.splitTextToSize(notaGeracao, L - 2 * M), M, y);
  y += 14;

  if (materiais && materiais.length) {
    titulo(doc, 'MATERIAIS', M, y); y += 8;
    y = tabela(doc, materiais.map(m => [m[0], `${m[2]}   ${m[1] !== '—' ? m[1] : ''}`.trim()]),
               M, y, L - 2 * M);
  }
  rodape(doc, 2);

  /* ------------------------------------------------------ página econômica */
  if (economia) {
    doc.addPage();
    y = M + 6;
    titulo(doc, 'ANÁLISE ECONÔMICA', M, y); y += 10;

    const eco = [
      ['Investimento', brl(economia.investimento)],
      ['Economia no primeiro ano', brl(economia.economiaAno1)],
      ['Retorno do investimento', economia.paybackSimples ? `${num(economia.paybackSimples, 1)} anos` : '—'],
      ['Retorno descontado', economia.paybackDescontado ? `${num(economia.paybackDescontado, 1)} anos` : '—'],
      ['Taxa interna de retorno', economia.tir !== null ? `${num(economia.tir, 1)}% ao ano` : '—'],
      ['Valor presente líquido (25 anos)', brl(economia.vpl)],
      ['Economia acumulada (25 anos)', brl(economia.economia25)],
      ['Custo da energia gerada', economia.lcoe ? `R$ ${num(economia.lcoe, 3)}/kWh` : '—']
    ];
    y = tabela(doc, eco, M, y, L - 2 * M);

    y += 8;
    titulo(doc, 'RETORNO ACUMULADO', M, y); y += 8;
    y = graficoFluxo(doc, economia.linhas, M, y, L - 2 * M, 44);

    y += 8;
    doc.setFontSize(8.5);
    doc.setTextColor(...COR.suave);
    const notaFioB =
      `A Lei 14.300/2022 institui cobrança escalonada do TUSD Fio B sobre a energia ` +
      `compensada. Para conexão em ${economia.anoConexao}, a cobrança é de ` +
      `${num(economia.pctFioBInicial * 100)}% no primeiro ano, chegando a 100% em 2029. ` +
      `Ao longo de 25 anos essa parcela representa ${brl(economia.fioB25)}, já descontada ` +
      `dos números acima. Tarifa considerada: R$ ${num(economia.tarifa, 2)}/kWh com ` +
      `reajuste anual de ${num(economia.inflacao * 100, 1)}%.`;
    doc.text(doc.splitTextToSize(notaFioB, L - 2 * M), M, y);
    rodape(doc, 3);
  }

  /* --------------------------------------------------------- ressalvas */
  doc.addPage();
  y = M + 6;
  titulo(doc, 'CONSIDERAÇÕES TÉCNICAS', M, y); y += 10;

  const padrao = [
    'Os valores de geração são estimativa de anteprojeto, calculada a partir de ' +
    'irradiação de referência e do modelo de sombreamento tridimensional. A produção ' +
    'real varia com o clima do ano, a limpeza dos módulos e a disponibilidade da rede.',

    'O sombreamento calculado é geométrico. O efeito elétrico de sombra parcial, ' +
    'que depende dos diodos de bypass e do arranjo das strings, tende a ser maior ' +
    'que o percentual aqui indicado.',

    'As quantidades de material são estimativas para orçamento. Confirme contra o ' +
    'manual do fabricante da estrutura antes da compra.',

    'Este documento não substitui o projeto executivo. A fixação e o lastro precisam ' +
    'de verificação de carga de vento pela NBR 6123, e a instalação elétrica deve ' +
    'seguir a NBR 5410 e a NBR 16690, com ART recolhida por profissional habilitado.',

    'A conexão à rede depende de parecer de acesso favorável da distribuidora, ' +
    'conforme a REN ANEEL 1.000/2021. Prazos e eventuais obras de reforço são ' +
    'definidos pela concessionária.',

    'Valores de tarifa, tributos e Fio B mudam por distribuidora e são reajustados ' +
    'anualmente. Confirme na conta de energia do cliente.'
  ];
  (ressalvas && ressalvas.length ? ressalvas : padrao).forEach(t => {
    doc.setFillColor(...COR.ambar);
    doc.rect(M, y - 3, 1.2, 4, 'F');
    doc.setFontSize(9);
    doc.setTextColor(...COR.tinta);
    const linhas = doc.splitTextToSize(t, L - 2 * M - 6);
    doc.text(linhas, M + 5, y);
    y += linhas.length * 4.6 + 6;
  });

  y = Math.max(y, A - 60);
  doc.setDrawColor(...COR.linha);
  doc.line(M, y, L - M, y);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(...COR.suave);
  doc.text('Trinity Solaris Brasil  ·  CNPJ 65.882.004/0001-96', M, y);
  doc.text('contato@trinitysolarisbrasil.com.br', M, y + 5);
  rodape(doc, 4);

  return doc;
}

/* ==========================================================================
   Peças de desenho
   ========================================================================== */
function titulo(doc, texto, x, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COR.tinta);
  doc.text(texto, x, y);
  doc.setDrawColor(...COR.ambar);
  doc.setLineWidth(0.6);
  doc.line(x, y + 2, x + 18, y + 2);
  doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'normal');
}

function tabela(doc, linhas, x, y, largura) {
  doc.setFontSize(9.5);
  linhas.forEach((l, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...COR.fundo);
      doc.rect(x, y - 4, largura, 7, 'F');
    }
    doc.setTextColor(...COR.suave);
    doc.text(String(l[0]), x + 3, y);
    doc.setTextColor(...COR.tinta);
    doc.text(String(l[1]), x + largura - 3, y, { align: 'right' });
    y += 7;
  });
  return y;
}

function grafico(doc, meses, x, y, largura, altura) {
  const nomes = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  const max = Math.max(...meses, 1);
  const passo = largura / 12;
  const larguraBarra = passo * 0.6;

  doc.setDrawColor(...COR.linha);
  doc.line(x, y + altura, x + largura, y + altura);

  meses.forEach((v, i) => {
    const h = (v / max) * (altura - 6);
    const bx = x + i * passo + (passo - larguraBarra) / 2;
    doc.setFillColor(...COR.ambar);
    doc.rect(bx, y + altura - h, larguraBarra, h, 'F');
    doc.setFontSize(6.5);
    doc.setTextColor(...COR.suave);
    doc.text(nomes[i], bx + larguraBarra / 2, y + altura + 4, { align: 'center' });
    doc.setFontSize(5.8);
    doc.text(num(v), bx + larguraBarra / 2, y + altura - h - 1.5, { align: 'center' });
  });
  return y + altura + 6;
}

function graficoFluxo(doc, linhas, x, y, largura, altura) {
  if (!linhas || !linhas.length) return y;
  const vals = linhas.map(l => l.acumulado);
  const min = Math.min(0, ...vals), max = Math.max(...vals, 1);
  const faixa = max - min || 1;
  const passo = largura / (linhas.length - 1 || 1);
  const yDe = v => y + altura - ((v - min) / faixa) * altura;

  /* linha do zero */
  doc.setDrawColor(...COR.linha);
  doc.line(x, yDe(0), x + largura, yDe(0));

  doc.setDrawColor(...COR.ciano);
  doc.setLineWidth(0.8);
  for (let i = 1; i < linhas.length; i++) {
    doc.line(x + (i - 1) * passo, yDe(vals[i - 1]), x + i * passo, yDe(vals[i]));
  }
  doc.setLineWidth(0.2);

  /* marca o ano em que o investimento se paga */
  const virada = vals.findIndex(v => v >= 0);
  if (virada > 0) {
    const vx = x + virada * passo;
    doc.setDrawColor(...COR.ambar);
    doc.line(vx, y, vx, y + altura);
    doc.setFontSize(7);
    doc.setTextColor(...COR.ambar);
    doc.text(`ano ${virada + 1}`, vx + 1.5, y + 4);
  }

  doc.setFontSize(6.5);
  doc.setTextColor(...COR.suave);
  doc.text(brl(min), x, y + altura + 4);
  doc.text(brl(max), x + largura, y + altura + 4, { align: 'right' });
  return y + altura + 8;
}

function rodape(doc, pagina) {
  const L = 210, A = 297;
  doc.setFontSize(7.5);
  doc.setTextColor(...COR.suave);
  doc.text('Solaris Studio · Trinity Solaris Brasil', 16, A - 10);
  doc.text(String(pagina), L - 16, A - 10, { align: 'right' });
}
