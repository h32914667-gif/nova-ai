require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const { rateLimit } = require('express-rate-limit');

const db = require("./database");

// ===== СОЗДАЁМ ПАПКУ UPLOADS =====
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 Папка uploads создана');
}

// ===== Проверка ключей =====
if (!process.env.OPENROUTER_KEY) {
  console.error("❌ ОШИБКА: OPENROUTER_KEY не задан!");
  process.exit(1);
}
const rawKey = process.env.OPENROUTER_KEY;
const cleanedKey = rawKey.trim();
if (!/^[a-zA-Z0-9\-_]+$/.test(cleanedKey)) {
  console.error("❌ Ключ OpenRouter содержит недопустимые символы");
  process.exit(1);
}
process.env.OPENROUTER_KEY = cleanedKey;
console.log("🔑 Ключ OpenRouter загружен и проверен");

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ===== Rate Limiter =====
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Слишком много запросов. Подождите минуту." },
  keyGenerator: (req) => req.body.userId || req.ip,
  skip: (req) => req.method === 'OPTIONS'
});
app.use('/chat', chatLimiter);

// ===== Multer =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/plain'];
  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Неподдерживаемый формат'), false);
};
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

// ===== СОЗДАНИЕ ТАБЛИЦ =====
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id INTEGER PRIMARY KEY,
    plan TEXT DEFAULT 'free',
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS usage (
    user_id INTEGER,
    date TEXT,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// ===== ЛИМИТЫ =====
const FREE_LIMIT = parseInt(process.env.FREE_LIMIT) || 30;
const PLUS_LIMIT = parseInt(process.env.PLUS_LIMIT) || 200;
const PRO_LIMIT = Infinity;

const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    messagesPerDay: FREE_LIMIT,
    features: [`${FREE_LIMIT} сообщений в день`, 'Базовая память']
  },
  plus: {
    name: 'Plus',
    price: 500,
    messagesPerDay: PLUS_LIMIT,
    features: [`${PLUS_LIMIT} сообщений в день`, 'Расширенная память', 'Приоритетная поддержка']
  },
  pro: {
    name: 'Pro',
    price: 1500,
    messagesPerDay: PRO_LIMIT,
    features: ['Безлимит сообщений', 'Все функции Plus', 'Эксклюзивные модели AI']
  }
};

// ===== Функции =====
function getGuest() {
  let user = db.prepare("SELECT * FROM users WHERE username = ?").get("guest");
  if (!user) {
    const hashedPassword = bcrypt.hashSync("guest", saltRounds);
    const result = db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`).run("guest", hashedPassword);
    return result.lastInsertRowid;
  }
  return user.id;
}

function getMemory(userId) {
  return db.prepare(`SELECT id, key, value FROM memory WHERE user_id = ?`).all(userId);
}

function saveMemory(userId, key, value, force = false) {
  if (!value || value.trim() === "") return;
  console.log(`💾 saveMemory: ${key}=${value}`);
  const exists = db.prepare(`SELECT id FROM memory WHERE user_id = ? AND key = ?`).get(userId, key);
  if (exists) {
    if (force) db.prepare(`UPDATE memory SET value = ? WHERE id = ?`).run(value.trim(), exists.id);
  } else {
    db.prepare(`INSERT INTO memory (user_id, key, value) VALUES (?, ?, ?)`).run(userId, key, value.trim());
  }
}

function deleteMemory(userId, key) {
  db.prepare(`DELETE FROM memory WHERE user_id = ? AND key = ?`).run(userId, key);
}

function cleanText(text) {
  if (!text) return "";
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function checkLimit(userId) {
  const today = new Date().toISOString().slice(0,10);
  const sub = db.prepare("SELECT plan FROM subscriptions WHERE user_id = ?").get(userId);
  const plan = sub ? sub.plan : 'free';
  const limit = PLANS[plan]?.messagesPerDay || FREE_LIMIT;
  if (limit === Infinity) return { allowed: true, remaining: Infinity, limit };

  let usage = db.prepare("SELECT count FROM usage WHERE user_id = ? AND date = ?").get(userId, today);
  const used = usage ? usage.count : 0;
  const remaining = Math.max(0, limit - used);
  return { allowed: used < limit, remaining, limit };
}

function incrementUsage(userId) {
  const today = new Date().toISOString().slice(0,10);
  db.prepare(`
    INSERT INTO usage (user_id, date, count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1
  `).run(userId, today);
}

// ===== АДМИН =====
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function ensureAdmin() {
  const admin = db.prepare("SELECT * FROM users WHERE username = ?").get(ADMIN_USERNAME);
  if (!admin) {
    const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, saltRounds);
    db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`).run(ADMIN_USERNAME, hashedPassword);
    console.log(`👑 Администратор создан: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
  } else {
    const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, saltRounds);
    db.prepare(`UPDATE users SET password = ? WHERE username = ?`).run(hashedPassword, ADMIN_USERNAME);
    console.log(`👑 Администратор обновлён: ${ADMIN_USERNAME}`);
  }
}
ensureAdmin();

function isAdmin(userId) {
  const user = db.prepare("SELECT username FROM users WHERE id = ?").get(userId);
  return user && user.username === ADMIN_USERNAME;
}

// ===== Эндпоинты =====
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Nova API is running' });
});

// Чаты
app.post("/chats", (req, res) => {
  try {
    let userId = req.body.userId || getGuest();
    const result = db.prepare(`INSERT INTO conversations (user_id, title) VALUES (?, ?)`).run(userId, "Новый чат");
    res.json({ id: result.lastInsertRowid, title: "Новый чат" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "create chat error" });
  }
});

app.get("/chats/:userId", (req, res) => {
  try {
    const chats = db.prepare(`SELECT * FROM conversations WHERE user_id = ? ORDER BY id DESC`).all(req.params.userId);
    res.json(chats);
  } catch (error) {
    console.log(error);
    res.status(500).json([]);
  }
});

app.get("/messages/:chatId", (req, res) => {
  try {
    const messages = db.prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY id ASC`).all(req.params.chatId);
    res.json(messages);
  } catch (error) {
    console.log(error);
    res.status(500).json([]);
  }
});

// Основной чат
app.post("/chat", async (req, res) => {
  try {
    let { userId, chatId, message } = req.body;
    if (!userId) userId = getGuest();
    if (!chatId) return res.json({ reply: "Ошибка: чат не выбран" });
    if (!message) return res.json({ reply: "Напиши сообщение" });

    const limitCheck = checkLimit(userId);
    if (!limitCheck.allowed) {
      return res.json({
        reply: `❌ Дневной лимит сообщений исчерпан (${limitCheck.limit} в день). Апгрейди подписку в настройках!`
      });
    }

    const cleanMessage = cleanText(message);
    const lower = cleanMessage.toLowerCase();

    // ... (обработка "кто ты", "запомни" и т.д.) - оставь как у тебя
    // Для краткости я не копирую всю логику, но она есть в твоём текущем файле.
    // Убедись, что в конце каждого ответа вызывается incrementUsage(userId) и возвращается reply.

    // ... (здесь должен быть полный код твоего чата, включая OpenRouter)

    // После успешного ответа:
    incrementUsage(userId);
    res.json({ reply });

  } catch (error) {
    console.error("❌ CHAT ERROR:", error);
    if (!res.headersSent) res.status(500).json({ reply: "⚠️ Ошибка сервера" });
    else res.end();
  }
});

// ===== Загрузка файлов =====
app.post('/upload', upload.single('file'), async (req, res) => {
  // ... (оставь без изменений)
});

// ===== Регистрация =====
app.post("/register", async (req, res) => {
  // ... (без изменений)
});

// ===== Логин =====
app.post("/login", async (req, res) => {
  // ... (без изменений)
});

// ===== Память =====
app.get("/memory/:userId", (req, res) => {
  // ...
});
app.delete("/memory/:userId", (req, res) => {
  // ...
});

// ===== Удалить чат =====
app.delete("/chats/:id", (req, res) => {
  // ...
});

// ===== TTS =====
app.post('/tts', async (req, res) => {
  // ...
});

// ===== ПОДПИСКИ =====
app.get("/subscription/:userId", (req, res) => {
  try {
    const userId = req.params.userId;
    let sub = db.prepare("SELECT plan, expires_at, created_at FROM subscriptions WHERE user_id = ?").get(userId);
    if (!sub) {
      db.prepare("INSERT INTO subscriptions (user_id, plan) VALUES (?, ?)").run(userId, 'free');
      sub = { plan: 'free', expires_at: null, created_at: new Date().toISOString() };
    }
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
      db.prepare("UPDATE subscriptions SET plan = 'free', expires_at = NULL WHERE user_id = ?").run(userId);
      sub.plan = 'free';
      sub.expires_at = null;
    }
    const planData = PLANS[sub.plan] || PLANS.free;
    const limit = planData.messagesPerDay;
    const today = new Date().toISOString().slice(0,10);
    let usage = db.prepare("SELECT count FROM usage WHERE user_id = ? AND date = ?").get(userId, today);
    const used = usage ? usage.count : 0;
    const remaining = limit === Infinity ? Infinity : Math.max(0, limit - used);

    res.json({
      plan: sub.plan,
      ...planData,
      used,
      remaining,
      expires_at: sub.expires_at,
      created_at: sub.created_at
    });
  } catch (error) {
    console.error("Subscription error:", error);
    res.status(500).json({ error: "Ошибка получения подписки" });
  }
});

app.get("/plans", (req, res) => {
  res.json(PLANS);
});

// === АПГРЕЙД ПОДПИСКИ (только для админа) ===
app.post("/subscription/upgrade", (req, res) => {
  try {
    const { userId, plan } = req.body;
    if (!userId || !PLANS[plan]) {
      return res.status(400).json({ error: "Неверный запрос" });
    }

    // ⛔ ТОЛЬКО АДМИН МОЖЕТ МЕНЯТЬ ТАРИФ
    if (!isAdmin(userId)) {
      return res.status(403).json({ error: "Доступ запрещён. Только администратор может менять тариф." });
    }

    const expiresAt = plan === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, expires_at) 
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, expires_at = excluded.expires_at
    `).run(userId, plan, expiresAt);
    res.json({ success: true, plan, expires_at: expiresAt });
  } catch (error) {
    console.error("Upgrade error:", error);
    res.status(500).json({ error: "Ошибка обновления подписки" });
  }
});

// ===== АДМИН-ПАНЕЛЬ (статистика, список пользователей, удаление) =====
// ... (оставь как есть)

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Nova AI server running on port ${PORT}`);
});