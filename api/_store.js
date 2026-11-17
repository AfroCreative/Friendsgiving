// Shared helpers for the API routes. Files starting with "_" are not deployed as routes.
import crypto from "node:crypto";

export const SLOT_IDS = ["12", "13", "14", "15", "16"];
export const CAT_IDS = ["main", "side", "dessert", "app", "drink", "supply"];
export const STATUSES = ["yes", "maybe", "no"];
const MAX_RSVPS = 200;

const RSVP_KEY = "fg:rsvps";
const EVENT_KEY = "fg:event";

// Vercel's Upstash Redis integration sets KV_REST_API_*; a direct Upstash setup uses UPSTASH_REDIS_REST_*.
const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const hasDb = Boolean(DB_URL && DB_TOKEN);

// Local development without a database keeps data in memory.
const mem = globalThis.__fgMem || (globalThis.__fgMem = { rsvps: new Map(), event: null });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function requireDb() {
  if (!hasDb && process.env.VERCEL) {
    throw new HttpError(503, "The database isn't connected yet. In Vercel, add Upstash Redis under Storage and redeploy.");
  }
}

async function redis(command) {
  const r = await fetch(DB_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${DB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new HttpError(502, "Database error: " + (j.error || r.status));
  return j.result;
}

export async function getRsvps() {
  requireDb();
  if (!hasDb) return Object.fromEntries([...mem.rsvps].map(([k, v]) => [k, JSON.parse(v)]));
  const flat = (await redis(["HGETALL", RSVP_KEY])) || [];
  const out = {};
  for (let i = 0; i < flat.length; i += 2) {
    try { out[flat[i]] = JSON.parse(flat[i + 1]); } catch { /* skip corrupt row */ }
  }
  return out;
}

export async function getRsvp(id) {
  requireDb();
  if (!hasDb) { const v = mem.rsvps.get(id); return v ? JSON.parse(v) : null; }
  const v = await redis(["HGET", RSVP_KEY, id]);
  return v ? JSON.parse(v) : null;
}

export async function countRsvps() {
  requireDb();
  if (!hasDb) return mem.rsvps.size;
  return Number(await redis(["HLEN", RSVP_KEY])) || 0;
}

export async function putRsvp(id, data) {
  requireDb();
  const v = JSON.stringify(data);
  if (!hasDb) { mem.rsvps.set(id, v); return; }
  await redis(["HSET", RSVP_KEY, id, v]);
}

export async function deleteRsvp(id) {
  requireDb();
  if (!hasDb) { mem.rsvps.delete(id); return; }
  await redis(["HDEL", RSVP_KEY, id]);
}

export async function getEvent() {
  requireDb();
  if (!hasDb) return mem.event ? JSON.parse(mem.event) : {};
  const v = await redis(["GET", EVENT_KEY]);
  return v ? JSON.parse(v) : {};
}

export async function putEvent(data) {
  requireDb();
  const v = JSON.stringify(data);
  if (!hasDb) { mem.event = v; return; }
  await redis(["SET", EVENT_KEY, v]);
}

export { MAX_RSVPS };

export const hashSecret = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

export function checkHostPassword(given) {
  const real = process.env.HOST_PASSWORD;
  if (!real) throw new HttpError(503, "No host password is set. Add HOST_PASSWORD in Vercel's environment variables and redeploy.");
  const a = Buffer.from(hashSecret(given || ""));
  const b = Buffer.from(hashSecret(real));
  if (!crypto.timingSafeEqual(a, b)) throw new HttpError(401, "That's not the host password.");
}

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

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
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

export function publicRsvp(id, r) {
  const { secretHash, ...rest } = r;
  return { id, ...rest };
}
