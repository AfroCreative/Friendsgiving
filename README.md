# Friendsgiving 2026 🍂

An invite and RSVP site for Friendsgiving on **Sunday, Nov 22**. Friends RSVP, vote on a start time and claim a dish for the potluck. When you're ready, you lock in the time, add the address and send the final invite.

- `index.html`: the whole page (design, animations, form and host panel)
- `api/state.js`: `GET`, returns the event details and every RSVP
- `api/rsvp.js`: `POST`, saves a guest's own RSVP
- `api/event.js`: `POST`, host-only actions (needs the host password)
- `api/_store.js`: shared helpers and the connection to the Google Sheet
- `google-apps-script/Code.gs`: a small script you paste into your Google Sheet so the site can read and write it

No build step and no npm packages. All RSVPs land in a Google Sheet you own, one row per guest, so you can read them there any time.

## Set up the Google Sheet

1. **Create a sheet.** Go to [sheets.new](https://sheets.new) and name it something like "Friendsgiving RSVPs".
2. **Add the script.** In the sheet, open **Extensions → Apps Script**. Delete what's there and paste in the whole of `google-apps-script/Code.gs` from this repo.
3. **Pick a secret.** On the line `const SECRET = "PASTE-…"`, replace the text inside the quotes with a long random string (at least 30 letters and numbers; a password generator works well). Keep it handy for step 7. Click **Save** (the disk icon).
4. **Deploy it as a web app.** Click **Deploy → New deployment**, click the gear next to "Select type" and choose **Web app**. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone

   Click **Deploy**. Google asks you to authorize access: choose your account, then **Advanced → Go to (project name)** and **Allow**. This lets the script edit *your* sheet.
5. **Copy the Web app URL.** It ends in `/exec`.

The script's URL only works with your secret, so "Anyone" here doesn't let strangers read your sheet. The `RSVPs` and `Event` tabs appear by themselves after the first RSVP.

> If you edit the script later, use **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**, so the URL stays the same.

## Deploy on Vercel

6. **Import the repo.** In Vercel, go to **Add New → Project** and import this GitHub repo. Leave Framework Preset as **Other** and the build settings empty.
7. **Add three environment variables** (during import, or later under **Settings → Environment Variables**):

   | Name | Value |
   |---|---|
   | `SHEET_WEBAPP_URL` | the Web app URL from step 5 |
   | `SHEET_SECRET` | the same secret you put in the script in step 3 |
   | `HOST_PASSWORD` | a password only you know, to unlock the host panel |

8. **Deploy** (or, if it was already deployed, **Deployments → ⋯ → Redeploy** so the variables take effect).

Open your `*.vercel.app` URL and RSVP yourself as a test. A row should appear in the `RSVPs` tab of your sheet. If the page shows an error instead, it explains which step to check.

> Vercel deploys your repo's production branch. If your site only shows up as a "Preview" deployment, set **Settings → Git → Production Branch** to the branch this code is on, or merge it into `main`.

> If you used Upstash Redis before, you can remove it from the project. The site no longer uses it.

## Using it

- **Guests** just open the link. Their browser remembers their RSVP. After saving, they get a personal edit link they can use to update it from another device.
- **You (the host):** click **I'm the host** at the bottom of the page (or open `/?host`) and enter `HOST_PASSWORD`. You can then:
  - pick the final start time (vote counts are shown next to each option), dinner time, address and a note
  - press **Send the final invite**: everyone now sees the invitation card at the top of the page, with calendar buttons
  - copy the ready-made group-chat message
  - remove an RSVP with the × next to a guest's name (you also see their dietary notes)
  - **Reopen voting** if plans change

You can also fix things directly in the sheet, like a typo in someone's dish. Don't change the `ID` or `Edit key` columns, and keep times, categories and statuses spelled as the site writes them.

To change the time options or potluck categories, edit `SLOTS` / `CATS` in `index.html` **and** in `api/_store.js`.

## Run locally

Without the sheet variables, the API keeps data in memory, which is handy for trying things out:

```bash
npm i -g vercel
HOST_PASSWORD=test vercel dev
```
