# Friendsgiving 2026 🍂

An invite and RSVP site for Friendsgiving on **Sunday, Nov 22, 4:00–8:00 PM**. Friends RSVP and claim an item from the menu (chicken, pizzas, drinks, mac & cheese, snacks). Each item can be claimed once, so nothing gets doubled up. When you're ready, you add the address and send the final invite.

- `index.html`: the whole page (design, animations, form and host panel)
- `api/state.js`: `GET`, returns the event details and every RSVP
- `api/rsvp.js`: `POST`, saves a guest's own RSVP
- `api/event.js`: `POST`, host-only actions (needs the host password)
- `api/_store.js`: shared helpers and the connection to Supabase
- `supabase/setup.sql`: creates the database tables (run once)

No build step and no npm packages. RSVPs are stored in your Supabase database. Only the site's server can reach it; guests' browsers never talk to Supabase directly.

## Set up (Vercel + Supabase)

1. **Import the repo.** In Vercel, go to **Add New → Project** and import this GitHub repo. Leave Framework Preset as **Other** and the build settings empty.
2. **Connect Supabase.** In the Vercel project, open **Storage**, and create or connect a Supabase database to this project. Vercel adds `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (among others) to the project automatically.
3. **Create the tables.** Open the database in Supabase (from Vercel's Storage tab, **Open in Supabase**), go to **SQL Editor → New query**, paste in all of `supabase/setup.sql`, and click **Run**. You should see "Success. No rows returned".
4. **Set your host password.** In Vercel go to **Settings → Environment Variables** and add `HOST_PASSWORD` with a password only you know.
5. **Redeploy.** Go to **Deployments → ⋯ → Redeploy** so the variables take effect.

Open your `*.vercel.app` URL and RSVP yourself as a test. If something isn't set up, the page shows a message naming the step to check.

To see the RSVPs in Supabase, open **Table Editor** and pick `fg_guest_list` (or `fg_rsvps` for the raw rows).

> Vercel deploys your repo's production branch. If your site only shows up as a "Preview" deployment, set **Settings → Git → Production Branch** to the branch this code is on, or merge it into `main`.

> If you set up Upstash Redis or a Google Sheet earlier, you can remove them along with the `KV_*` and `SHEET_*` variables. The site no longer uses them.

## Using it

- **Guests** just open the link. Their browser remembers their RSVP. After saving, they get a personal edit link they can use to update it from another device.
- **You (the host):** click **I'm the host** at the bottom of the page (or open `/?host`) and enter `HOST_PASSWORD`. You can then:
  - add the dinner time, address and a note
  - press **Send the final invite**: everyone now sees the invitation card at the top of the page, with calendar buttons
  - copy the ready-made group-chat message
  - remove an RSVP with the × next to a guest's name (you also see their dietary notes)
  - **Take the invite down** if plans change

You can also fix things directly in Supabase's Table Editor (`fg_rsvps`), like a typo in someone's dish. Don't change the `id` or `secret_hash` columns.

To change the party time, edit `START`, `END` and `TIME_LABEL` near the top of the script in `index.html` (and the hero chip text `4–8 PM`). To change the menu, edit `MENU` in `index.html` **and** `ITEMS` in `api/_store.js` (use the same ids in both).

## Run locally

Without the Supabase variables, the API keeps data in memory, which is handy for trying things out:

```bash
npm i -g vercel
HOST_PASSWORD=test vercel dev
```
