# One Minute Poster

A browser-based game that gives you **60 seconds** to design a poster. When time runs out, the canvas freezes. The experience answers: *“How long do you think design takes?”*

## How to run

Open `index.html` in a modern browser (Chrome, Firefox, Edge, Safari). No server or build step required.

For local development with live reload, you can use any static server, for example:

```bash
npx serve .
```

Then open the URL shown (e.g. http://localhost:3000).

## How to play

1. The 60-second countdown starts as soon as the page loads.
2. **Drag** items from the left toolbox onto the white poster canvas: headlines, body text, images, and shapes.
3. **Click** an element on the canvas to select it, then:
   - Drag to move
   - Use the blue corner handle to resize
   - Use the circle handle above to rotate
4. Use the **top bar** to change font, size, alignment, and color for the selected text, and to bring elements forward or send them backward.
5. When the timer hits zero, everything stops and the end message appears. Use **Reset for next player** to start again.

No score—just one minute and whatever you make.

## Collecting all submissions in one place

The end screen lets players **Download** (PNG) or **Upload** to a shared Miro board. Miro uploads go through a small server-side proxy because Miro’s API cannot be called directly from the browser.

### Miro setup and deployment (Vercel)

1. **Miro:** Create a board, get board ID and access token. See **MIRO_SETUP.md** for step-by-step instructions.
2. **In the app:** In `index.html`, set `UPLOAD_CONFIG.miroBoardId` and `UPLOAD_CONFIG.miroAccessToken`.
3. **Deploy to Vercel:** The repo includes an API route `api/miro-upload.js` that forwards uploads to Miro. Deploy this project to [Vercel](https://vercel.com); the Upload button will then work (same-origin request to `/api/miro-upload`).
4. **Optional (more secure):** In the Vercel project settings, add environment variables **MIRO_BOARD_ID** and **MIRO_ACCESS_TOKEN**. The API will use these if set, so you can leave the token out of `index.html` in production.

### GitHub → Vercel

If you connect this repo to Vercel (e.g. **Import** from GitHub in the Vercel dashboard), **every push to the connected branch (usually `main`) triggers a new deployment**. So yes: when you push changes here to GitHub, Vercel will build and deploy the updated app and API automatically.

### Local testing with the proxy

To test Upload locally, run the app and API together with Vercel’s dev server:

```bash
npx vercel dev
```

Then open the URL it prints (e.g. http://localhost:3000). The `/api/miro-upload` route will be available and Upload will work.
