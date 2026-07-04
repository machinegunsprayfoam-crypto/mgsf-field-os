/**
 * /api/drive.js
 *
 * Google Drive sync utility for MGSF Field OS.
 * Creates a job folder structure under a configured parent folder.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — Service account credentials JSON (stringified)
 *   GOOGLE_DRIVE_PARENT_ID       — Parent folder ID in Google Drive
 */

const { google } = require("googleapis");

async function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function createFolder(drive, name, parentId) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id, webViewLink",
  });
  return res.data;
}

async function ensureSubfolders(drive, parentId, subfolders) {
  const results = {};
  for (const name of subfolders) {
    const folder = await createFolder(drive, name, parentId);
    results[name] = folder.id;
  }
  return results;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, project_name, customer_name, project_id } = req.body ?? {};

  if (!action) {
    return res.status(400).json({ error: "action is required" });
  }

  // ── create_job_folder ──────────────────────────────────────────────────────
  if (action === "create_job_folder") {
    if (!project_name) return res.status(400).json({ error: "project_name is required" });

    const parentId = process.env.GOOGLE_DRIVE_PARENT_ID;
    if (!parentId) return res.status(500).json({ error: "GOOGLE_DRIVE_PARENT_ID not configured" });

    try {
      const drive = await getDriveClient();

      // Folder name: YYYY-MM-DD — Customer — Project
      const date = new Date().toISOString().split("T")[0];
      const folderName = [date, customer_name, project_name].filter(Boolean).join(" — ");

      const jobFolder = await createFolder(drive, folderName, parentId);

      // Create standard subfolders
      await ensureSubfolders(drive, jobFolder.id, [
        "01-Proposal",
        "02-Contract",
        "03-Photos-Before",
        "04-Photos-During",
        "05-Photos-After",
        "06-Closeout",
        "07-Invoice",
      ]);

      return res.status(200).json({
        ok: true,
        folder_id: jobFolder.id,
        folder_url: jobFolder.webViewLink,
        folder_name: folderName,
      });
    } catch (err) {
      console.error("Drive error:", err);
      return res.status(500).json({ error: err.message ?? "Drive error" });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
};
