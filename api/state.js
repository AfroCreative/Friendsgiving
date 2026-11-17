import { loadAll, publicState, route, send, HttpError } from "./_store.js";

// GET /api/state: the event settings and every RSVP (without edit keys).
// Cached at Vercel's edge for a few seconds so many guests polling at once don't hammer the sheet.
export default route(async (req, res) => {
  if (req.method !== "GET") throw new HttpError(405, "Use GET.");
  send(res, 200, publicState(await loadAll()), "public, s-maxage=4");
});
