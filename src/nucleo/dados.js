/**
 * Irradiação medida. Chama a função serverless /api/irradiacao,
 * que consulta NASA POWER e, se falhar, PVGIS.
 */
export async function buscarIrradiacao(lat, lon) {
  const r = await fetch(`/api/irradiacao?lat=${lat}&lon=${lon}`);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.erro || `HTTP ${r.status}`);
  }
  const d = await r.json();
  if (!Array.isArray(d.mensal) || d.mensal.length !== 12) throw new Error('resposta inesperada');
  return d;   // { fonte, mensal: [12] kWh/m²/dia, media, lat, lon }
}

/**
 * CEP -> coordenadas. Usa /api/cep, que faz a cascata no servidor.
 * Se a função não estiver disponível (arquivo aberto solto, sem Vercel),
 * tenta a BrasilAPI direto — que costuma vir sem coordenada.
 */
export async function buscarCEP(termo) {
  const cep = String(termo).replace(/\D/g, '');
  try {
    const r = await fetch(`/api/local?q=${encodeURIComponent(termo)}`);
    if (r.ok) return await r.json();
    const e = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error(e.erro || 'CEP não encontrado');
  } catch (err) {
    if (String(err.message).includes('não encontrado')) throw err;
  }
  if (cep.length !== 8) throw new Error('sem o servidor, só CEP funciona aqui');
  const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (!r.ok) throw new Error('endereço não encontrado');
  const d = await r.json();
  const c = d.location && d.location.coordinates;
  if (!c || !c.latitude) throw new Error('sem coordenada e sem o servidor para geocodificar');
  return {
    cep, cidade: d.city, uf: d.state,
    logradouro: d.street || '', bairro: d.neighborhood || '',
    lat: +Number(c.latitude).toFixed(5), lon: +Number(c.longitude).toFixed(5),
    precisao: 'coordenada do CEP'
  };
}

const LIMITE_MB = 8;

/**
 * Tipo do arquivo. O navegador nem sempre informa — no Android o seletor
 * costuma devolver string vazia — então a extensão serve de reserva.
 */
function tipoDoArquivo(arquivo) {
  if (arquivo.type) return arquivo.type;
  const ext = String(arquivo.name || '').toLowerCase().split('.').pop();
  return { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
           png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || '';
}

/** Lê o arquivo como base64, sem o prefixo data:. */
function paraBase64(arquivo) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const t = String(r.result);
      const virgula = t.indexOf(',');
      res(virgula >= 0 ? t.slice(virgula + 1) : t);
    };
    r.onerror = () => rej(new Error('não consegui ler o arquivo'));
    r.readAsDataURL(arquivo);
  });
}

async function enviarArquivo(rota, arquivo) {
  const mb = arquivo.size / 1048576;
  if (mb > LIMITE_MB)
    throw new Error(`arquivo de ${mb.toFixed(1)} MB — o limite é ${LIMITE_MB} MB. ` +
                    `Reduza a resolução da foto ou envie só a primeira página do PDF.`);
  const dados = await paraBase64(arquivo);
  const r = await fetch(rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dados, tipo: tipoDoArquivo(arquivo), nome: arquivo.name })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error([d.erro, d.dica].filter(Boolean).join(' ') || `HTTP ${r.status}`);
  return d;
}

/** Envia a conta de energia para /api/conta e devolve os dados extraídos. */
export const lerConta = arquivo => enviarArquivo('/api/conta', arquivo);

/** Envia um datasheet para /api/datasheet e devolve o equipamento estruturado. */
export const lerDatasheet = arquivo => enviarArquivo('/api/datasheet', arquivo);
