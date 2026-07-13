/**
 * Klyfton Drive Backup — Google Apps Script Web App
 * ------------------------------------------------------------------
 * Lets the Klyfton app back up leads/jobs/estimates (as CSV) and job photos
 * into the OWNER'S Google Drive. Runs AS the owner (files land in your Drive,
 * owned by you) — no service-account key, no billing, no Google Cloud project.
 *
 * SETUP (one time, ~3 minutes):
 *   1. Go to script.google.com  ->  New project.
 *   2. Delete the sample, paste THIS whole file, Save.
 *   3. (Optional but recommended) set TOKEN below to any random string.
 *   4. Deploy -> New deployment -> gear icon -> Web app.
 *        Description: Klyfton Drive Backup
 *        Execute as:  Me (your email)
 *        Who has access: Anyone
 *      -> Deploy -> Authorize access (allow Drive) -> copy the Web app URL (ends in /exec).
 *   5. In Vercel (mgsf-fieldos -> Settings -> Environment Variables) add:
 *        GDRIVE_WEBAPP_URL = <the /exec URL>
 *        GDRIVE_TOKEN      = <same random string as TOKEN below>   (only if you set TOKEN)
 *      -> Redeploy.
 *   6. In the app: Photos tab -> "Back up to Drive".
 *
 * Files land in a Drive folder named by ROOT_FOLDER_NAME (created if missing),
 * or in ROOT_FOLDER_ID if you pin one.
 */

var TOKEN = '';                             // set to a random string; must equal Vercel GDRIVE_TOKEN ('' disables the check)
var ROOT_FOLDER_NAME = 'Klyfton App Backups';
var ROOT_FOLDER_ID = '';                    // if set, used instead of ROOT_FOLDER_NAME

function getRoot_() {
  if (ROOT_FOLDER_ID) return DriveApp.getFolderById(ROOT_FOLDER_ID);
  var it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
}

function subFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// Overwrite-by-name: trash any existing file(s) with this name, then create fresh.
function upsertFile_(folder, name, content, mime) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
  return folder.createFile(name, content, mime);
}

function toCsv_(rows) {
  rows = rows || [];
  if (!rows.length) return '';
  var keys = {};
  rows.forEach(function (r) { if (r && typeof r === 'object') Object.keys(r).forEach(function (k) { keys[k] = 1; }); });
  var cols = Object.keys(keys);
  var esc = function (v) {
    if (v == null) return '';
    v = (typeof v === 'object') ? JSON.stringify(v) : String(v);
    return '"' + v.replace(/"/g, '""') + '"';
  };
  var out = [cols.join(',')];
  rows.forEach(function (r) { out.push(cols.map(function (c) { return esc(r ? r[c] : ''); }).join(',')); });
  return out.join('\n');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ ok: true, service: 'Klyfton Drive Backup' });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (TOKEN && body.token !== TOKEN) return json_({ ok: false, error: 'bad_token' });
    var root = getRoot_();

    if (body.action === 'photo') {
      var m = String(body.dataUrl || '').match(/^data:([^;]+);base64,(.*)$/);
      if (!m) return json_({ ok: false, error: 'bad_image' });
      var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], body.name || 'photo.jpg');
      var pf = subFolder_(root, 'Photos');
      if (body.job) pf = subFolder_(pf, String(body.job).replace(/[\/\\]/g, '-').slice(0, 80));
      var f = upsertFile_(pf, body.name || 'photo.jpg', blob, m[1]);
      return json_({ ok: true, id: f.getId(), link: f.getUrl() });
    }

    // default: back up record collections as CSV
    var cols = body.collections || {};
    var files = {};
    Object.keys(cols).forEach(function (name) {
      var csv = toCsv_(cols[name]);
      var f = upsertFile_(root, 'MGSF_' + name + '.csv', csv, 'text/csv');
      files[name] = { id: f.getId(), link: f.getUrl(), rows: (cols[name] || []).length };
    });
    return json_({ ok: true, files: files });
  } catch (err) {
    return json_({ ok: false, error: String(err).slice(0, 300) });
  }
}
