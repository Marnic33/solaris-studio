/**
 * Proxy da API da Anthropic. A chave nunca vai para o navegador.
 * Configure ANTHROPIC_API_KEY nas variáveis de ambiente da Vercel.
 */
const MODELO_PADRAO = 'claude-sonnet-4-6';
const LIMITE_CARACTERES = 60000;

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ erro: 'use POST' });

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave)
    return res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada na Vercel' });

  const { messages, model, max_tokens } = req.body || {};
  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ erro: 'messages ausente' });

  const tamanho = JSON.stringify(messages).length;
  if (tamanho > LIMITE_CARACTERES)
    return res.status(413).json({ erro: 'payload grande demais' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': chave,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || MODELO_PADRAO,
        max_tokens: Math.min(Number(max_tokens) || 1000, 2000),
        messages
      })
    });
    const dados = await r.json();
    return res.status(r.status).json(dados);
  } catch (e) {
    return res.status(502).json({ erro: 'falha ao chamar a API', detalhe: e.message });
  }
}
