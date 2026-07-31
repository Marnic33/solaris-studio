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
export async function buscarCEP(cep) {
  try {
    const r = await fetch(`/api/cep?cep=${cep}`);
    if (r.ok) return await r.json();
    const e = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error(e.erro || 'CEP não encontrado');
  } catch (err) {
    if (String(err.message).includes('não encontrado')) throw err;
  }
  const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (!r.ok) throw new Error('CEP não encontrado');
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
