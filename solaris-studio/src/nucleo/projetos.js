/**
 * Persistência de projetos.
 *
 * Guarda no navegador (localStorage) e, quando o Supabase estiver configurado,
 * sincroniza com a nuvem através de /api/projetos.
 *
 * Um projeto é o estado completo da simulação: telhado, módulos, obstáculos,
 * elétrico, local e as edições manuais de fileira.
 */
const CHAVE = 'solaris.projetos.v1';

/* ------------------------------------------------------------ local */

function lerTudo() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; }
  catch (_) { return {}; }
}
function gravarTudo(d) {
  try { localStorage.setItem(CHAVE, JSON.stringify(d)); return true; }
  catch (e) { return false; }
}

export function listarProjetos() {
  return Object.values(lerTudo())
    .map(p => ({ id: p.id, nome: p.nome, cliente: p.cliente, data: p.data,
                 atualizadoEm: p.atualizadoEm, potencia: p.potencia }))
    .sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
}

export function carregarProjeto(id) {
  const p = lerTudo()[id];
  if (!p) throw new Error('projeto não encontrado');
  return p;
}

export function salvarProjeto(projeto) {
  const d = lerTudo();
  const id = projeto.id || novoId(projeto.nome);
  const registro = { ...projeto, id, atualizadoEm: new Date().toISOString() };
  d[id] = registro;
  if (!gravarTudo(d)) throw new Error('armazenamento cheio — exporte e apague projetos antigos');
  return registro;
}

export function apagarProjeto(id) {
  const d = lerTudo();
  delete d[id];
  gravarTudo(d);
}

function novoId(nome) {
  const base = String(nome || 'projeto')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return `${base}-${Date.now().toString(36)}`;
}

/* ------------------------------------------------------ arquivo .json */

export function exportarArquivo(projeto) {
  const blob = new Blob([JSON.stringify(projeto, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${projeto.id || 'projeto'}.solaris.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function importarArquivo(arquivo) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(String(r.result));
        if (!p || typeof p !== 'object' || !p.estado) throw new Error('formato inesperado');
        res(p);
      } catch (e) { rej(new Error('arquivo inválido: ' + e.message)); }
    };
    r.onerror = () => rej(new Error('não consegui ler o arquivo'));
    r.readAsText(arquivo);
  });
}

/* ------------------------------------------------------------ nuvem */

/** Envia para o Supabase. Silencioso se a nuvem não estiver configurada. */
export async function sincronizar(projeto) {
  try {
    const r = await fetch('/api/projetos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projeto)
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return { ok: false, motivo: e.erro || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

/** Baixa um projeto completo da nuvem, com o estado. */
export async function baixarNuvem(id) {
  const r = await fetch(`/api/projetos?id=${encodeURIComponent(id)}`);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.erro || `HTTP ${r.status}`);
  }
  const p = await r.json();
  if (!p || !p.estado) throw new Error('projeto sem estado salvo');
  return p;
}

/** Busca a lista de projetos da nuvem. */
export async function listarNuvem() {
  const r = await fetch('/api/projetos');
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.erro || `HTTP ${r.status}`);
  }
  const d = await r.json();
  return Array.isArray(d.projetos) ? d.projetos : [];
}
