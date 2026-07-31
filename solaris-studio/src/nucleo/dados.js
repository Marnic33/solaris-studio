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
