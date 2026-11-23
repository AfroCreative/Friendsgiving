import crypto from "node:crypto";
import {
  santaPeople, putRsvps, ID_RE, HttpError, checkHostPassword, deleteRsvp, loadAll, multiline, publicState, putEvent, readBody, route, send, str,
} from "./_store.js";

// POST /api/event: host-only actions, guarded by the HOST_PASSWORD environment variable.
//   { password, action: "check" }                                     verify the password
//   { password, action: "save", dinner, address, note, final }  save event details / send invite
//   { password, action: "drawSanta" }                                 draw (or redraw) Secret Santa names
//   { password, action: "deleteRsvp", id }                            remove a guest's RSVP
// Everything but "check" responds with the fresh state. The host never sees who drew whom.
export default route(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  const b = await readBody(req);
  checkHostPassword(b.password);

  if (b.action === "check") return send(res, 200, { ok: true });

  if (b.action === "save") {
    const { event: prev } = await loadAll();
    const event = {
      santaDrawnAt: prev.santaDrawnAt || 0,
      time: "17", // fixed: Saturday, Dec 26, 5:00–10:00 PM
      dinner: str(b.dinner, 30),
      address: multiline(b.address, 200),
      note: multiline(b.note, 300),
      final: Boolean(b.final),
      updatedAt: Date.now(),
    };
    await putEvent(event);
    return send(res, 200, { ok: true, ...publicState(await loadAll()) });
  }

  if (b.action === "drawSanta") {
    // Shuffle everyone in, then each person buys for the next one in the circle:
    // nobody draws themselves, and everyone gives and gets exactly one gift.
    const state = await loadAll();
    const people = santaPeople(state.rsvps);
    if (people.length < 3) throw new HttpError(400, "Secret Santa needs at least 3 people. Right now " + people.length + " have joined.");
    for (let i = people.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [people[i], people[j]] = [people[j], people[i]];
    }
    const inIds = new Set(people.map(([id]) => id));
    const changed = people.map(([id, r], i) => [id, { ...r, santaTo: people[(i + 1) % people.length][0] }]);
    for (const [id, r] of Object.entries(state.rsvps)) if (!inIds.has(id) && r.santaTo) changed.push([id, { ...r, santaTo: "" }]);
    await putRsvps(changed);
    await putEvent({ ...state.event, santaDrawnAt: Date.now() });
    return send(res, 200, { ok: true, ...publicState(await loadAll()) });
  }

  if (b.action === "deleteRsvp") {
    const id = String(b.id || "");
    if (!ID_RE.test(id)) throw new HttpError(400, "Unknown guest.");
    await deleteRsvp(id);
    return send(res, 200, { ok: true, ...publicState(await loadAll()) });
  }

  throw new HttpError(400, "Unknown action.");
});
