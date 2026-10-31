# Everything – setup guide

Time needed: about 30–40 minutes. Cost: £0.

You need: a Supabase account, a GitHub account, a Vercel account (all free), your MacBook and your iPhone.

---

## Part 1 – Database (Supabase)

1. Go to **supabase.com** → **New project**. Name: `everything`. Region: **London (eu-west-2)**. Set a database password (save it). Click **Create**.
   *Free plan allows 2 active projects. If you're at the limit, pause one you don't use.*
2. When it's ready: left menu → **SQL Editor** → **New query**.
3. Open `supabase/schema.sql` from this folder on your Mac, copy **everything**, paste, click **Run**. You should see "Success. No rows returned".
4. Left menu → **Project Settings** (cog) → **API Keys** (or **Data API**). Copy into a note:
   - **Project URL** (e.g. `https://abcd.supabase.co`) – under Data API
   - **anon / publishable key**
   - **service_role / secret key** (keep private)
   *If you see both "new" and "Legacy" keys, either pair works.*

## Part 2 – Code (GitHub)

5. Go to **github.com** → **+** → **New repository**. Name `everything-app`, choose **Private**, click **Create**.
6. On the new repo page click **uploading an existing file**.
7. Unzip the download on your Mac. Open the `everything` folder, select **all files and folders inside it** (Cmd+A) and drag them onto the GitHub page. *Use Chrome if Safari doesn't accept folders.*
8. Check `index.html`, `api`, `js`, `css` are at the top level (not inside another folder). Click **Commit changes**.

## Part 3 – Hosting (Vercel)

9. Go to **vercel.com** → **Add New… → Project** → import `everything-app`.
10. Framework Preset: **Other**. Leave build settings empty.
11. Open **Environment Variables** and add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Project URL from step 4 |
| `SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |

12. Click **Deploy**. When done, copy your address, e.g. `https://everything-app-xyz.vercel.app`.

## Part 4 – Sign-in emails

13. Supabase → **Authentication** → **URL Configuration**:
    - **Site URL**: your Vercel address
    - **Redirect URLs** → Add: `https://YOUR-APP.vercel.app/**`
    - Save.

## Part 5 – Notification keys

14. On your Mac open `https://YOUR-APP.vercel.app/setup.html` → **Generate keys**.
15. Vercel → your project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | from setup page |
| `VAPID_PRIVATE_KEY` | from setup page |
| `CRON_SECRET` | from setup page |
| `VAPID_SUBJECT` | `mailto:your@email.com` (your real email) |
| `GEMINI_API_KEY` | *optional* – free key from aistudio.google.com → Get API key. Improves reading of event pages |

16. Vercel → **Deployments** → **⋯** on the latest → **Redeploy**. (Env var changes only apply after a redeploy.)

## Part 6 – Reminder timer

17. Open `supabase/cron.sql`, replace `YOUR-APP.vercel.app` and `YOUR_CRON_SECRET` with your values.
18. Supabase → SQL Editor → New query → paste → **Run**.
    *If it errors on the extensions, go to Database → Extensions, enable **pg_cron** and **pg_net**, then run again.*

## Part 7 – Install on iPhone

19. On iPhone **Safari** open your Vercel address → **Create an account** → confirm via the email link → sign in.
20. Tap **Share** → **Add to Home Screen** → **Add**.
21. Open **Everything from the Home Screen icon** and sign in again (the Home Screen app has its own login).
    You'll see Events, Tasks and Shopping.
22. ⚙︎ **Settings** → **Turn on notifications** → **Allow** → **Send test notification**. You should get a notification.

## Part 8 – Share button (iOS Shortcut)

23. In the app: **Settings → Copy Shortcut URL**.
24. Open the **Shortcuts** app → **+** (top right).
25. Tap the name at the top → **Rename** → `Add to Everything`.
26. Tap the **ⓘ** (bottom) → turn on **Show in Share Sheet** → **Done**.
    A block "Receive **Any** input from **Share Sheet**" appears at the top. Tap **Any** → tap **Clear** → tick **URLs**, **Safari web pages** and **Text** → **Done**.
27. Tap **Search Actions** (bottom) → type `Get URLs from` → tap **Get URLs from Input**. It connects to *Shortcut Input* automatically.
28. Search `Get contents` → tap **Get Contents of URL**.
    - Tap the blue **URLs** in the URL box → delete it → paste your Shortcut URL (step 23).
    - Tap **›** (Show More) → **Method**: **POST** → **Request Body**: **JSON**.
    - Tap **Add new field** → **Text**. **Key**: `url`. Tap the **Text** (value) box → in the bar above the keyboard tap **URLs**.
      *If the bar doesn't appear: tap the value box, tap **Select Variable**, then tap the blue "URLs" under the "Get URLs from Input" block.*
29. Search `Show notification` → tap **Show Notification**. It automatically shows **Contents of URL**.
30. Tap **Done**.
31. Test: Safari → open any event page → **Share** → scroll the apps row / **Edit Actions** → **Add to Everything**. A notification says "Added to Events: …".
    *First time, iOS may ask "Allow to connect to your-app.vercel.app?" → **Always Allow**.*

## Part 9 – Share a category with someone 

32. Open the category → **👥** → enter her email → **Can edit** or **View only** → **Invite** → **Copy app link** and send it to her.
33. She opens the link, creates an account with **that same email**, adds it to her Home Screen and signs in. The category appears.
    If she already has an account, she just closes and reopens the app.

---

## Nearby trains

The home screen shows the next three live TfL departures from the nearest Tube, DLR, Overground, Elizabeth line or Tram station. Add `TFL_APP_KEY` to `.env.local` for local development and to Vercel environment variables; the key is used only by `/api/departures`.

Train providers live in `lib/trains/providers/`. To add another provider, implement `findNearby(lat, lon)` and `getDepartures(station)` with the normalized station/departure fields, then register it in `lib/trains/index.js`.

## Making changes later (with AI)
1. Give the AI `AI_GUIDE.md` plus the file(s) involved and describe the change.
2. In GitHub open the file → ✏️ (Edit) → paste the new version → **Commit changes**. New files: **Add file → Create new file**.
3. Vercel redeploys automatically in ~30 seconds. Close and reopen the app on iPhone.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Setup incomplete" on open | Supabase env vars missing in Vercel → add and **Redeploy** |
| No "Turn on notifications" button / says Home Screen | Open the app from the Home Screen icon, not Safari |
| Test notification doesn't arrive | Check VAPID vars, redeploy, then in app turn notifications on again |
| Reminders never arrive but test works | Check `cron.sql` URL + secret; Supabase → Integrations/Cron → job history |
| Shortcut says "Invalid token" | Copy the Shortcut URL again from Settings and paste it into the Shortcut |
| Event card missing price/date | Some sites hide this. Tap the card and fill in; adding `GEMINI_API_KEY` helps |
| Supabase project paused | Free projects pause after a week with no use – open the Supabase dashboard and **Restore** |
