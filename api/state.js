import { getEvent, getRsvps, publicRsvp, route, send, HttpError } from "./_store.js";

// GET /api/state — the event settings and every RSVP (without edit secrets).
export default route(async (req, res) => {
  if (req.method !== "GET") throw new HttpError(405, "Use GET.");
  const [event, rsvps] = await Promise.all([getEvent(), getRsvps()]);
  send(res, 200, {
    event,
    rsvps: Object.entries(rsvps).map(([id, r]) => publicRsvp(id, r)),
  });
});
