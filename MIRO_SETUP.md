# How to set up Miro so all posters upload to one board

Follow these steps once. After that, every time someone clicks **Upload** in the game, their poster will appear on your Miro board.

---

## Step 1: Create a Miro account (if you don’t have one)

1. Go to **[miro.com](https://miro.com)** and sign up or log in.

---

## Step 2: Create a Developer team

1. In Miro, click your **profile picture** (bottom-left or top-right).
2. Go to **Settings** (or **Profile** → **Settings**).
3. Find **Developer team** or **Create a developer team**.
4. Create a team (e.g. “One Minute Poster”). You need a developer team to create apps and get an access token.

If you don’t see “Developer team”, try:

- **Settings** → **Your apps** or **Apps**.
- Or go directly to: **[miro.com/app/settings/user-profile/apps](https://miro.com/app/settings/user-profile/apps)**

---

## Step 3: Create a new app

1. In **Settings**, open the **Your apps** tab.
2. Click **+ Create new app** (or **Create app**).
3. Enter an **App name** (e.g. `One Minute Poster`).
4. **Do not** check “Expire user authorization token” if you want a long‑lived token (simplest for this use case).
5. Click **Create app**.

---

## Step 4: Configure the app (scopes)

1. On the app’s settings page, click **Edit in Manifest** (or **App manifest**).
2. In the manifest, set **scopes** so the app can add images to a board. You need at least:
   - `boards:read`
   - `boards:write`
3. In the UI, if there are checkboxes, enable **Board: Read** and **Board: Write**.
4. Click **Save** (and **Edit in UI** if you need to go back to the main app settings).

---

## Step 5: Install the app and get your access token

1. On the app settings page, scroll down.
2. Click **Install app and get OAuth token** (or **Install app to get OAuth token**).
3. In the dialog:
   - From **Select a team**, choose your **Developer team** (the one you created).
4. Click **Install & authorize**.
5. A message will show that the app is installed and an **access token** is shown.
6. **Copy the access token** and store it somewhere safe (you’ll paste it into the game code).  
   - Treat it like a password: anyone with this token can add content to boards in that team.

---

## Step 6: Create (or open) the board where posters will go

1. In Miro, create a **new board** or open an existing one (e.g. “One Minute Poster – Submissions”).
2. **Share the board** with anyone who should view the submissions: click **Share**, then set access (e.g. “Anyone with the link can view” or invite people).
3. Get the **board ID** from the board’s URL:
   - The URL looks like: `https://miro.com/app/board/uXjVxxxxxxxx=/`
   - Or: `https://miro.com/app/board/o9J_xxxxxxxxx=/`
   - The **board ID** is the part after `/board/` and before the next `/` (and sometimes includes `=` at the end).  
   - Examples: `uXjVxxxxxxxx=` or `o9J_leLUTqM=`
4. **Copy the board ID** (you’ll paste it into the game code).

---

## Step 7: Put the token and board ID into the game

1. Open the project in your editor.
2. Open **index.html**.
3. Search for **UPLOAD_CONFIG** (near the top of the `<script>` section).
4. Set:
   - **miroAccessToken** = the token you copied in Step 5 (inside quotes).
   - **miroBoardId** = the board ID you copied in Step 6 (inside quotes).

Example:

```javascript
const UPLOAD_CONFIG = {
  miroBoardId: 'o9J_leLUTqM=',
  miroAccessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
};
```

5. Save **index.html**.

---

## Step 8: Test it

1. Run the game (e.g. `npm run dev` and open the URL in your browser).
2. Play through the timer and finish a poster.
3. On the end screen, click **Upload**.
4. You should see a success message, and the poster image should appear on your Miro board.

---

## Quick reference

| What you need | Where to get it |
|---------------|------------------|
| **Access token** | Miro → Settings → Your apps → your app → **Install app and get OAuth token** → Install & authorize → copy the token. |
| **Board ID**     | Open the board in Miro → look at the URL: `…/board/`**`BOARD_ID`**`/` → copy that part. |

---

## Troubleshooting

- **“Miro is not configured”**  
  Make sure both `miroBoardId` and `miroAccessToken` are set in `UPLOAD_CONFIG` in **index.html** and that you saved the file.

- **Upload fails (401 or 403)**  
  - Check that the token is copied completely (no spaces at the start or end).  
  - Confirm the app has **boards:read** and **boards:write** scopes and that you installed it on the same team that owns the board.

- **Upload succeeds but I don’t see the image**  
  - Refresh the Miro board.  
  - Check that you’re looking at the board whose ID you used in `miroBoardId`.

- **Token expired**  
  If you chose expiring tokens, generate a new token by opening the app again and using “Install app and get OAuth token” (or the option to get a new token), then update `miroAccessToken` in **index.html**.
