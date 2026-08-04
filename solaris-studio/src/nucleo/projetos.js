/**
 * Projetos na nuvem (Supabase).
 *
 * Opcional: o simulador funciona sem isso, salvando no navegador. Esta função
 * só entra em ação quando as variáveis de ambiente existem.
 *
 * CONFIGURAÇÃO
 * 1. No Supabase, crie a tabela:
 *
 *    create table projetos (
 *      id           text primary key,
 *      nome         text,
 *      cliente      text,
 *      data         date,
 *      potencia     numeric,
 *      estado       jsonb not null,
 *      atualizado_em timestamptz default now()
 *    );
 *
 * 2. Na Vercel, adicione:
 *    SUPABASE_URL       = https://SEUPROJETO.supabase.co
 *    SUPABASE_KEY       = a chave service_role (Settings > API)
 *
 * A chave service_role ignora RLS e nunca pode ir para o navegador —
 * por isso ela vive só aqui.
 */
const TABELA = 'projetos';

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

async function supabase(cfg, caminho, opcoes = {}) {
  const r = await fetch(`${cfg.url}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {})
    }
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(texto.slice(0, 300) || `Supabase ${r.status}`);
  return texto ? JSON.parse(texto) : null;
}

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg) {
    return res.status(501).json({
      erro: 'nuvem não configurada',
      dica: 'defina SUPABASE_URL e SUPABASE_KEY na Vercel. Sem isso, os projetos ' +
            'continuam salvos no navegador.'
    });
  }

  try {
    /* ---------------------------------------------------------- listar */
    if (req.method === 'GET') {
      const id = req.query.id;
      if (id) {
        const d = await supabase(cfg,
          `${TABELA}?id=eq.${encodeURIComponent(id)}&select=*`);
        if (!d || !d.length) return res.status(404).json({ erro: 'projeto não encontrado' });
        return res.status(200).json(normalizar(d[0]));
      }
      const d = await supabase(cfg,
        `${TABELA}?select=id,nome,cliente,data,potencia,atualizado_em` +
        `&order=atualizado_em.desc&limit=100`);
      return res.status(200).json({ projetos: (d || []).map(normalizar) });
    }

    /* ----------------------------------------------------------- salvar */
    if (req.method === 'POST') {
      const p = req.body || {};
      if (!p.id || !p.estado)
        return res.status(400).json({ erro: 'projeto precisa de id e estado' });

      const linha = {
        id: p.id,
        nome: p.nome || null,
        cliente: p.cliente || null,
        data: p.data || null,
        potencia: Number(p.potencia) || null,
        estado: p.estado,
        atualizado_em: new Date().toISOString()
      };
      await supabase(cfg, `${TABELA}?on_conflict=id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(linha)
      });
      return res.status(200).json({ ok: true, id: p.id });
    }

    /* ---------------------------------------------------------- apagar */
    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ erro: 'informe o id' });
      await supabase(cfg, `${TABELA}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'método não suportado' });
  } catch (e) {
    return res.status(502).json({ erro: 'falha no Supabase', detalhe: e.message });
  }
}

const normalizar = l => ({
  id: l.id, nome: l.nome, cliente: l.cliente, data: l.data,
  potencia: l.potencia, estado: l.estado, atualizadoEm: l.atualizado_em
});
