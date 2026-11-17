# Friendsgiving 2026 🍂

An invite and RSVP site for Friendsgiving on **Sunday, Nov 22**. Friends RSVP, vote on a start time and claim a dish for the potluck. When you're ready, you lock in the time, add the address and send the final invite.

- `index.html`: the whole page (design, animations, form and host panel)
- `api/state.js`: `GET`, returns the event details and every RSVP
- `api/rsvp.js`: `POST`, saves a guest's own RSVP
- `api/event.js`: `POST`, host-only actions (needs the host password)
- `api/_store.js`: shared helpers and the database connection (Upstash Redis)

No build step and no npm packages.

## Deploy on Vercel

1. **Import the repo.** In Vercel, go to **Add New → Project** and import this GitHub repo. Leave Framework Preset as **Other** and leave the build settings empty. Click **Deploy**.
2. **Add the database.** In the project, open **Storage → Create Database** (or **Marketplace**), choose **Upstash → Redis** on the free plan and connect it to this project. This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables automatically.
3. **Set your host password.** Go to **Settings → Environment Variables** and add `HOST_PASSWORD` with a password only you know.
4. **Redeploy.** Go to **Deployments → ⋯ → Redeploy** so the new variables take effect.

Then open your `*.vercel.app` URL. If the page says the database isn't connected, step 2 or 4 didn't take.

> Vercel deploys your repo's production branch. If your site only shows up as a "Preview" deployment, set **Settings → Git → Production Branch** to the branch this code is on, or merge it into `main`.

## Using it

- **Guests** just open the link. Their browser remembers their RSVP. After saving, they get a personal edit link they can use to update it from another device.
- **You (the host):** click **I'm the host** at the bottom of the page (or open `/?host`) and enter `HOST_PASSWORD`. You can then:
  - pick the final start time (vote counts are shown next to each option), dinner time, address and a note
  - press **Send the final invite**: everyone now sees the invitation card at the top of the page, with calendar buttons
  - copy the ready-made group-chat message
  - remove an RSVP with the × next to a guest's name (you also see their dietary notes)
  - **Reopen voting** if plans change

To change the time options or potluck categories, edit `SLOTS` / `CATS` in `index.html` **and** `SLOT_IDS` / `CAT_IDS` in `api/_store.js`.

## Run locally

Without database variables, the API keeps data in memory, which is handy for trying things out:

```bash
npm i -g vercel
HOST_PASSWORD=test vercel dev
```
