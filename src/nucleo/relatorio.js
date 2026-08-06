/**
 * Relatório em PDF da proposta técnica.
 *
 * Monta um documento de 3 a 4 páginas com a imagem da simulação, o
 * dimensionamento, a curva de geração, a análise econômica e a lista de
 * materiais. Pensado para ser entregue ao cliente e anexado à proposta.
 */

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

/**
 * Anexo técnico da proposta — 2 páginas, linguagem de cliente.
 *
 * Não é o memorial de cálculo: é a peça que acompanha a proposta comercial e
 * mostra, de forma compreensível, que houve estudo de verdade. Números
 * elétricos detalhados ficam no briefing técnico, não aqui.
 */
export async function gerarRelatorio(dados) {
  const { jsPDF } = await import('jspdf');
  const { projeto, sistema, geracao, materiais, imagem, local, analise } = dados;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 210, A = 297, M = 16;
  let y = 0;

  /* ============================ PÁGINA 1 ============================ */
  doc.setFillColor(...COR.tinta);
  doc.rect(0, 0, L, 46, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('ESTUDO TÉCNICO', M, 22);
  doc.setFillColor(...COR.ambar);
  doc.rect(M, 26, 24, 1.3, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(190, 200, 212);
  doc.text('TRINITY SOLARIS BRASIL  ·  SIMULAÇÃO FOTOVOLTAICA', M, 34);
  doc.setFontSize(7.5);
  doc.text('Anexo à proposta comercial', M, 40);

  y = 58;
  doc.setTextColor(...COR.tinta);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(projeto.nome || 'Projeto fotovoltaico', M, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COR.suave);
  const cab = [projeto.cliente, projeto.data].filter(Boolean).join('     ');
  if (cab) { doc.text(cab, M, y); y += 5; }
  if (local && local.endereco) {
    doc.text(doc.splitTextToSize(local.endereco, L - 2 * M), M, y);
    y += 6;
  }

  /* imagem da simulação — o argumento visual mais forte */
  y += 3;
  if (imagem) {
    const larg = L - 2 * M, alt = Math.min(84, larg * 0.5);
    try {
      doc.addImage(imagem, 'JPEG', M, y, larg, alt, undefined, 'FAST');
      doc.setDrawColor(...COR.linha);
      doc.rect(M, y, larg, alt);
      y += alt + 3;
      doc.setFontSize(7.5);
      doc.setTextColor(...COR.suave);
      doc.text('Simulação tridimensional do telhado, com a posição real dos módulos.',
               M, y + 3);
      y += 10;
    } catch (_) { y += 2; }
  }

  /* três números que o cliente entende */
  const dest = [
    ['POTÊNCIA', `${num(sistema.kwp, 2)} kWp`, `${sistema.modulos} módulos`],
    ['GERAÇÃO', `${num(geracao.media)} kWh`, 'média por mês'],
    ['COBERTURA', geracao.cobertura ? `${num(geracao.cobertura)}%` : '—', 'do seu consumo']
  ];
  const lc = (L - 2 * M - 8) / 3;
  dest.forEach(([rot, val, sub], i) => {
    const x = M + i * (lc + 4);
    doc.setFillColor(...COR.fundo);
    doc.rect(x, y, lc, 24, 'F');
    doc.setFillColor(...COR.ambar);
    doc.rect(x, y, 1.2, 24, 'F');
    doc.setFontSize(6.5);
    doc.setTextColor(...COR.suave);
    doc.text(rot, x + 4, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...COR.tinta);
    doc.text(val, x + 4, y + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COR.suave);
    doc.text(sub, x + 4, y + 20);
  });
  y += 32;

  titulo(doc, 'GERAÇÃO AO LONGO DO ANO', M, y); y += 8;
  y = grafico(doc, geracao.meses, M, y, L - 2 * M, 40);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(...COR.suave);
  doc.text(doc.splitTextToSize(
    `Total estimado de ${num(geracao.total)} kWh por ano. A variação entre os meses é ` +
    `natural: no inverno o sol fica mais baixo e os dias são mais curtos.`,
    L - 2 * M), M, y);

  rodape(doc, 1);

  /* ============================ PÁGINA 2 ============================ */
  doc.addPage();
  y = M + 6;
  titulo(doc, 'O QUE FOI ANALISADO', M, y); y += 10;

  const itens = [
    ['Telhado medido em três dimensões',
     `${sistema.superficie}, inclinação de ${num(sistema.inclinacao)}° voltada para ` +
     `${sistema.orientacao}.`],
    ['Posição do sol hora a hora',
     `Cálculo astronômico para as coordenadas exatas do imóvel, ao longo dos doze meses.`],
    ['Irradiação solar do local',
     geracao.fonte ? `Dados de ${geracao.fonte}.` :
       'Irradiação de referência para a região.'],
    ['Sombreamento simulado',
     geracao.perdaSombra != null
       ? `Sombra de obstáculos e das próprias fileiras verificada ao longo do ano. ` +
         `Perda considerada: ${num(geracao.perdaSombra, 1)}%.`
       : 'Não foi identificado obstáculo relevante no levantamento.'],
    ['Perdas reais do sistema',
     `Temperatura dos módulos, sujeira, cabeamento e rendimento do inversor. ` +
     `Aproveitamento final de ${num(geracao.pr, 1)}%.`],
    ['Equipamentos verificados',
     `${sistema.inversor}. Tensões e correntes conferidas contra os limites do fabricante.`],
    ['Estrutura dimensionada',
     `${sistema.fixacao} Quantidades contadas peça a peça sobre a geometria do telhado.`]
  ];
  itens.forEach(([t, d]) => {
    doc.setFillColor(...COR.ciano);
    doc.circle(M + 1.6, y - 1.2, 1.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COR.tinta);
    doc.text(t, M + 7, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COR.suave);
    const linhas = doc.splitTextToSize(d, L - 2 * M - 7);
    doc.text(linhas, M + 7, y + 4.5);
    y += 4.5 + linhas.length * 4 + 5;
  });

  if (analise && analise.length) {
    y += 2;
    titulo(doc, 'OBSERVAÇÕES DO PROJETO', M, y); y += 8;
    analise.slice(0, 4).forEach(t => {
      doc.setFillColor(...COR.ambar);
      doc.rect(M, y - 3, 1.2, 4, 'F');
      doc.setFontSize(8.5);
      doc.setTextColor(...COR.tinta);
      const linhas = doc.splitTextToSize(t, L - 2 * M - 6);
      doc.text(linhas, M + 5, y);
      y += linhas.length * 4.3 + 5;
    });
  }

  /* ressalvas curtas, em linguagem de cliente */
  y = Math.max(y + 4, A - 72);
  doc.setFillColor(...COR.fundo);
  doc.rect(M, y - 5, L - 2 * M, 40, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COR.tinta);
  doc.text('IMPORTANTE', M + 4, y + 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...COR.suave);
  doc.text(doc.splitTextToSize(
    'Os valores de geração são estimativa de projeto. A produção real varia com o clima ' +
    'de cada ano e com a limpeza dos módulos. A instalação segue as normas NBR 5410 e ' +
    'NBR 16690, com responsabilidade técnica registrada, e a conexão à rede depende de ' +
    'aprovação da distribuidora conforme a REN ANEEL 1.000/2021.',
    L - 2 * M - 8), M + 4, y + 7);

  y = A - 24;
  doc.setDrawColor(...COR.linha);
  doc.line(M, y, L - M, y);
  doc.setFontSize(8);
  doc.setTextColor(...COR.suave);
  doc.text('Trinity Solaris Brasil  ·  CNPJ 65.882.004/0001-96', M, y + 6);
  doc.text('contato@trinitysolarisbrasil.com.br', M, y + 11);
  rodape(doc, 2);

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
