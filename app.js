const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 8787;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Carpetas
const STORAGE = path.join(__dirname, "storage");
const UPLOADS = path.join(STORAGE, "uploads");
const DATA = path.join(STORAGE, "data");

// Crear carpetas si no existen
[STORAGE, UPLOADS, DATA].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Archivos de datos
const QUEUE_FILE = path.join(DATA, "queue.json");
const TOKENS_FILE = path.join(DATA, "tokens.json");

if (!fs.existsSync(QUEUE_FILE)) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify([]));
}

if (!fs.existsSync(TOKENS_FILE)) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify({}));
}

// Config subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + ".webm");
  }
});

const upload = multer({ storage: storage });

// Endpoint test
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Crear token único de un solo uso
app.post("/create-token", (req, res) => {
  const token =
    Date.now().toString() + "-" + Math.floor(Math.random() * 1000000).toString();

  let tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));

  tokens[token] = {
    used: false,
    createdAt: Date.now()
  };

  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));

  res.json({ ok: true, token });
});

// Comprobar token
app.get("/check-token", (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(400).json({ valid: false, error: "Token requerido" });
  }

  let tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
  let tokenData = tokens[token];

  if (!tokenData || tokenData.used) {
    return res.json({ valid: false });
  }

  res.json({ valid: true });
});

// Subir audio protegido por token de un solo uso
app.post("/upload", upload.single("audio"), (req, res) => {
  const token = req.body.token;

  if (!token) {
    return res.status(400).json({ ok: false, error: "Token requerido" });
  }

  let tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
  let tokenData = tokens[token];

  if (!tokenData || tokenData.used) {
    return res.status(400).json({ ok: false, error: "Token inválido o ya usado" });
  }

  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No se recibió ningún audio" });
  }

  let queue = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));

  queue.push({
    file: req.file.filename
  });

  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

  tokens[token].used = true;
  tokens[token].usedAt = Date.now();
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));

  res.json({ ok: true });
});

// Obtener siguiente audio
app.get("/next", (req, res) => {
  let queue = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));

  if (queue.length === 0) {
    return res.json({ file: null });
  }

  let next = queue.shift();

  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

  res.json({ file: next.file });
});

// Servir audios
app.use("/uploads", express.static(UPLOADS));

// Servir página web
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log("Servidor funcionando en http://localhost:" + PORT);
});