# Miro upload – context and issue (for debugging)

## Context

- **App:** “One Minute Poster” – browser game (Vite, single `index.html`). Users design a poster; at the end they can **Download** (PNG) or **Upload** to a shared Miro board.
- **Flow:** Browser captures the poster as a data URL (PNG/JPEG, under ~3 MB), then `POST`s JSON to our **Vercel serverless proxy** at `/api/miro-upload` with `{ boardId, accessToken, imageDataUrl }`. The proxy decodes the image, builds a **multipart/form-data** request, and forwards it to **Miro’s API** (`POST https://api.miro.com/v2/boards/{boardId}/images`). We use a proxy because Miro’s API cannot be called directly from the browser (CORS / origin).
- **Credentials:** `boardId` and `accessToken` are set in the client (`UPLOAD_CONFIG` in `index.html`) and/or as Vercel env vars `MIRO_BOARD_ID` and `MIRO_ACCESS_TOKEN`. They are known to be set correctly (board ID like `uXjVG_fgobo=`, token from Miro “Install app and get OAuth token”).

## Current issue

- **Symptom:** When the user clicks **Upload**, the request to `https://oneminutepost.vercel.app/api/miro-upload` returns **400 Bad Request**, and the user sees: **“Miro upload failed: Invalid parameters”**.
- So the **proxy is reached**, but the **request our proxy sends to Miro** is being rejected by Miro with “Invalid parameters” (400). The failure is on the **Miro API side**, not on our proxy’s input validation.

## What we’ve already tried

1. **Direct browser → Miro**
   - We first called `api.miro.com` from the browser. We got **500** (and earlier **400 “URL incorrect”** when sending a data URL in JSON). Conclusion: Miro’s API is not meant to be called from the browser; we moved to a server proxy.

2. **Proxy with `data` as a file (Blob)**
   - Proxy built multipart with:
     - `data`: Blob of `JSON.stringify({ position: { x: 0, y: 0, origin: 'center' } })`, `type: 'application/json'`, appended with filename `'data.json'`.
     - `resource`: image Blob.
   - Miro responded **500** with message like: “Failed to convert 'data' with value: 'MultipartFile[field=\"data\", filename=data.json, contentType=application/json, ...]'”. So Miro did not accept `data` when sent as a **file** part.

3. **Proxy with `data` as a plain form field (current code)**
   - We switched to the **`form-data`** npm package and send:
     - `data`: **string** `JSON.stringify({ position: { x: 0, y: 0 } })` with option `{ contentType: 'application/json' }` (no filename).
     - `resource`: image buffer with `{ filename: 'poster.png', contentType: mime }`.
   - We use `form.getHeaders()` and pass the form as `body` to `fetch(miroUrl, { method: 'POST', headers, body: form })`.
   - Result: Miro now returns **400** with **“Invalid parameters”** (no more 500). So the “data as file” problem is gone, but the request is still invalid in Miro’s eyes.

## Miro API (what we’re targeting)

- **Endpoint:** `POST https://api.miro.com/v2/boards/{board_id}/images`
- **Docs:** “Create image item using file from device” – multipart/form-data with:
  - **`data`**: JSON (e.g. position). Official cURL example:  
    `-F "data={\"position\":{\"x\":3000,\"y\":3000}};type=application/json"`
  - **`resource`**: the image file (max 6 MB).
- **Auth:** `Authorization: Bearer {accessToken}`. Scopes: `boards:write` (and we assume the token has this).

## Current code (for reference)

**Client (index.html) – sends to our proxy:**

```javascript
// UPLOAD_CONFIG has miroBoardId and miroAccessToken
return ensureImageUnderLimitForMiro(dataUrl, 3e6).then(processedDataUrl => {
  return fetch('/api/miro-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boardId, accessToken: token, imageDataUrl: processedDataUrl })
  });
});
// then on !res.ok: parse res.text() and show "Miro upload failed: " + (err.message || err.error || status)
```

**Proxy (api/miro-upload.js) – forwards to Miro:**

- Reads `boardId`, `accessToken`, `imageDataUrl` from JSON body (or env).
- Decodes `imageDataUrl` (data URL) to a Buffer; checks size &lt; 6 MB.
- Builds multipart with **form-data**:
  - `form.append('data', JSON.stringify({ position: { x: 0, y: 0 } }), { contentType: 'application/json' });`
  - `form.append('resource', imageBuffer, { filename: 'poster.' + ext, contentType: mime });`
- `headers = { ...form.getHeaders(), 'Authorization': 'Bearer ' + accessToken }`
- `fetch(miroUrl, { method: 'POST', headers, body: form })`
- Proxies Miro’s status and body back to the client.

**Relevant Miro URL:**

- `miroUrl = 'https://api.miro.com/v2/boards/' + encodeURIComponent(boardId) + '/images'`
- `boardId` is e.g. `uXjVG_fgobo=` (used as-is after trim).

## What we need

A **concrete fix** so that the request from our Vercel proxy to `POST https://api.miro.com/v2/boards/{boardId}/images` is accepted by Miro (no 400 “Invalid parameters”). Specifically:

- Exact **multipart/form-data** shape Miro expects (field names, order, `data` format, any required keys in the JSON).
- Any **headers** (besides `Authorization` and the multipart Content-Type with boundary) that Miro requires.
- If the “Invalid parameters” 400 often includes a more detailed body (e.g. which parameter is invalid), we can add server-side logging of `miroRes.status` and `miroRes.text()` and then adjust from there—so suggestions on what to log are also useful.

We have **not** changed anything after the last attempt (data as JSON form field with contentType); we’re waiting for a recommended solution before making further code changes.
