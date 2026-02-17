/**
 * Vercel serverless proxy for Miro image upload.
 * Miro's REST API cannot be called directly from the browser (CORS / origin).
 * This endpoint receives the image from the client and forwards it to Miro server-to-server.
 *
 * POST body (JSON): { boardId, accessToken, imageDataUrl }
 * Or set env vars MIRO_BOARD_ID and MIRO_ACCESS_TOKEN and send only: { imageDataUrl }
 */

const MIRO_BOARD_ID = process.env.MIRO_BOARD_ID || '';
const MIRO_ACCESS_TOKEN = process.env.MIRO_ACCESS_TOKEN || '';

async function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await getBody(req);
  let boardId = body.boardId || MIRO_BOARD_ID;
  let accessToken = body.accessToken || MIRO_ACCESS_TOKEN;
  const imageDataUrl = body.imageDataUrl;

  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    return res.status(400).json({ error: 'Missing imageDataUrl in request body' });
  }

  boardId = (boardId || '').trim();
  accessToken = (accessToken || '').trim();
  if (!boardId || !accessToken) {
    return res.status(400).json({ error: 'Missing boardId or accessToken. Set in request body or as env vars MIRO_BOARD_ID and MIRO_ACCESS_TOKEN.' });
  }

  const comma = imageDataUrl.indexOf(',');
  if (comma < 0) {
    return res.status(400).json({ error: 'Invalid imageDataUrl format' });
  }

  const mimeMatch = imageDataUrl.match(/^data:([^;,]+)/);
  const mime = (mimeMatch && mimeMatch[1]) || 'image/png';
  const base64 = imageDataUrl.slice(comma + 1);
  let imageBuffer;
  try {
    imageBuffer = Buffer.from(base64, 'base64');
  } catch (_) {
    return res.status(400).json({ error: 'Invalid base64 in imageDataUrl' });
  }

  if (imageBuffer.length > 6 * 1024 * 1024) {
    return res.status(400).json({ error: 'Image too large (max 6 MB for Miro)' });
  }

  const dataPart = new Blob(
    [JSON.stringify({ position: { x: 0, y: 0, origin: 'center' } })],
    { type: 'application/json' }
  );
  const imageBlob = new Blob([imageBuffer], { type: mime });
  const ext = mime === 'image/jpeg' ? 'jpg' : 'png';

  const form = new FormData();
  form.append('data', dataPart, 'data.json');
  form.append('resource', imageBlob, `poster.${ext}`);

  const miroUrl = `https://api.miro.com/v2/boards/${encodeURIComponent(boardId)}/images`;
  let miroRes;
  try {
    miroRes = await fetch(miroUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
      body: form,
    });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Miro: ' + (err.message || 'network error') });
  }

  const text = await miroRes.text();
  try {
    const json = text ? JSON.parse(text) : {};
    res.status(miroRes.status).json(json);
  } catch (_) {
    res.status(miroRes.status).setHeader('Content-Type', 'text/plain').send(text);
  }
}
