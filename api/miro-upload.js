/**
 * Vercel serverless proxy for Miro image upload.
 * Miro's REST API cannot be called directly from the browser (CORS / origin).
 *
 * POST body (JSON): { boardId, accessToken, imageDataUrl }
 * Or set env vars MIRO_BOARD_ID and MIRO_ACCESS_TOKEN and send only: { imageDataUrl }
 *
 * Config: bodyParser sizeLimit 10mb so Vercel parses the full JSON body (base64 image ~2–4mb).
 * data part: Buffer + contentType, NO filename. resource part: image Buffer + filename.
 * Use node-fetch (not native fetch) so form-data stream is consumed correctly by Miro.
 */

import FormData from 'form-data';
import fetch from 'node-fetch';

const MIRO_BOARD_ID = process.env.MIRO_BOARD_ID || '';
const MIRO_ACCESS_TOKEN = process.env.MIRO_ACCESS_TOKEN || '';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

async function getBodyIfNeeded(req) {
  if (req.body != null && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }
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
  if (req.method !== 'POST') return res.status(405).end();

  console.log('req.body type:', typeof req.body);

  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch (_) {
      return res.status(400).json({ error: 'Could not parse request body' });
    }
  }

  const body = req.body != null ? req.body : await getBodyIfNeeded(req);
  const { boardId, accessToken, imageDataUrl } = body ?? {};
  const token = (accessToken || MIRO_ACCESS_TOKEN || '').trim();
  const board = (boardId || MIRO_BOARD_ID || '').trim();

  console.log('imageDataUrl present:', !!imageDataUrl);
  console.log('imageDataUrl length:', imageDataUrl?.length);
  console.log('board:', board);
  console.log('token present:', !!token);

  if (!token || !board || !imageDataUrl) {
    return res.status(400).json({
      error: 'Missing required fields',
      has: { token: !!token, board: !!board, imageDataUrl: !!imageDataUrl },
    });
  }

  try {
    const [header, base64] = imageDataUrl.split(',');
    const mimeMatch = header && header.match(/:(.*?);/);
    const mime = (mimeMatch && mimeMatch[1]) || 'image/png';
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
    const imageBuffer = Buffer.from(base64, 'base64');

    console.log('imageBuffer size:', imageBuffer.byteLength);

    if (imageBuffer.byteLength === 0) {
      return res.status(400).json({ error: 'Image buffer is empty after decode' });
    }
    if (imageBuffer.byteLength > 6 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image exceeds Miro 6 MB limit' });
    }

    const dataBuffer = Buffer.from(JSON.stringify({ position: { x: 0, y: 0 } }));

    const form = new FormData();
    form.append('data', dataBuffer, {
      contentType: 'application/json',
      knownLength: dataBuffer.byteLength,
    });
    form.append('resource', imageBuffer, {
      filename: `poster.${ext}`,
      contentType: mime,
      knownLength: imageBuffer.byteLength,
    });

    const formLength = await new Promise((resolve, reject) => form.getLength((err, len) => (err ? reject(err) : resolve(len))));
    console.log('form headers:', form.getHeaders());
    console.log('form length:', formLength);

    const miroUrl = `https://api.miro.com/v2/boards/${encodeURIComponent(board)}/images`;

    // node-fetch consumes form-data stream correctly; native fetch does not
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

    return res.status(200).json(JSON.parse(responseText));
  } catch (err) {
    console.error('Proxy error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}
