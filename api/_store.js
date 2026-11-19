// Shared helpers for the API routes. Files starting with "_" are not deployed as routes.
// Data lives in Supabase (tables from supabase/setup.sql), reached through its REST API with the
// service role key, which stays on the server. Guests' browsers never talk to Supabase directly.
import crypto from "node:crypto";

export const SLOT_IDS = ["12", "13", "14", "15", "16"];
// The menu. Keep in sync with MENU in index.html. Guests can pick any number of items, and any number
// of guests can pick the same item. Stored as a comma-separated list in the "cat" column.
export const ITEMS = {
  chicken: "Chicken",
  "pizza-chicken": "Chicken pizza", "pizza-beef": "Beef pizza", "pizza-cheese": "Cheese pizza",
  coke: "Coke", fanta: "Fanta", sprite: "Sprite", water: "Water",
  mac: "Mac & cheese",
  chips: "Chips", sambusa: "Sambusa", chocolate: "Chocolate",
  other: "Something else",
  // Habesha food: Lina only.
  "doro-wat": "Doro wat", shiro: "Shiro", injera: "Injera", kitfo: "Kitfo",
};
export const LINA_ONLY = new Set(["doro-wat", "shiro", "injera", "kitfo"]);
export const isLina = (name) => /^lina\b/i.test(String(name || "").trim());
export const CAT_IDS = Object.keys(ITEMS);
export const STATUSES = { yes: "Coming", maybe: "Maybe", no: "Can't make it" };
export const MAX_RSVPS = 200;
export const ID_RE = /^[A-Za-z0-9]{8,40}$/;

// Vercel's Supabase integration sets these automatically.
const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
const hasDb = Boolean(SB_URL && SB_KEY);

// Local development without Supabase keeps data in memory.
const mem = globalThis.__fgMem || (globalThis.__fgMem = { rsvps: new Map(), event: {} });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- Supabase REST transport ---------- */
async function sb(path, { method = "GET", body, prefer } = {}) {
  if (!hasDb) {
    if (process.env.VERCEL) throw new HttpError(503, "The database isn't connected yet. In Vercel, connect Supabase under Storage (it adds SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY), then redeploy.");
    return null;
  }
  const headers = { apikey: SB_KEY, "Content-Type": "application/json" };
  if (SB_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SB_KEY}`; // legacy JWT keys; new sb_secret_ keys go in apikey only
  if (prefer) headers.Prefer = prefer;
  let r;
  try {
    r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new HttpError(502, "Couldn't reach the database. Try again in a moment.");
  }
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!r.ok) {
    const code = j?.code || "";
    const msg = j?.message || text || r.statusText;
    if (code === "PGRST205" || code === "42P01" || /could not find the table|does not exist/i.test(msg)) {
      throw new HttpError(503, "The database tables aren't set up yet. Run supabase/setup.sql in Supabase's SQL Editor.");
    }
    if (r.status === 401 || r.status === 403) throw new HttpError(503, "The database rejected the server's key. Check SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy.");
    console.error("Supabase error", r.status, msg);
    throw new HttpError(502, "Database error. Try again in a moment.");
  }
  return j ?? [];
}

/* ---------- row <-> object ---------- */
const ms = (t) => { const v = Date.parse(t || ""); return Number.isFinite(v) ? v : 0; };
const isoOf = (v) => new Date(v || Date.now()).toISOString();

function rowToRsvp(r) {
  return {
    name: r.name || "",
    status: r.status in STATUSES ? r.status : "yes",
    party: r.party || 1,
    times: (r.times || []).filter((t) => SLOT_IDS.includes(t)),
    items: String(r.cat || "").split(",").map((s) => s.trim()).filter((s) => CAT_IDS.includes(s)),
    dish: r.dish || "",
    diet: r.diet || "",
    createdAt: ms(r.created_at),
    updatedAt: ms(r.updated_at),
    secretHash: r.secret_hash || "",
  };
}
function rowToEvent(r) {
  if (!r) return {};
  return { time: r.time || "13", dinner: r.dinner || "", address: r.address || "", note: r.note || "", final: !!r.final, updatedAt: ms(r.updated_at) };
}

/* ---------- store API used by the routes ---------- */
export async function loadAll() {
  const [rows, ev] = await Promise.all([
    sb("fg_rsvps?select=*&order=created_at.asc&limit=1000"),
    sb("fg_event?id=eq.1&select=*"),
  ]);
  if (!rows) return { rsvps: Object.fromEntries(mem.rsvps), event: { ...mem.event } };
  const rsvps = {};
  for (const r of rows) rsvps[r.id] = rowToRsvp(r);
  return { rsvps, event: rowToEvent(ev[0]) };
}

export async function putRsvp(id, r) {
  const j = await sb("fg_rsvps?on_conflict=id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      id, name: r.name, status: r.status, party: r.party, times: r.times, cat: (r.items || []).join(","), dish: r.dish, diet: r.diet,
      secret_hash: r.secretHash, created_at: isoOf(r.createdAt), updated_at: isoOf(r.updatedAt),
    },
  });
  if (!j) mem.rsvps.set(id, r);
}

export async function deleteRsvp(id) {
  const j = await sb(`fg_rsvps?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" });
  if (!j) mem.rsvps.delete(id);
}

export async function putEvent(e) {
  const j = await sb("fg_event?on_conflict=id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { id: 1, time: e.time, dinner: e.dinner, address: e.address, note: e.note, final: e.final, updated_at: isoOf(e.updatedAt) },
  });
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

// Strip control characters and trim to a maximum length.
export const str = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
export const multiline = (v, max) => String(v ?? "").replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);

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
