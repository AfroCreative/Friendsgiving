import {
  ID_RE, HttpError, checkHostPassword, deleteRsvp, loadAll, multiline, publicState, putEvent, readBody, route, send, str,
} from "./_store.js";

// POST /api/event: host-only actions, guarded by the HOST_PASSWORD environment variable.
//   { password, action: "check" }                                     verify the password
//   { password, action: "save", dinner, address, note, final }  save event details / send invite
//   { password, action: "deleteRsvp", id }                            remove a guest's RSVP
// "save" and "deleteRsvp" respond with the fresh state.
export default route(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  const b = await readBody(req);
  checkHostPassword(b.password);

  if (b.action === "check") return send(res, 200, { ok: true });

  if (b.action === "save") {
    const event = {
      time: "16", // fixed: Sunday 4:00–8:00 PM
      dinner: str(b.dinner, 30),
      address: multiline(b.address, 200),
      note: multiline(b.note, 300),
      final: Boolean(b.final),
      updatedAt: Date.now(),
    };
    await putEvent(event);
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
