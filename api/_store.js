// Shared helpers for the API routes. Files starting with "_" are not deployed as routes.
// Data lives in a Google Sheet, reached through the Apps Script web app in google-apps-script/Code.gs.
import crypto from "node:crypto";

export const SLOTS = { "12": "12:00 PM", "13": "1:00 PM", "14": "2:00 PM", "15": "3:00 PM", "16": "4:00 PM" };
export const CATS = { main: "Mains", side: "Sides", dessert: "Desserts", app: "Snacks & starters", drink: "Drinks", supply: "Supplies" };
export const STATUSES = { yes: "Coming", maybe: "Maybe", no: "Can't make it" };
export const SLOT_IDS = Object.keys(SLOTS);
export const CAT_IDS = Object.keys(CATS);
export const MAX_RSVPS = 200;
export const ID_RE = /^[A-Za-z0-9]{8,40}$/;

const RSVP_SHEET = "RSVPs";
const RSVP_HEADER = ["ID", "Name", "Status", "Party size", "Times that work", "Bringing", "Dish", "Dietary notes", "First RSVP", "Last updated", "Edit key (do not change)"];
const EVENT_SHEET = "Event";
const EVENT_HEADER = ["Setting", "Value"];

const SHEET_URL = process.env.SHEET_WEBAPP_URL;
const SHEET_SECRET = process.env.SHEET_SECRET;
const hasSheet = Boolean(SHEET_URL && SHEET_SECRET);

// Local development without a sheet keeps data in memory.
const mem = globalThis.__fgMem || (globalThis.__fgMem = { rsvps: new Map(), event: {} });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- Google Sheet transport ---------- */
async function sheet(body) {
  if (!hasSheet) {
    if (process.env.VERCEL) throw new HttpError(503, "The Google Sheet isn't connected yet. Add SHEET_WEBAPP_URL and SHEET_SECRET in Vercel and redeploy.");
    return null;
  }
  let r;
  try {
    r = await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: SHEET_SECRET, ...body }),
      redirect: "follow",
    });
  } catch {
    throw new HttpError(502, "Couldn't reach the Google Sheet. Try again in a moment.");
  }
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch {
    throw new HttpError(502, "Google sent back a web page instead of data. In the Apps Script deployment, set 'Who has access' to 'Anyone' and check SHEET_WEBAPP_URL ends in /exec.");
  }
  if (j.error) throw new HttpError(502, j.error);
  return j;
}

/* ---------- row <-> object ---------- */
const key = (map, label) => Object.keys(map).find((k) => map[k] === String(label).trim()) || "";
const iso = (ms) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "");
const fromIso = (s) => { const t = Date.parse(String(s).replace(" UTC", "Z").replace(" ", "T")); return Number.isFinite(t) ? t : 0; };

function rsvpToRow(id, r) {
  return [id, r.name, STATUSES[r.status] || r.status, String(r.party || 1),
    (r.times || []).map((t) => SLOTS[t]).filter(Boolean).join(", "),
    CATS[r.cat] || "", r.dish || "", r.diet || "", iso(r.createdAt), iso(r.updatedAt), r.secretHash || ""];
}
function rowToRsvp(row) {
  const [id, name, status, party, times, cat, dish, diet, created, updated, secretHash] = row.map((v) => String(v ?? ""));
  return [id.trim(), {
    name: name.trim(),
    status: key(STATUSES, status) || (status in STATUSES ? status : "yes"),
    party: Math.min(9, Math.max(1, parseInt(party, 10) || 1)),
    times: times.split(",").map((t) => key(SLOTS, t)).filter(Boolean),
    cat: key(CATS, cat),
    dish: dish.trim(),
    diet: diet.trim(),
    createdAt: fromIso(created),
    updatedAt: fromIso(updated),
    secretHash: secretHash.trim(),
  }];
}
function eventToRows(e) {
  return [
    ["Start time", SLOTS[e.time] || ""],
    ["Dinner time", e.dinner || ""],
    ["Address", e.address || ""],
    ["Note", e.note || ""],
    ["Invite sent", e.final ? "Yes" : "No"],
    ["Last updated", iso(e.updatedAt)],
  ];
}
function rowsToEvent(rows) {
  const m = Object.fromEntries(rows.map((r) => [String(r[0]).trim(), String(r[1] ?? "")]));
  if (!rows.length) return {};
  return {
    time: key(SLOTS, m["Start time"] || ""),
    dinner: m["Dinner time"] || "",
    address: m["Address"] || "",
    note: m["Note"] || "",
    final: /^(yes|true)$/i.test(m["Invite sent"] || ""),
    updatedAt: fromIso(m["Last updated"] || ""),
  };
}

/* ---------- store API used by the routes ---------- */
// One round trip: every RSVP and the event settings.
export async function loadAll() {
  const j = await sheet({ op: "read", sheets: [{ name: RSVP_SHEET, header: RSVP_HEADER }, { name: EVENT_SHEET, header: EVENT_HEADER }] });
  if (!j) return { rsvps: Object.fromEntries(mem.rsvps), event: { ...mem.event } };
  const rsvps = {};
  for (const row of j.data[RSVP_SHEET] || []) {
    const [id, r] = rowToRsvp(row);
    if (id) rsvps[id] = r;
  }
  return { rsvps, event: rowsToEvent(j.data[EVENT_SHEET] || []) };
}

export async function putRsvp(id, r) {
  const j = await sheet({ op: "upsert", sheet: RSVP_SHEET, header: RSVP_HEADER, row: rsvpToRow(id, r) });
  if (!j) mem.rsvps.set(id, r);
}

export async function deleteRsvp(id) {
  const j = await sheet({ op: "delete", sheet: RSVP_SHEET, header: RSVP_HEADER, id });
  if (!j) mem.rsvps.delete(id);
}

export async function putEvent(e) {
  const j = await sheet({ op: "replace", sheet: EVENT_SHEET, header: EVENT_HEADER, rows: eventToRows(e) });
  if (!j) mem.event = { ...e };
}

export function publicState({ rsvps, event }) {
  return {
    event,
    rsvps: Object.entries(rsvps).map(([id, { secretHash, ...rest }]) => ({ id, ...rest })),
  };
}

/* ---------- misc helpers ---------- */
export const hashSecret = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

export function checkHostPassword(given) {
  const real = process.env.HOST_PASSWORD;
  if (!real) throw new HttpError(503, "No host password is set. Add HOST_PASSWORD in Vercel's environment variables and redeploy.");
  const a = Buffer.from(hashSecret(given || ""));
  const b = Buffer.from(hashSecret(real));
  if (!crypto.timingSafeEqual(a, b)) throw new HttpError(401, "That's not the host password.");
}

// Strip control characters and anything that could make a sheet cell a formula.
const noFormula = (s) => s.replace(/^[=+\-@\s]+/, "");
export const str = (v, max) => noFormula(String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, max);
export const multiline = (v, max) => noFormula(String(v ?? "").replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim()).slice(0, max);

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 20000) throw new HttpError(413, "Request too large."); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export function send(res, status, obj, cache = "no-store") {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(JSON.stringify(obj));
}

export function route(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      if (e instanceof HttpError) send(res, e.status, { error: e.message });
      else { console.error(e); send(res, 500, { error: "Something went wrong on the server." }); }
    }
  };
}
