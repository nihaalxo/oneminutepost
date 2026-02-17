/**
 * Vercel serverless proxy for Miro image upload.
 * Miro's REST API cannot be called directly from the browser (CORS / origin).
 * This endpoint receives the image from the client and forwards it to Miro server-to-server.
 *
 * POST body (JSON): { boardId, accessToken, imageDataUrl }
 * Or set env vars MIRO_BOARD_ID and MIRO_ACCESS_TOKEN and send only: { imageDataUrl }
 *
 * The `data` part must have NO filename (replicates curl -F "data={...};type=application/json").
 * We use Node 18+ native FormData + Blob so the data part gets Content-Type without a filename.
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

  try {
    const body = await getBody(req);
    const accessToken = (body.accessToken || MIRO_ACCESS_TOKEN || '').trim();
    const boardId = (body.boardId || MIRO_BOARD_ID || '').trim();
    const imageDataUrl = body.imageDataUrl;

    if (!accessToken || !boardId || !imageDataUrl || typeof imageDataUrl !== 'string') {
      return res.status(400).json({ error: 'Missing required fields: boardId, accessToken, or imageDataUrl' });
    }

    const comma = imageDataUrl.indexOf(',');
    if (comma < 0) {
      return res.status(400).json({ error: 'Invalid imageDataUrl format' });
    }

    const mimeMatch = imageDataUrl.match(/^data:([^;,]+)/);
    const mime = (mimeMatch && mimeMatch[1]) || 'image/png';
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
    const base64 = imageDataUrl.slice(comma + 1);
    let imageBuffer;
    try {
      imageBuffer = Buffer.from(base64, 'base64');
    } catch (_) {
      return res.status(400).json({ error: 'Invalid base64 in imageDataUrl' });
    }

    if (imageBuffer.length > 6 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image exceeds Miro 6 MB limit' });
    }

    // Build multipart using native FormData + Blob (Node 18+).
    // data part: NO filename — replicates -F "data={...};type=application/json"
    const formData = new FormData();
    const dataBlob = new Blob(
      [JSON.stringify({ position: { x: 0, y: 0, origin: 'center' } })],
      { type: 'application/json' }
    );
    formData.append('data', dataBlob); // no third argument

    const imageBlob = new Blob([imageBuffer], { type: mime });
    formData.append('resource', imageBlob, `poster.${ext}`);

    const miroUrl = `https://api.miro.com/v2/boards/${encodeURIComponent(boardId)}/images`;

    const miroRes = await fetch(miroUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
      body: formData,
    });

    const responseText = await miroRes.text();
    console.log('Miro status:', miroRes.status);
    console.log('Miro response:', responseText);

    if (!miroRes.ok) {
      return res.status(miroRes.status).json({
        error: 'Miro upload failed',
        message: responseText,
        miroStatus: miroRes.status,
      });
    }

    const json = responseText ? JSON.parse(responseText) : {};
    return res.status(200).json(json);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
