import {
  SLOT_IDS, HttpError, checkHostPassword, deleteRsvp, getEvent, multiline, putEvent, readBody, route, send, str,
} from "./_store.js";

// POST /api/event — host-only actions, guarded by the HOST_PASSWORD environment variable.
//   { password, action: "check" }                       verify the password
//   { password, action: "save", time, dinner, address, note, final }   save event details / send invite
//   { password, action: "deleteRsvp", id }               remove a guest's RSVP
export default route(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  const b = await readBody(req);
  checkHostPassword(b.password);

  if (b.action === "check") return send(res, 200, { ok: true });

  if (b.action === "save") {
    const prev = await getEvent();
    const time = SLOT_IDS.includes(String(b.time)) ? String(b.time) : prev.time || "13";
    const event = {
      time,
      dinner: str(b.dinner, 30),
      address: multiline(b.address, 200),
      note: multiline(b.note, 300),
      final: Boolean(b.final),
      updatedAt: Date.now(),
    };
    await putEvent(event);
    return send(res, 200, { ok: true, event });
  }

  if (b.action === "deleteRsvp") {
    const id = String(b.id || "");
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) throw new HttpError(400, "Unknown guest.");
    await deleteRsvp(id);
    return send(res, 200, { ok: true });
  }

  throw new HttpError(400, "Unknown action.");
});
