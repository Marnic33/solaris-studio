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
  if (!r.ok) {
    let detalhe = texto.slice(0, 400);
    try {
      const j = JSON.parse(texto);
      detalhe = [j.message, j.details, j.hint].filter(Boolean).join(' · ') || detalhe;
    } catch (_) { /* resposta não-JSON: mantém o texto */ }
    const e = new Error(detalhe || `Supabase HTTP ${r.status}`);
    e.status = r.status;
    e.codigo = (() => { try { return JSON.parse(texto).code; } catch (_) { return null; } })();
    throw e;
  }
  return texto ? JSON.parse(texto) : null;
}

export default async function handler(req, res) {
  const cfg = config();

  /* /api/projetos?diagnostico=1 — confere a configuração sem gravar nada */
  if (req.query.diagnostico) {
    if (!cfg) return res.status(200).json({
      configurado: false,
      falta: [process.env.SUPABASE_URL ? null : 'SUPABASE_URL',
              process.env.SUPABASE_KEY ? null : 'SUPABASE_KEY'].filter(Boolean)
    });
    const key = process.env.SUPABASE_KEY || '';
    let papel = 'desconhecido';
    try {
      const corpo = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString());
      papel = corpo.role || 'desconhecido';
    } catch (_) { /* chave em outro formato */ }

    const teste = { id: '__diagnostico__', nome: 'teste', estado: { ok: true } };
    let leitura = null, escrita = null;
    try { await supabase(cfg, `${TABELA}?select=id&limit=1`); leitura = 'ok'; }
    catch (e) { leitura = e.message.slice(0, 200); }
    try {
      await supabase(cfg, `${TABELA}?on_conflict=id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(teste)
      });
      await supabase(cfg, `${TABELA}?id=eq.__diagnostico__`, { method: 'DELETE' });
      escrita = 'ok';
    } catch (e) { escrita = e.message.slice(0, 200); }

    return res.status(200).json({
      configurado: true,
      url: cfg.url,
      papel_da_chave: papel,
      leitura, escrita,
      veredito: escrita === 'ok' ? 'tudo funcionando'
        : papel === 'anon' ? 'a chave é anon; troque pela service_role'
        : 'veja a mensagem em "escrita"'
    });
  }
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
        `${TABELA}?select=id,nome,cliente,data,potencia,modulos,atualizado_em` +
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
        modulos: Number(p.modulos) || null,
        nota: p.nota || null,
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
    const msg = String(e.message || '');
    let dica = null;
    if (/row-level security|violates row-level/i.test(msg) || e.status === 401 || e.status === 403)
      dica = 'A chave em SUPABASE_KEY parece ser a "anon". Para gravar com RLS ligado, ' +
             'use a chave service_role (Supabase > Settings > API > service_role).';
    else if (/column .* does not exist|schema cache/i.test(msg))
      dica = 'A tabela está sem alguma coluna. Rode de novo o SQL completo de criação ' +
             'no SQL Editor do Supabase.';
    else if (/relation .* does not exist/i.test(msg))
      dica = 'A tabela "projetos" não existe neste projeto do Supabase. Confira se ' +
             'SUPABASE_URL aponta para o projeto onde você rodou o SQL.';
    else if (/JWT|Invalid API key|apikey/i.test(msg))
      dica = 'Chave recusada. Copie de novo a service_role em Settings > API.';
    return res.status(502).json({ erro: 'falha no Supabase', detalhe: msg, dica });
  }
}

const normalizar = l => ({
  id: l.id, nome: l.nome, cliente: l.cliente, data: l.data,
  potencia: l.potencia, modulos: l.modulos, nota: l.nota,
  estado: l.estado, atualizadoEm: l.atualizado_em
});
