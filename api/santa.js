import { HttpError, ID_RE, hashSecret, loadAll, readBody, route, santaPeople, send } from "./_store.js";

// POST /api/santa { id, secret }: this guest's own Secret Santa details.
// Only the guest's own browser (holding their secret) can see who they're buying for.
export default route(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  const b = await readBody(req);
  const id = String(b.id || "");
  if (!ID_RE.test(id)) throw new HttpError(400, "Unknown guest.");

  const { rsvps, event } = await loadAll();
  const me = rsvps[id];
  if (!me || !me.secretHash || me.secretHash !== hashSecret(String(b.secret || ""))) {
    return send(res, 200, { joined: false, wish: "", drawn: Boolean(event.santaDrawnAt), match: null });
  }

  const inIt = new Set(santaPeople(rsvps).map(([pid]) => pid));
  const joined = inIt.has(id);
  const them = joined && event.santaDrawnAt && inIt.has(me.santaTo) ? rsvps[me.santaTo] : null;
  send(res, 200, {
    joined,
    wish: me.wish || "",
    drawn: Boolean(event.santaDrawnAt),
    match: them ? { name: them.name, wish: them.wish || "" } : null,
  });
});
