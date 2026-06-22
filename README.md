# Job Tracker

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
   - **Columns** — show/hide table columns with the *Columns* button.
3. Click **Save changes** to write your edits back into `tracker.csv`.
   (**Export CSV** downloads a separate backup copy.)
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

## Down the road

Because it's plain HTML/CSS/JS plus a CSV, the upgrade paths are open:

- **Host it live** — the front end can be deployed to a static host; the local save
  step would be swapped for a hosted backend or database.
- **Make it a real app icon** — wrap `start.command` as a macOS `.app` (e.g. with
  Platypus), or repackage the web UI with Electron/Tauri for a native window.
- **Bigger data** — the CSV can move to SQLite (also just a file) if it ever grows.
