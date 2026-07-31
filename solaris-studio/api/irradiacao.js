/**
 * Irradiação horizontal média mensal, em kWh/m²/dia.
 * Fonte primária: NASA POWER (climatologia). Reserva: PVGIS (Comissão Europeia).
 * Ambas são públicas e não exigem chave.
 */
const MESES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DIAS  = [31,28,31,30,31,30,31,31,30,31,30,31];

async function viaNasa(lat, lon) {
  const url = 'https://power.larc.nasa.gov/api/temporal/climatology/point'
    + `?parameters=ALLSKY_SFC_SW_DWN&community=RE&format=JSON`
    + `&latitude=${lat}&longitude=${lon}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('NASA POWER ' + r.status);
  const d = await r.json();
  const p = d?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
  if (!p) throw new Error('NASA POWER sem dados');
  const mensal = MESES.map(m => Number(p[m]));
  if (mensal.some(v => !isFinite(v) || v <= 0)) throw new Error('NASA POWER incompleto');
  return { fonte: 'NASA POWER (climatologia 1984-2023)', mensal };
}

async function viaPvgis(lat, lon) {
  const url = 'https://re.jrc.ec.europa.eu/api/v5_2/MRcalc'
    + `?lat=${lat}&lon=${lon}&horirrad=1&outputformat=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('PVGIS ' + r.status);
  const d = await r.json();
  const linhas = d?.outputs?.monthly;
  if (!Array.isArray(linhas)) throw new Error('PVGIS sem dados');
  const soma = Array(12).fill(0), n = Array(12).fill(0);
  for (const l of linhas) {
    const m = Number(l.month) - 1;
    const v = Number(l['H(h)_m']);          // kWh/m² no mês inteiro
    if (m >= 0 && m < 12 && isFinite(v)) { soma[m] += v; n[m]++; }
  }
  const mensal = soma.map((v, m) => n[m] ? (v / n[m]) / DIAS[m] : 0);
  if (mensal.some(v => v <= 0)) throw new Error('PVGIS incompleto');
  return { fonte: 'PVGIS (Comissão Europeia)', mensal };
}

export default async function handler(req, res) {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return res.status(400).json({ erro: 'coordenadas inválidas' });

  const erros = [];
  for (const fn of [viaNasa, viaPvgis]) {
    try {
      const d = await fn(lat, lon);
      const media = d.mensal.reduce((a, b) => a + b, 0) / 12;
      res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate');
      return res.status(200).json({
        ...d,
        mensal: d.mensal.map(v => +v.toFixed(2)),
        media: +media.toFixed(2),
        lat, lon
      });
    } catch (e) { erros.push(e.message); }
  }
  return res.status(502).json({ erro: 'nenhuma fonte respondeu', detalhe: erros });
}
