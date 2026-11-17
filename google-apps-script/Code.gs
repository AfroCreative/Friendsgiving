/**
 * Friendsgiving: Google Sheets backend.
 *
 * Paste this whole file into Extensions → Apps Script of your Google Sheet,
 * set SECRET below, then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone). See README.md for the full steps.
 *
 * The website's server (on Vercel) is the only thing that calls this, and it
 * must send the same SECRET. Guests never see this URL or the secret.
 */
const SECRET = "PASTE-THE-SAME-LONG-RANDOM-SECRET-YOU-PUT-IN-VERCEL";

function doGet() {
  return out_({ ok: true, message: "Friendsgiving sheet backend is running." });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ error: "Bad request." }); }
  if (!SECRET || SECRET.indexOf("PASTE-") === 0) return out_({ error: "Set SECRET at the top of the Apps Script and deploy a new version." });
  if (req.secret !== SECRET) return out_({ error: "Wrong secret. SHEET_SECRET in Vercel must match SECRET in the Apps Script." });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (req.op) {
      case "read": {
        // { sheets: [{ name, header }] } → { data: { name: [[...row], ...] } }
        const data = {};
        (req.sheets || []).forEach(function (s) { data[s.name] = rows_(sheet_(s.name, s.header)); });
        return out_({ data: data });
      }
      case "upsert": {
        // { sheet, header, row } → replace the row whose first cell matches, or append it
        const sh = sheet_(req.sheet, req.header);
        const row = req.row.map(clean_);
        const i = findRow_(sh, row[0]);
        if (i > 0) sh.getRange(i, 1, 1, row.length).setValues([row]);
        else sh.appendRow(row);
        return out_({ ok: true });
      }
      case "delete": {
        // { sheet, header, id } → remove that row
        const sh = sheet_(req.sheet, req.header);
        const i = findRow_(sh, req.id);
        if (i > 0) sh.deleteRow(i);
        return out_({ ok: true });
      }
      case "replace": {
        // { sheet, header, rows } → overwrite every data row
        const sh = sheet_(req.sheet, req.header);
        if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getMaxColumns()).clearContent();
        const rows = (req.rows || []).map(function (r) { return r.map(clean_); });
        if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
        return out_({ ok: true });
      }
      default:
        return out_({ error: "Unknown operation." });
    }
  } catch (err) {
    return out_({ error: "Sheet error: " + err.message });
  } finally {
    lock.releaseLock();
  }
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0 && header && header.length) {
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(header.length, 1)).setNumberFormat("@"); // keep everything as plain text
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getDisplayValues()
    .filter(function (r) { return String(r[0]).trim() !== ""; });
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

// Never let guest text become a formula.
function clean_(v) {
  return String(v == null ? "" : v).replace(/^[=+\-@\s]+/, "");
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
