import {
  CAT_IDS, ITEMS, LINA_ONLY, isLina, STATUSES, MAX_RSVPS, ID_RE, HttpError,
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
  const times = []; // the time is fixed (4–9 PM), so there's nothing to vote on
  const cat = going && CAT_IDS.includes(b.cat) ? b.cat : "";
  if (going && !cat) throw new HttpError(400, "Choose what you'll bring.");
  if (going && LINA_ONLY.has(cat) && !isLina(name)) throw new HttpError(403, "Habesha food is Lina-only. House rules.");
  if (going && cat === "other" && !str(b.dish, 60)) throw new HttpError(400, "Tell us what you're bringing.");
  if (going && cat !== "other") {
    const holder = Object.entries(state.rsvps).find(([oid, r]) => oid !== id && r.cat === cat && r.status !== "no");
    if (holder) throw new HttpError(409, `${ITEMS[cat]} was just claimed by ${holder[1].name}. Pick another item.`);
  }

  const record = {
    name, status, times, cat,
    party: Math.min(5, Math.max(1, parseInt(b.party, 10) || 1)),
    dish: going ? str(b.dish, 60) : "",
    diet: str(b.diet, 80),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    secretHash: hashSecret(secret),
  };
  await putRsvp(id, record);
  state.rsvps[id] = record;
  send(res, 200, { ok: true, ...publicState(state) });
});
