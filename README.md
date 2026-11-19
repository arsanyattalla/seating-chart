# Wedding Seating

A responsive wedding seating website with:
- Private admin dashboard at `/`
- Public guest lookup and seating chart at `/seating`
- Live name suggestions as guests type
- CSV template download, CSV import, and CSV export
- Add, edit, remove, and assign guests individually
- Table names and table-by-table seating overview
- Persistent guest data stored in `data/data.json`

## Run locally

1. Install Node.js 18 or newer.
2. In this folder, install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env`.
4. Change `ADMIN_PASSWORD` and `SESSION_SECRET` in `.env`.
5. Start the site:
   ```bash
   npm start
   ```
6. Open `http://localhost:3000` for the admin dashboard.
7. Open `http://localhost:3000/seating` for the guest-facing page.

If you do not create a `.env` file, the local fallback password is `wedding123`. Change it before putting the site online.

## CSV format

Download `guests-template.csv` from the dashboard or use the included file. The header row must contain:

```csv
name,table,notes
Alex Morgan,1,
Taylor Morgan,1,Vegetarian
Jordan Lee,2,
```

- `name` is required.
- `table` is the table number.
- `notes` is optional and only visible in the admin dashboard.
- Importing a guest with a name that already exists updates that guest's table and notes. New names are added.
- Export downloads the current guest list.

## Before sharing with wedding guests

This project is ready to run locally. To let guests use `/seating` on their own phones, deploy the app to a Node.js host and use persistent storage for `data/data.json` (or replace the JSON store with a hosted database). Use HTTPS, set a strong `ADMIN_PASSWORD` and `SESSION_SECRET`, and back up your guest data. The included JSON file is suitable for a small event on a single persistent server; ephemeral hosting may erase it on redeploy.

The public page intentionally reveals guest names and table assignments in its seating chart. If you would rather keep the full chart private and only show each guest their own assignment, remove or disable the table directory section in `public/app.js`.
