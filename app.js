const express = require("express");
const multer = require("multer");
const session = require("express-session");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8787;

// ENV
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// STORAGE
const STORAGE = path.join(__dirname, "storage");
const UPLOADS = path.join(STORAGE, "uploads");
const DATA = path.join(STORAGE, "data");

[STORAGE, UPLOADS, DATA].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const USERS_FILE = path.join(DATA, "users.json");
const QUEUE_FILE = path.join(DATA, "queue.json");

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");
if (!fs.existsSync(QUEUE_FILE)) fs.writeFileSync(QUEUE_FILE, "[]");

// MULTER
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename: (req, file, cb) => cb(null, Date.now() + ".webm")
});
const upload = multer({ storage });

// ===== LOGIN TWITCH =====
app.get("/auth/twitch", (req, res) => {
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=`;
  res.redirect(url);
});

app.get("/auth/twitch/callback", async (req, res) => {
  const code = req.query.code;

  const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`
  });

  const tokenData = await tokenRes.json();

  const userRes = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      "Authorization": `Bearer ${tokenData.access_token}`,
      "Client-Id": CLIENT_ID
    }
  });

  const userData = await userRes.json();
  const user = userData.data[0];

  req.session.user = {
    login: user.login
  };

  res.redirect("/audio.html");
});

// ===== CHECK USER =====
app.get("/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

// ===== PERMISOS =====
app.post("/grant", (req, res) => {
  const username = req.body.username;

  let users = JSON.parse(fs.readFileSync(USERS_FILE));
  users[username] = true;

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

  res.json({ ok: true });
});

app.get("/can-send", (req, res) => {
  if (!req.session.user) return res.json({ can: false });

  let users = JSON.parse(fs.readFileSync(USERS_FILE));
  const can = users[req.session.user.login] || false;

  res.json({ can });
});

// ===== SUBIR AUDIO =====
app.post("/upload", upload.single("audio"), (req, res) => {
  if (!req.session.user) return res.status(403).json({ ok: false });

  let users = JSON.parse(fs.readFileSync(USERS_FILE));

  if (!users[req.session.user.login]) {
    return res.status(403).json({ ok: false });
  }

  let queue = JSON.parse(fs.readFileSync(QUEUE_FILE));

  queue.push({
    file: req.file.filename,
    user: req.session.user.login
  });

  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

  // consumir permiso
  users[req.session.user.login] = false;
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

  res.json({ ok: true });
});

// ===== PLAYER =====
app.get("/next-audio", (req, res) => {
  let queue = JSON.parse(fs.readFileSync(QUEUE_FILE));

  if (queue.length === 0) return res.json({ file: null });

  const next = queue.shift();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

  res.json({ file: next.file });
});

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
