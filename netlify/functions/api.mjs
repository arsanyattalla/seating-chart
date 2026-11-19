import { getStore } from "@netlify/blobs";
import { parse } from "csv-parse/sync";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "seating_admin";
const MAX_AGE = 8 * 60 * 60;
const SEED = {
  guests: [
    { id: "sample-1", name: "Olivia Bennett", table: "1", notes: "" },
    { id: "sample-2", name: "James Bennett", table: "1", notes: "" },
    { id: "sample-3", name: "Sophia Carter", table: "2", notes: "" },
    { id: "sample-4", name: "Daniel Carter", table: "2", notes: "" }
  ],
  tables: [
    { number: "1", name: "The Garden Table" },
    { number: "2", name: "The Champagne Table" }
  ]
};

const json = (body, status = 200, headers = {}) => new Response(
  JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } }
);
const clean = value => String(value ?? "").trim();
const normalizeName = value => clean(value).toLocaleLowerCase().replace(/\s+/g, " ");
const store = () => getStore("seating-chart");

async function readData() {
  const s = store();
  let data = await s.get("data", { type: "json" });
  if (!data) {
    data = SEED;
    await s.setJSON("data", data);
  }
  if (!Array.isArray(data.guests)) data.guests = [];
  if (!Array.isArray(data.tables)) data.tables = [];
  return data;
}
async function writeData(data) { await store().setJSON("data", data); }
function sign(value) {
  return createHmac("sha256", process.env.SESSION_SECRET).update(value).digest("hex");
}
function validSession(request) {
  if (!process.env.SESSION_SECRET) return false;
  const raw = (request.headers.get("cookie") || "").split(";").map(v => v.trim())
    .find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const [expires, signature] = raw.split(".");
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(expires), a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function admin(request) { return validSession(request); }

export default async (request) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, "/api").replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  try {
    if (path === "/api/login" && method === "POST") {
      if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET)
        return json({ error: "Set ADMIN_PASSWORD and SESSION_SECRET in Netlify environment variables." }, 500);
      const body = await request.json();
      if (String(body.password || "") !== process.env.ADMIN_PASSWORD)
        return json({ error: "That password doesn't match. Please try again." }, 401);
      const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE);
      const token = `${expires}.${sign(expires)}`;
      return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}` });
    }
    if (path === "/api/logout" && method === "POST")
      return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
    if (path === "/api/session" && method === "GET") return json({ isAdmin: validSession(request) });

    if (path === "/api/lookup" && method === "GET") {
      const q = normalizeName(url.searchParams.get("q"));
      if (!q) return json([]);
      const { guests } = await readData();
      return json(guests.filter(g => normalizeName(g.name).includes(q)).slice(0, 8).map(g => ({ id: g.id, name: g.name })));
    }
    if (path.startsWith("/api/guest/") && method === "GET") {
      const id = decodeURIComponent(path.slice("/api/guest/".length));
      const { guests } = await readData(), guest = guests.find(g => g.id === id);
      return guest ? json({ name: guest.name, table: guest.table || "" }) : json({ error: "Guest not found." }, 404);
    }
    if (path === "/api/seating" && method === "GET") {
      const data = await readData();
      const tables = data.tables.map(t => ({ number: t.number, name: t.name || "", guests: data.guests.filter(g => String(g.table) === String(t.number)).map(g => g.name) })).filter(t => t.guests.length);
      const assigned = new Set(tables.map(t => String(t.number)));
      return json({ tables, totalGuests: data.guests.length, unassigned: data.guests.filter(g => !g.table || !assigned.has(String(g.table))).length });
    }

    if (path.startsWith("/api/admin/")) {
      if (!admin(request)) return json({ error: "Please sign in to manage your seating." }, 401);
      const data = await readData();
      if (path === "/api/admin/data" && method === "GET") return json(data);
      if (path === "/api/admin/guests" && method === "POST") {
        const body = await request.json(), name = clean(body.name), table = clean(body.table), notes = clean(body.notes);
        if (!name) return json({ error: "Please enter a guest name." }, 400);
        if (data.guests.some(g => normalizeName(g.name) === normalizeName(name))) return json({ error: "A guest with that name already exists." }, 409);
        data.guests.push({ id: randomUUID(), name, table, notes });
        if (table && !data.tables.some(t => String(t.number) === table)) data.tables.push({ number: table, name: "" });
        await writeData(data); return json({ ok: true });
      }
      const guestMatch = path.match(/^\/api\/admin\/guests\/([^/]+)$/);
      if (guestMatch && method === "PUT") {
        const guest = data.guests.find(g => g.id === decodeURIComponent(guestMatch[1]));
        if (!guest) return json({ error: "Guest not found." }, 404);
        const body = await request.json(), name = clean(body.name), table = clean(body.table);
        if (!name) return json({ error: "Guest name is required." }, 400);
        if (data.guests.some(g => g.id !== guest.id && normalizeName(g.name) === normalizeName(name))) return json({ error: "Another guest already has that name." }, 409);
        guest.name = name; guest.table = table; guest.notes = clean(body.notes);
        if (table && !data.tables.some(t => String(t.number) === table)) data.tables.push({ number: table, name: "" });
        await writeData(data); return json({ ok: true });
      }
      if (guestMatch && method === "DELETE") {
        data.guests = data.guests.filter(g => g.id !== decodeURIComponent(guestMatch[1]));
        await writeData(data); return json({ ok: true });
      }
      const tableMatch = path.match(/^\/api\/admin\/tables\/([^/]+)$/);
      if (tableMatch && method === "PUT") {
        const number = decodeURIComponent(tableMatch[1]), name = clean((await request.json()).name);
        let table = data.tables.find(t => String(t.number) === number);
        if (!table) { table = { number, name }; data.tables.push(table); } else table.name = name;
        await writeData(data); return json({ ok: true });
      }
      if (path === "/api/admin/import" && method === "POST") {
        const form = await request.formData(), file = form.get("file");
        if (!file || typeof file.text !== "function") return json({ error: "Choose a CSV file first." }, 400);
        if (file.size > 2 * 1024 * 1024) return json({ error: "CSV file must be 2 MB or smaller." }, 400);
        try {
          const records = parse(await file.text(), { columns: true, skip_empty_lines: true, bom: true, trim: true });
          if (!records.length || !Object.keys(records[0]).some(k => k.toLowerCase() === "name")) return json({ error: "Your CSV needs a column named name." }, 400);
          let added = 0, updated = 0;
          for (const row of records) {
            const get = key => clean(row[Object.keys(row).find(k => k.toLowerCase() === key)]);
            const name = get("name"), table = get("table"), notes = get("notes");
            if (!name) continue;
            const existing = data.guests.find(g => normalizeName(g.name) === normalizeName(name));
            if (existing) { existing.table = table; existing.notes = notes; updated++; }
            else { data.guests.push({ id: randomUUID(), name, table, notes }); added++; }
            if (table && !data.tables.some(t => String(t.number) === table)) data.tables.push({ number: table, name: "" });
          }
          await writeData(data); return json({ ok: true, added, updated });
        } catch { return json({ error: "We couldn't read that CSV. Please use the template and try again." }, 400); }
      }
      if (path === "/api/admin/export" && method === "GET") {
        const esc = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
        const csv = ["name,table,notes", ...data.guests.map(g => [g.name, g.table, g.notes].map(esc).join(","))].join("\r\n");
        return new Response("\uFEFF" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="wedding-guests.csv"' } });
      }
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error(error);
    return json({ error: error.message || "Something went wrong." }, 500);
  }
};
