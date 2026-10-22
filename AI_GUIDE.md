# AI guide – read this before changing the app

Paste this file (plus the files you want changed) into any AI tool when asking for changes.

## Stack (no build step)
- **Frontend**: plain HTML + CSS + JavaScript modules. No React, no bundler. Files are served as they are.
- **Backend**: Vercel serverless functions in `/api` (Node, ES modules).
- **Database/auth/live updates**: Supabase (Postgres + Row Level Security).
- Hosted on Vercel. Pushing to GitHub redeploys automatically.

## File map
| File | Purpose |
|---|---|
| `index.html` | App shell. Loads `css/styles.css` and `js/app.js` |
| `js/app.js` | Start-up + router (`#/`, `#/space/<id>`, `#/settings`) |
| `js/store.js` | **Data layer – the ONLY place that talks to Supabase or `/api`** |
| `js/state.js` | Signed-in user, profile, categories, permission helpers |
| `js/push.js` | Turning on push notifications on a device |
| `js/lib/dom.js` | `h()` element builder, date + link helpers |
| `js/lib/ui.js` | Header, bottom sheet, toast, field, busy button |
| `js/types/*.js` | **One file per category type** (events, todo, shopping, list) |
| `js/types/index.js` | Type registry + starter categories |
| `js/types/fields.js` | Maps form values ⇄ database rows |
| `js/views/*.js` | Screens: home, space (generic category screen), item-form (generic), share-sheet, settings, auth, card helpers |
| `api/share.js` | Endpoint used by the iOS Shortcut (Share button) |
| `api/parse-link.js` | Reads a link → event details (for the app) |
| `api/_lib/parse.js` | Page reading logic (meta tags → JSON-LD → optional Gemini) |
| `api/send-reminders.js` | Called every minute by Supabase cron; sends due push notifications |
| `api/test-push.js`, `api/config.js` | Test notification; public config for the browser |
| `supabase/schema.sql` | Full database schema + security rules (already applied) |
| `supabase/cron.sql` | Reminder schedule (already applied) |
| `css/styles.css` | All styling; theme colours at the top |

## Data model (generic – new categories need NO database change)
- `spaces` = categories (`type` = id of a file in `js/types/`).
- `space_members` = who can access a category (`owner` / `editor` / `viewer`).
- `invites` = pending invites by email (accepted automatically on sign-in).
- `items` = every entry. Real columns: `title`, `status`, `due_at`, `remind_at`. **Everything else goes in `data` (JSON).**
- `push_subscriptions`, `profiles` (incl. `share_token` for the Shortcut).

## How a category type works
A type file exports an object. Required: `id, label, icon, itemLabel, description, statuses, defaultStatus, fields`.
Optional: `doneStatus` (adds a tick circle), `showStatusChip`, `filters` + `defaultFilter`, `hideFilters`, `sort(a,b)`,
`sections(items)`, `meta(item)` (small pills on the default card), `actions(item, ctx)`, `card(item, ctx)` (fully custom card),
`onQuickAdd(text, helpers)`, `fromLink(info)`, `quickAddPlaceholder`, `emptyText`, `suggestFromItems`.

Field types: `text, textarea, url, number, select, datetime, checkbox`.
Field options: `required, default, placeholder, options` (select), `importButton` (link → Fetch details), `presets` (reminder shortcuts – use `reminderField()`).
Field keys `title, status, due_at, remind_at` are columns; any other key is saved in `data` automatically.

`ctx` given to cards: `{ space, type, item, canEdit, edit(), update(patch), setStatus(id), cycleStatus(), toggleDone() }`.
`helpers` given to `onQuickAdd`: `{ space, type, items, create(values), update(id, patch), parseLink(url), toast(msg) }`.

## Recipes
- **New category type**: copy `js/types/list.js` → `js/types/<name>.js`, change it, add it to `js/types/index.js`. Done.
- **New field on an existing type**: add it to that type's `fields`. Done (stored in `data`).
- **New screen**: add a file in `js/views/` and a route in `js/app.js`.
- **Database change**: add a new file `supabase/migrations/NNN_description.sql` and run it in the Supabase SQL editor. Never edit data directly in views – add a function to `js/store.js`.

## Rules for AI edits
1. Keep the no-build, plain-JS structure. Do not introduce frameworks or bundlers.
2. Return complete replacement files (or exact find/replace snippets) and name each file path.
3. Views never call `supabase` directly – go through `js/store.js`.
4. Keep security in the database (RLS policies), not only in the UI.
5. UK English, UK date format (`en-GB`), times in Europe/London.
6. Secrets live only in Vercel environment variables. Never put keys in frontend files.
