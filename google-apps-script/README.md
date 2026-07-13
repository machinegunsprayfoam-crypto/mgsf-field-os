# Klyfton → Google Drive backup

Real Google Drive integration for the Klyfton app: back up **leads / jobs / estimates**
(as CSV) and **job photos** into the owner's Google Drive.

## How it works
```
App (Photos tab → Back up to Drive)
   → POST /api/drive              (Vercel serverless proxy — avoids browser CORS)
      → Google Apps Script Web App  (runs AS the owner; writes with DriveApp)
         → files land in the owner's Drive
```
No service-account key, no Google Cloud project, no npm dependencies. The proxy
(`api/drive.js`) is **dormant** until `GDRIVE_WEBAPP_URL` is set — the app just shows
"not connected."

## Setup (one time)
1. **script.google.com → New project.** Paste [`KlyftonDriveBackup.gs`](KlyftonDriveBackup.gs), Save.
2. *(Recommended)* set `TOKEN` in the script to any random string.
3. **Deploy → New deployment → Web app** · Execute as **Me** · Who has access **Anyone** →
   Deploy → authorize Drive → copy the **`/exec` URL**.
4. **Vercel → mgsf-fieldos → Settings → Environment Variables:**
   - `GDRIVE_WEBAPP_URL` = the `/exec` URL
   - `GDRIVE_TOKEN` = same random string as `TOKEN` (only if you set one)
   Then **Redeploy**.
5. App → **Photos → Back up to Drive**.

Files go into a Drive folder named **`Klyfton App Backups`** (created automatically), or
pin an existing folder via `ROOT_FOLDER_ID` in the script. Re-running a backup overwrites the
CSVs and de-dupes photos by filename.
