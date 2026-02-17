/**
 * Vercel serverless proxy for Miro image upload.
 * Miro's REST API cannot be called directly from the browser (CORS / origin).
 *
 * POST body (JSON): { boardId, accessToken, imageDataUrl }
 * Or set env vars MIRO_BOARD_ID and MIRO_ACCESS_TOKEN and send only: { imageDataUrl }
 *
 * The `data` part must have NO filename. Node's native FormData gives Blobs filename=blob,
 * which Miro rejects. Using form-data package with a Buffer (not Blob) for `data` and
 * contentType + knownLength but NO filename produces the correct part (matches curl).
 */

import FormData from 'form-data';

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

  try {
    const body = await getBody(req);
    const token = (body.accessToken || MIRO_ACCESS_TOKEN || '').trim();
    const board = (body.boardId || MIRO_BOARD_ID || '').trim();
    const imageDataUrl = body.imageDataUrl;

    if (!token || !board || !imageDataUrl || typeof imageDataUrl !== 'string') {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [header, base64] = imageDataUrl.split(',');
    if (!base64) return res.status(400).json({ error: 'Invalid imageDataUrl format' });

    const mimeMatch = header && header.match(/:(.*?);/);
    const mime = (mimeMatch && mimeMatch[1]) || 'image/png';
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
    let imageBuffer;
    try {
      imageBuffer = Buffer.from(base64, 'base64');
    } catch (_) {
      return res.status(400).json({ error: 'Invalid base64 in imageDataUrl' });
    }

    if (imageBuffer.byteLength > 6 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image exceeds 6 MB limit' });
    }

    const dataJson = JSON.stringify({ position: { x: 0, y: 0 } });
    const dataBuffer = Buffer.from(dataJson);

    const form = new FormData();

    // data part: Buffer + contentType, NO filename → no filename= in Content-Disposition
    form.append('data', dataBuffer, {
      contentType: 'application/json',
      knownLength: dataBuffer.byteLength,
    });

    form.append('resource', imageBuffer, {
      filename: `poster.${ext}`,
      contentType: mime,
      knownLength: imageBuffer.byteLength,
    });

    const miroUrl = `https://api.miro.com/v2/boards/${encodeURIComponent(board)}/images`;

    const miroRes = await fetch(miroUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        ...form.getHeaders(),
      },
      body: form,
    });

    const responseText = await miroRes.text();
    console.log('Miro status:', miroRes.status);
    console.log('Miro body:', responseText);

    if (!miroRes.ok) {
      return res.status(miroRes.status).json({
        error: 'Miro upload failed',
        detail: responseText,
      });
    }

    return res.status(200).json(responseText ? JSON.parse(responseText) : {});
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
