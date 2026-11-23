import {
  CAT_IDS, STATUSES, MAX_RSVPS, ID_RE, HttpError,
  hashSecret, loadAll, publicState, putRsvp, readBody, route, send, str,
} from "./_store.js";

// POST /api/rsvp: create or update the caller's own RSVP.
// The browser keeps a random id + secret; only the matching secret can change that RSVP.
// Responds with the fresh state so the page updates right away.
export default route(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  const b = await readBody(req);

  const id = String(b.id || "");
  const secret = String(b.secret || "");
  if (!ID_RE.test(id) || secret.length < 16 || secret.length > 100) {
    throw new HttpError(400, "Your browser sent a broken RSVP key. Reload the page and try again.");
  }

  const name = str(b.name, 40);
  const status = String(b.status || "");
  if (!name) throw new HttpError(400, "Add your name so we know who's coming.");
  if (!(status in STATUSES)) throw new HttpError(400, "Pick Count me in, Maybe, or Can't make it.");

  const state = await loadAll();
  const existing = state.rsvps[id];
  if (existing && existing.secretHash && existing.secretHash !== hashSecret(secret)) {
    throw new HttpError(403, "This RSVP was made on another device. Use your personal edit link to change it.");
  }
  if (!existing && Object.keys(state.rsvps).length >= MAX_RSVPS) {
    throw new HttpError(429, "The guest list is full.");
  }

  const going = status !== "no";
  const times = []; // the time is fixed (Dec 26, 5–10 PM), so there's nothing to vote on
  // Pick as many items as you like; anyone can bring the same thing as someone else.
  const items = going && Array.isArray(b.items) ? [...new Set(b.items.map(String))].filter((i) => CAT_IDS.includes(i)) : [];
  if (going && !items.length) throw new HttpError(400, "Choose at least one thing to bring.");
  if (items.includes("other") && !str(b.dish, 120)) throw new HttpError(400, "Tell us what else you're bringing.");

  const record = {
    name, status, times, items,
    party: Math.min(5, Math.max(1, parseInt(b.party, 10) || 1)),
    dish: going ? str(b.dish, 120) : "",
    diet: str(b.diet, 80),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    secretHash: hashSecret(secret),
  };
  await putRsvp(id, record);
  state.rsvps[id] = record;
  send(res, 200, { ok: true, ...publicState(state) });
});
