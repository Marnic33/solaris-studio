/**
 * Endereço ou CEP -> coordenadas.
 *
 * Aceita endereço livre com número ("Rua X, 123, São Paulo") ou CEP.
 *
 * 1. BrasilAPI v2 — endereço e, quando existe, a coordenada pronta
 * 2. ViaCEP — reserva para o endereço
 * 3. Nominatim (OpenStreetMap) — geocodifica logradouro, depois bairro, depois cidade
 * 4. Capital do estado — último recurso
 *
 * A geocodificação roda aqui e não no navegador porque a política do Nominatim
 * exige User-Agent identificando a aplicação, cabeçalho que o navegador não deixa definir.
 */
const UA = 'SolarisStudio/1.0 (contato@trinitysolarisbrasil.com.br)';

const CAPITAIS = {
  AC:[-9.97,-67.81], AL:[-9.65,-35.71], AP:[0.03,-51.07], AM:[-3.12,-60.02],
  BA:[-12.97,-38.50], CE:[-3.73,-38.52], DF:[-15.78,-47.93], ES:[-20.32,-40.34],
  GO:[-16.68,-49.25], MA:[-2.53,-44.30], MT:[-15.60,-56.10], MS:[-20.44,-54.65],
  MG:[-19.92,-43.94], PA:[-1.46,-48.50], PB:[-7.12,-34.86], PR:[-25.43,-49.27],
  PE:[-8.05,-34.88], PI:[-5.09,-42.80], RJ:[-22.91,-43.20], RN:[-5.79,-35.21],
  RS:[-30.03,-51.23], RO:[-8.76,-63.90], RR:[2.82,-60.67], SC:[-27.59,-48.55],
  SP:[-23.55,-46.63], SE:[-10.91,-37.07], TO:[-10.18,-48.33]
};

async function json(url, opcoes) {
  const r = await fetch(url, opcoes);
  if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
  return r.json();
}

async function endereco(cep) {
  try {
    const d = await json(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    const c = d.location && d.location.coordinates;
    return {
      cidade: d.city, uf: d.state,
      logradouro: d.street || '', bairro: d.neighborhood || '',
      lat: c && c.latitude ? Number(c.latitude) : null,
      lon: c && c.longitude ? Number(c.longitude) : null
    };
  } catch (_) {
    const d = await json(`https://viacep.com.br/ws/${cep}/json/`);
    if (d.erro) throw new Error('CEP não encontrado');
    return {
      cidade: d.localidade, uf: d.uf,
      logradouro: d.logradouro || '', bairro: d.bairro || '',
      lat: null, lon: null
    };
  }
}

async function geocodificar(consulta) {
  const url = 'https://nominatim.openstreetmap.org/search'
    + `?format=json&limit=1&addressdetails=1&countrycodes=br&q=${encodeURIComponent(consulta)}`;
  const d = await json(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' } });
  if (!Array.isArray(d) || !d.length) return null;
  const r = d[0];
  const lat = Number(r.lat), lon = Number(r.lon);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const partes = String(r.display_name || '').split(',').map(x => x.trim());
  return {
    lat, lon,
    rotulo: partes.slice(0, 3).join(', '),
    cidade: partes[partes.length - 5] || '',
    uf: partes[partes.length - 3] || '',
    classe: r.type === 'house' || r.class === 'building' ? 'endereço exato' : 'aproximado'
  };
}

export default async function handler(req, res) {
  const busca = String(req.query.q || '').trim();
  const soDigitos = busca.replace(/\D/g, '');

  /* endereço livre: geocodifica direto */
  if (busca && !(soDigitos.length === 8 && /^[\d\s.-]+$/.test(busca))) {
    const consulta = /brasil|brazil/i.test(busca) ? busca : busca + ', Brasil';
    try {
      const p = await geocodificar(consulta);
      if (!p) return res.status(404).json({ erro: 'endereço não encontrado' });
      res.setHeader('Cache-Control', 's-maxage=2592000, stale-while-revalidate');
      return res.status(200).json({
        endereco: p.rotulo || busca, cidade: p.cidade || '', uf: p.uf || '',
        lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5),
        precisao: p.classe || 'endereço'
      });
    } catch (e) {
      return res.status(502).json({ erro: 'não consegui geocodificar: ' + e.message });
    }
  }

  const cep = soDigitos;
  if (cep.length !== 8) return res.status(400).json({ erro: 'informe um endereço ou um CEP de 8 dígitos' });

  let e;
  try {
    e = await endereco(cep);
  } catch (err) {
    return res.status(404).json({ erro: err.message });
  }

  let precisao = null;

  if (e.lat != null) {
    precisao = 'coordenada do CEP';
  } else {
    const tentativas = [
      [`${e.logradouro}, ${e.bairro}, ${e.cidade}, ${e.uf}`, 'logradouro', !!e.logradouro],
      [`${e.bairro}, ${e.cidade}, ${e.uf}`, 'bairro', !!e.bairro],
      [`${e.cidade}, ${e.uf}`, 'centro da cidade', !!e.cidade]
    ];
    for (const [consulta, nome, vale] of tentativas) {
      if (!vale) continue;
      try {
        const p = await geocodificar(consulta);
        if (p) { e.lat = p.lat; e.lon = p.lon; precisao = nome; break; }
      } catch (_) { /* segue para a próxima tentativa */ }
    }
  }

  if (e.lat == null && CAPITAIS[e.uf]) {
    [e.lat, e.lon] = CAPITAIS[e.uf];
    precisao = 'capital do estado';
  }
  if (e.lat == null) return res.status(502).json({ erro: 'não consegui localizar' });

  res.setHeader('Cache-Control', 's-maxage=2592000, stale-while-revalidate');
  return res.status(200).json({
    cep, cidade: e.cidade, uf: e.uf,
    logradouro: e.logradouro, bairro: e.bairro,
    lat: +e.lat.toFixed(5), lon: +e.lon.toFixed(5),
    precisao
  });
}
