# Job Tracker

This repo now has **two ways to run**:

- **V1 — local desktop tool** (this file, below): a single-folder app backed by `tracker.csv`,
  served by a tiny Python server. No accounts, no internet. Great for personal use on your Mac.
- **V2 — hosted web app** (Next.js + Supabase): Google sign-in and your data in the cloud,
  per-user. See **[`docs/V2-SETUP.md`](docs/V2-SETUP.md)** for account setup, and the
  **V2 section at the bottom** of this file for how it runs and deploys.

---

## V1 — local desktop tool

A small, local web app for working with your company-research tracker. It's a
clickable, sortable, filterable, searchable, editable table backed by a single
CSV file. No accounts, no hosting, no internet required — it all runs on your Mac.

## How to use it

1. Double-click **`start.command`**.
   - A small Terminal window opens (the local server) and your browser opens to the app.
   - **First time only:** macOS may block the script. Right-click `start.command` →
     **Open** → **Open** to approve it once. If you're prompted to install developer
     command-line tools, accept — it's a one-time macOS thing.
2. Use the app:
   - **Sort** — click a column header (click again to reverse).
   - **Filter** — use the dropdowns in the toolbar (multi-select, combinable).
   - **Search** — type in the search box; it matches names, notes, and contacts.
   - **Details** — click the ▸ arrow on a row to expand long notes (About, How to
     apply, Tips, Contact details, Content, Scope of AI, Website).
   - **Edit** — click any cell to edit. Status/Priority/etc. are dropdowns.
   - **Add** — click **+ Add company** to create a new blank row at the top, ready to fill in.
   - **Duplicate / Delete** — expand a row (▸); at the bottom of its details, **Duplicate**
     clones it just below, and **Delete company** removes it. Both take effect when you save.
   - **Columns** — show/hide table columns with the *Columns* button.
3. Click **Save changes** to write your edits back into `tracker.csv`.
   (**Export CSV** downloads a separate backup copy.)
   - Every save first snapshots the previous `tracker.csv` into a `backups/` folder
     (the last 10 are kept), so a bad edit is always recoverable.
   - Click **Backups** to see those snapshots and **Restore** any of them. Restoring backs up
     your current file first, so you can always undo a restore too.
4. When you're done, close the browser tab and the Terminal window (or press
   Ctrl+C in it).

> Open the app only through `start.command`. Double-clicking `index.html` directly
> opens a `file://` page, which browsers block from reading and saving your data.

## Keeping it in sync across your Macs

This folder lives on your iCloud-synced Desktop, so your edits sync automatically.
**Use it on one computer at a time** — save and let iCloud finish syncing before
switching machines, so you don't create a "conflicted copy".

## What's in the folder

| File | What it does |
|------|--------------|
| `start.command` | Double-click launcher (starts the server, opens the browser). |
| `server.py` | Tiny local server: serves the app and saves `tracker.csv`. Python standard library only. |
| `index.html` / `styles.css` / `app.js` | The app itself. |
| `tracker.csv` | Your data — the single source of truth. |
| `backups/` | Automatic timestamped snapshots taken before each save (last 10 kept). |

---

## V2 — hosted web app (Next.js + Supabase)

A multi-user version of the tracker: sign in with Google, and your companies live in a
Supabase database (isolated per user via Row Level Security). The table behaves like V1
(sort / filter / search / inline edit / add / delete / duplicate), but edits save straight
to the database instead of a CSV.

### One-time setup
Follow **[`docs/V2-SETUP.md`](docs/V2-SETUP.md)** to create the Supabase, Google Cloud, and
Vercel accounts and run the database schema in `supabase/0001_v2_foundation.sql`.

### Environment variables
Set these in Vercel (and in `.env.local` for local dev — see `.env.example`):

| Variable | From |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (secret; reserved for later) |

> `NEXT_PUBLIC_*` vars are read at **build time**, so set them in Vercel *before* deploying
> (or redeploy after adding them).

### Run / deploy
- **Local dev:** `npm install` then `npm run dev` → http://localhost:3000
- **Deploy:** push to `main`; Vercel builds the Next.js app automatically.

### Importing your data
On first sign-in your tracker is empty. Click **Import starter list** to load the companies
from `public/tracker.csv` (a snapshot of the V1 `tracker.csv`) into your account.

### Project layout (V2)
| Path | What it does |
|------|--------------|
| `app/` | Next.js App Router pages: `login/`, `tracker/`, `auth/` routes |
| `lib/supabase/` | Browser + server Supabase clients |
| `lib/columns.ts` / `lib/csv.ts` | Shared column config + CSV parsing |
| `middleware.ts` | Refreshes the auth session on each request |
| `supabase/0001_v2_foundation.sql` | Database schema + Row Level Security |
| `public/tracker.csv` | Seed data for the in-app import |
