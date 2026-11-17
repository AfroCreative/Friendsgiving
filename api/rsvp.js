import {
  CAT_IDS, SLOT_IDS, STATUSES, MAX_RSVPS, HttpError,
  countRsvps, getEvent, getRsvp, hashSecret, putRsvp, readBody, route, send, str,
} from "./_store.js";

// POST /api/rsvp — create or update the caller's own RSVP.
// The browser keeps a random id + secret; only the matching secret can change that RSVP.
export default route(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  const b = await readBody(req);

  const id = String(b.id || "");
  const secret = String(b.secret || "");
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id) || secret.length < 16 || secret.length > 100) {
    throw new HttpError(400, "Your browser sent a broken RSVP key. Reload the page and try again.");
  }

  const name = str(b.name, 40);
  const status = String(b.status || "");
  if (!name) throw new HttpError(400, "Add your name so we know who's coming.");
  if (!STATUSES.includes(status)) throw new HttpError(400, "Pick Count me in, Maybe, or Can't make it.");

  const existing = await getRsvp(id);
  if (existing && existing.secretHash !== hashSecret(secret)) {
    throw new HttpError(403, "This RSVP was made on another device. Use your personal edit link to change it.");
  }
  if (!existing && (await countRsvps()) >= MAX_RSVPS) {
    throw new HttpError(429, "The guest list is full.");
  }

  const event = await getEvent();
  const going = status !== "no";
  let times = Array.isArray(b.times) ? [...new Set(b.times.map(String))].filter((t) => SLOT_IDS.includes(t)) : [];
  if (event.final) times = existing?.times || times; // voting is closed: keep earlier votes
  const cat = going && CAT_IDS.includes(b.cat) ? b.cat : "";
  if (going && !cat) throw new HttpError(400, "Choose what you'll bring.");
  if (going && !event.final && !times.length) throw new HttpError(400, "Pick at least one time that works for you.");

  const party = Math.min(5, Math.max(1, parseInt(b.party, 10) || 1));
  const record = {
    name, status, party, times,
    cat,
    dish: going ? str(b.dish, 60) : "",
    diet: str(b.diet, 80),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    secretHash: hashSecret(secret),
  };
  await putRsvp(id, record);
  send(res, 200, { ok: true });
});
