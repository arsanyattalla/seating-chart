const express = require("express");
const session = require("express-session");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "data.json");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

app.use(express.json({ limit: "1mb" }));
app.use(session({
  secret: process.env.SESSION_SECRET || "local-development-secret-change-me",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const example = path.join(__dirname, "data", "data.example.json");
    fs.copyFileSync(example, DATA_FILE);
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function writeData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
function admin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: "Please sign in to manage your seating." });
  next();
}
function clean(value) { return String(value ?? "").trim(); }
function normalizeName(value) { return clean(value).toLocaleLowerCase().replace(/\s+/g, " "); }

app.post("/api/login", (req, res) => {
  const password = process.env.ADMIN_PASSWORD || "wedding123";
  if (String(req.body.password || "") !== password) return res.status(401).json({ error: "That password doesn't match. Please try again." });
  req.session.isAdmin = true;
  res.json({ ok: true });
});
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/session", (req, res) => res.json({ isAdmin: !!req.session.isAdmin }));

app.get("/api/lookup", (req, res) => {
  const q = normalizeName(req.query.q);
  if (q.length < 1) return res.json([]);
  const { guests } = readData();
  const matches = guests.filter(g => normalizeName(g.name).includes(q)).slice(0, 8)
    .map(g => ({ id: g.id, name: g.name }));
  res.json(matches);
});
app.get("/api/guest/:id", (req, res) => {
  const { guests } = readData();
  const guest = guests.find(g => g.id === req.params.id);
  if (!guest) return res.status(404).json({ error: "Guest not found." });
  res.json({ name: guest.name, table: guest.table || "" });
});
app.get("/api/seating", (req, res) => {
  const data = readData();
  const tables = (data.tables || []).map(t => ({
    number: t.number, name: t.name || "",
    guests: data.guests.filter(g => String(g.table) === String(t.number)).map(g => g.name)
  })).filter(t => t.guests.length);
  const assigned = new Set(tables.map(t => String(t.number)));
  const unassigned = data.guests.filter(g => !g.table || !assigned.has(String(g.table))).length;
  res.json({ tables, totalGuests: data.guests.length, unassigned });
});

app.get("/api/admin/data", admin, (req, res) => res.json(readData()));
app.post("/api/admin/guests", admin, (req, res) => {
  const name = clean(req.body.name), table = clean(req.body.table), notes = clean(req.body.notes);
  if (!name) return res.status(400).json({ error: "Please enter a guest name." });
  const data = readData();
  if (data.guests.some(g => normalizeName(g.name) === normalizeName(name)))
    return res.status(409).json({ error: "A guest with that name already exists." });
  data.guests.push({ id: crypto.randomUUID(), name, table, notes });
  if (table && !data.tables.some(t => String(t.number) === table)) data.tables.push({ number: table, name: "" });
  writeData(data); res.json({ ok: true });
});
app.put("/api/admin/guests/:id", admin, (req, res) => {
  const data = readData(), guest = data.guests.find(g => g.id === req.params.id);
  if (!guest) return res.status(404).json({ error: "Guest not found." });
  const name = clean(req.body.name), table = clean(req.body.table);
  if (!name) return res.status(400).json({ error: "Guest name is required." });
  if (data.guests.some(g => g.id !== guest.id && normalizeName(g.name) === normalizeName(name)))
    return res.status(409).json({ error: "Another guest already has that name." });
  guest.name = name; guest.table = table; guest.notes = clean(req.body.notes);
  if (table && !data.tables.some(t => String(t.number) === table)) data.tables.push({ number: table, name: "" });
  writeData(data); res.json({ ok: true });
});
app.delete("/api/admin/guests/:id", admin, (req, res) => {
  const data = readData(); data.guests = data.guests.filter(g => g.id !== req.params.id);
  writeData(data); res.json({ ok: true });
});
app.put("/api/admin/tables/:number", admin, (req, res) => {
  const data = readData(), number = clean(req.params.number), name = clean(req.body.name);
  let table = data.tables.find(t => String(t.number) === number);
  if (!table) { table = { number, name }; data.tables.push(table); } else table.name = name;
  writeData(data); res.json({ ok: true });
});
app.post("/api/admin/import", admin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a CSV file first." });
  try {
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, bom: true, trim: true });
    if (!records.length || !Object.keys(records[0]).some(k => k.toLowerCase() === "name"))
      return res.status(400).json({ error: "Your CSV needs a column named name." });
    const data = readData();
    let added = 0, updated = 0;
    for (const row of records) {
      const get = key => clean(row[Object.keys(row).find(k => k.toLowerCase() === key)]);
      const name = get("name"), table = get("table"), notes = get("notes");
      if (!name) continue;
      const existing = data.guests.find(g => normalizeName(g.name) === normalizeName(name));
      if (existing) { existing.table = table; existing.notes = notes; updated++; }
      else { data.guests.push({ id: crypto.randomUUID(), name, table, notes }); added++; }
      if (table && !data.tables.some(t => String(t.number) === table)) data.tables.push({ number: table, name: "" });
    }
    writeData(data); res.json({ ok: true, added, updated });
  } catch (e) { res.status(400).json({ error: "We couldn't read that CSV. Please use the template and try again." }); }
});
app.get("/api/admin/export", admin, (req, res) => {
  const { guests } = readData();
  const esc = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const csv = ["name,table,notes", ...guests.map(g => [g.name, g.table, g.notes].map(esc).join(","))].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="wedding-guests.csv"');
  res.send("\uFEFF" + csv);
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Wedding seating is running at http://localhost:${PORT}`));
