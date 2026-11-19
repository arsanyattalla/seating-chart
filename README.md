# Wedding Seating — Netlify edition

A static wedding seating website with a Netlify Function API and Netlify Blobs persistence.

## What's changed

- The frontend in `public/` is served as a static site through Netlify's CDN.
- The `/api/*` routes are handled by `netlify/functions/api.mjs`.
- Guest and table data is stored in **Netlify Blobs**, not in the deployed filesystem.
- Admin authentication uses a signed, HTTP-only, secure cookie.
- Existing dashboard, guest lookup, seating chart, CSV import, and CSV export UI are retained.

## Deploy to Netlify

1. Push this folder to a GitHub repository.
2. In Netlify, choose **Add new project → Import an existing project** and select that repository.
3. Netlify should read `netlify.toml` automatically (publish directory: `public`; functions directory: `netlify/functions`).
4. In **Site configuration → Environment variables**, add:
   - `ADMIN_PASSWORD`: a strong, unique dashboard password.
   - `SESSION_SECRET`: a long random secret (at least 32 random characters).
5. Trigger a deploy.
6. Visit `/` to sign in and `/seating` for the public guest page.

Generate a secret locally with:

```bash
openssl rand -hex 32
```

Do not commit real passwords or secrets to GitHub.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env
# Edit .env and set both values
npm run dev
```

Netlify CLI loads `.env` for local development. Netlify Blobs uses its local development store when running through `netlify dev`.

## Data migration — important

On its first call, the function initializes an empty Blobs store from the `SEED` object in `netlify/functions/api.mjs`. **Before deploying with your real guest list, replace that object with the contents of your current `data/data.json`.** The uploaded source archive contains four sample guests; it does not contain a separate production guest export.

After first initialization, Netlify Blobs is the source of truth. Updating `SEED` later will not overwrite existing stored data. Export a CSV from the dashboard periodically as a backup.

## Security and privacy

- Set both environment variables before deployment. Login will not work without them.
- The admin cookie is `HttpOnly`, `Secure`, and `SameSite=Strict`, and expires after 8 hours.
- Public endpoints expose guest names and table assignments, matching the original public seating-chart behavior. Only publish information intended for wedding guests.
- Netlify Blobs persists data across deployments; the old JSON file is no longer used at runtime.

## CSV format

The CSV header must contain `name`; `table` and `notes` are optional.

```csv
name,table,notes
Alex Morgan,1,
Taylor Morgan,1,Vegetarian
Jordan Lee,2,
```

Existing guest names are updated during import; new names are added.
