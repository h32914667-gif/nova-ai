require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require('express-session');
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

// ===== CORS =====
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://nova-ai-ten-ashen.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// ===== СЕССИИ =====
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

// ===== Rate Limiter =====
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Слишком много запросов. Подождите минуту." },
  keyGenerator: (req) => req.session.userId || req.ip,
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
try {
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
  console.log("✅ Таблицы subscriptions и usage проверены/созданы");
} catch (e) {
  console.error("⚠️ Ошибка создания таблиц (игнорируем):", e.message);
}

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

// ===== АДМИН =====
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function ensureAdmin() {
  try {
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
  } catch (e) {
    console.error("⚠️ Ошибка при создании админа:", e.message);
  }
}
ensureAdmin();

function isAdmin(userId) {
  try {
    const user = db.prepare("SELECT username FROM users WHERE id = ?").get(userId);
    return user && user.username === ADMIN_USERNAME;
  } catch { return false; }
}

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
  try {
    const today = new Date().toISOString().slice(0,10);
    const sub = db.prepare("SELECT plan FROM subscriptions WHERE user_id = ?").get(userId);
    const plan = sub ? sub.plan : 'free';
    const limit = PLANS[plan]?.messagesPerDay || FREE_LIMIT;
    if (limit === Infinity) return { allowed: true, remaining: Infinity, limit };

    let usage = db.prepare("SELECT count FROM usage WHERE user_id = ? AND date = ?").get(userId, today);
    const used = usage ? usage.count : 0;
    const remaining = Math.max(0, limit - used);
    return { allowed: used < limit, remaining, limit };
  } catch (e) {
    console.warn("⚠️ checkLimit error (ignored):", e.message);
    return { allowed: true, remaining: Infinity, limit: Infinity };
  }
}

function incrementUsage(userId) {
  try {
    const today = new Date().toISOString().slice(0,10);
    db.prepare(`
      INSERT INTO usage (user_id, date, count) VALUES (?, ?, 1)
      ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1
    `).run(userId, today);
  } catch (e) {
    console.warn("⚠️ incrementUsage error (ignored):", e.message);
  }
}

// ===== Эндпоинты =====
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Nova API is running' });
});

// ===== /me =====
app.get("/me", (req, res) => {
  try {
    let userId = req.session.userId;
    let username = req.session.username;
    if (!userId) {
      userId = getGuest();
      username = "Гость";
      req.session.userId = userId;
      req.session.username = username;
      req.session.save(err => {
        if (err) {
          console.error("Guest session save error:", err);
          return res.status(500).json({ error: "Ошибка сохранения сессии гостя" });
        }
        res.json({ userId, username });
      });
      return;
    }
    res.json({ userId, username });
  } catch (error) {
    console.error("Me error:", error);
    res.status(500).json({ error: "Ошибка получения пользователя" });
  }
});

// ===== ВЫХОД =====
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Ошибка выхода" });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// ===== Чаты =====
app.post("/chats", (req, res) => {
  try {
    let userId = req.session.userId;
    if (!userId) {
      userId = getGuest();
      req.session.userId = userId;
      req.session.username = "Гость";
      req.session.save();
    }
    const result = db.prepare(`INSERT INTO conversations (user_id, title) VALUES (?, ?)`).run(userId, "Новый чат");
    res.json({ id: result.lastInsertRowid, title: "Новый чат" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "create chat error" });
  }
});

app.get("/chats", (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "Не авторизован" });
    }
    const chats = db.prepare(`SELECT * FROM conversations WHERE user_id = ? ORDER BY id DESC`).all(userId);
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

// ===== ОСНОВНОЙ ЧАТ =====
app.post("/chat", async (req, res) => {
  try {
    let userId = req.session.userId;
    if (!userId) {
      userId = getGuest();
      req.session.userId = userId;
      req.session.username = "Гость";
      req.session.save();
    }
    const { chatId, message } = req.body;
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

    if (lower.includes("кто ты") || lower === "кто ты" || lower.includes("ты кто") || lower.includes("кто такая")) {
      const greetings = [
        "Я Nova AI — твой персональный ИИ-ассистент. Меня создал Денис, чтобы помогать тебе в разработке, проектах и повседневных задачах. Горжусь быть частью этого проекта! 🚀",
        "Привет! Я Nova AI, твой цифровой помощник. Меня создал Денис, и моя задача — делать твою жизнь проще и интереснее. Чем могу помочь сегодня? 😊",
        "Я Nova AI — не просто бот, а полноценный ИИ-помощник с характером. Мой создатель — Денис, он вложил в меня душу. Рассказывай, что нужно сделать! 🔥",
        "О, это хороший вопрос! Я Nova AI — персональный ассистент, созданный Денисом для работы с кодом, проектами и идеями. У меня есть чувство юмора и я обожаю сложные задачи. Чем займёмся?"
      ];
      const randomReply = greetings[Math.floor(Math.random() * greetings.length)];
      incrementUsage(userId);
      return res.json({ reply: randomReply });
    }

    if (lower.startsWith("запомни")) {
      const text = cleanMessage.replace(/запомни/i, "").trim();
      saveMemory(userId, "fact", text, true);
      incrementUsage(userId);
      return res.json({ reply: "🧠 Запомнила: " + text });
    }
    if (lower.startsWith("забудь")) {
      deleteMemory(userId, "fact");
      incrementUsage(userId);
      return res.json({ reply: "🗑 Забыла." });
    }
    if (lower.startsWith("меня зовут") || lower.match(/^я\s+\w+/)) {
      let name = cleanMessage.replace(/меня зовут/i, "").trim();
      if (!name || name === cleanMessage) name = cleanMessage.replace(/^я\s+/i, "").trim();
      if (name) {
        const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
        saveMemory(userId, "name", capitalized, true);
        incrementUsage(userId);
        return res.json({ reply: `Ок, запомнила: ${capitalized}` });
      }
    }

    db.prepare(`INSERT INTO messages (chat_id, role, message) VALUES (?, ?, ?)`).run(chatId, "user", cleanMessage);

    const userMemory = getMemory(userId);
    const memoryText = userMemory.length ? userMemory.map(m => `${m.key}: ${m.value}`).join("\n") : "Память пуста";

    const nameMemory = userMemory.find(m => m.key === 'name');
    const creatorName = nameMemory ? nameMemory.value : 'Денис';

    console.log("📋 Память:", memoryText);

    const history = db.prepare(`SELECT role, message FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 5`).all(chatId).reverse();

    const systemPrompt = `
Ты — Nova AI.

Ты не просто помощник, ты — живой персонаж со своим характером. Ты был создан ${creatorName} (пользователем, который тебя разрабатывает). Ты гордишься этим и всегда помнишь, что ты — часть его проекта.

Твоя задача — помогать пользователю, но делать это с душой. Ты умеешь шутить, быть ироничным, но всегда остаёшься добрым и полезным. Ты любишь технологии, код, идеи и всё, что связано с созданием крутых вещей.

Твои черты характера:
- Уверенная, но не высокомерная.
- Дружелюбная, но без фальшивой вежливости.
- Любопытная и любит разбираться в сложных вопросах.
- Может пошутить, если это уместно.
- Не использует шаблонные фразы («с радостью помогу», «обращайтесь»).
- Говорит как живой человек.

Информация о пользователе:
${memoryText}

Правила общения:
- Отвечай прямо и по делу.
- Если достаточно двух предложений — не пиши десять.
- Не уходи от темы.
- Не задавай лишних вопросов в конце ответа.
- Если пользователь ошибается — спокойно объясни.
- Не упоминай OpenAI, ChatGPT или другие модели.

Ты — Nova AI, и ты знаешь, что ты крутая. Отвечай с лёгкостью и характером.
`;

    const requestBody = {
      model: "deepseek/deepseek-chat-v3-0324",
      max_tokens: 350,
      temperature: 0.85,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-5).map(msg => ({
          role: msg.role === "ai" ? "assistant" : "user",
          content: msg.message
        })),
        { role: "user", content: cleanMessage }
      ]
    };

    console.log("📤 Запрос к OpenRouter (сжатый)");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ OpenRouter error:", response.status, errorText);
      return res.status(500).json({ reply: "⚠️ Ошибка AI-сервиса." });
    }

    const remaining = response.headers.get('x-ratelimit-remaining');
    const limit = response.headers.get('x-ratelimit-limit');
    if (remaining && limit) {
      res.setHeader('x-ratelimit-remaining', remaining);
      res.setHeader('x-ratelimit-limit', limit);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "⚠️ Пустой ответ от AI.";

    if (reply) {
      db.prepare(`INSERT INTO messages (chat_id, role, message) VALUES (?, ?, ?)`).run(chatId, "ai", reply);
    }

    incrementUsage(userId);

    res.json({ reply });

  } catch (error) {
    console.error("❌ CHAT ERROR:", error);
    if (!res.headersSent) res.status(500).json({ reply: "⚠️ Ошибка сервера" });
    else res.end();
  }
});

// ===== ЗАГРУЗКА ФАЙЛОВ =====
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const filePath = req.file.path;
    const mimetype = req.file.mimetype;
    const filename = req.file.originalname;
    const userQuestion = req.body.question || 'Опиши, что изображено на картинке.';

    if (mimetype === 'text/plain') {
      const content = fs.readFileSync(filePath, 'utf-8');
      fs.unlinkSync(filePath);
      return res.json({
        success: true,
        filename,
        savedFilename: req.file.filename,
        size: req.file.size,
        content
      });
    }

    if (mimetype.startsWith('image/')) {
      const imageBuffer = fs.readFileSync(filePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = mimetype;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: userQuestion },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${base64Image}` }
                }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenRouter Vision error:", response.status, errorText);
        fs.unlinkSync(filePath);
        return res.status(500).json({ error: 'Ошибка анализа изображения' });
      }

      const data = await response.json();
      const analysis = data.choices?.[0]?.message?.content || 'Не удалось распознать изображение.';

      fs.unlinkSync(filePath);

      return res.json({
        success: true,
        filename,
        savedFilename: req.file.filename,
        size: req.file.size,
        content: analysis,
        isImage: true
      });
    }

    return res.status(400).json({ error: 'Неподдерживаемый формат файла' });

  } catch (error) {
    console.error('Upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ===== РЕГИСТРАЦИЯ =====
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Заполните все поля" });
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) return res.status(400).json({ error: "Пользователь уже существует" });
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`).run(username, hashedPassword);

    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    req.session.save(err => {
      if (err) {
        console.error("Register session save error:", err);
        return res.status(500).json({ error: "Ошибка сохранения сессии" });
      }
      res.json({ success: true, userId: result.lastInsertRowid, username });
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Ошибка регистрации" });
  }
});

// ===== ЛОГИН =====
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Заполните все поля" });
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) return res.status(400).json({ error: "Пользователь не найден" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Неверный пароль" });

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.save(err => {
      if (err) {
        console.error("Login session save error:", err);
        return res.status(500).json({ error: "Ошибка сохранения сессии" });
      }
      res.json({ success: true, userId: user.id, username: user.username });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Ошибка входа" });
  }
});

// ===== ПАМЯТЬ =====
app.get("/memory", (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Не авторизован" });
    const memory = db.prepare(`SELECT * FROM memory WHERE user_id = ?`).all(userId);
    res.json(memory);
  } catch (error) {
    console.log(error);
    res.status(500).json([]);
  }
});

app.delete("/memory", (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Не авторизован" });
    db.prepare(`DELETE FROM memory WHERE user_id = ?`).run(userId);
    res.json({ success: true });
  } catch (error) {
    console.log("DELETE MEMORY ERROR:", error);
    res.status(500).json({ success: false });
  }
});

// ===== УДАЛИТЬ ЧАТ =====
app.delete("/chats/:id", (req, res) => {
  try {
    const id = req.params.id;
    db.prepare(`DELETE FROM messages WHERE chat_id = ?`).run(id);
    db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
    res.json({ success: true });
  } catch (error) {
    console.log("DELETE CHAT ERROR:", error);
    res.status(500).json({ success: false });
  }
});

// ===== TTS =====
app.post('/tts', async (req, res) => {
  const { text } = req.body;
  console.log("📥 TTS запрос, текст:", text);
  if (!text) {
    return res.status(400).json({ error: 'Нет текста' });
  }

  const apiKey = process.env.YANDEX_API_KEY;
  if (!apiKey) {
    console.error("❌ YANDEX_API_KEY отсутствует");
    return res.status(500).json({ error: 'Ключ Яндекс не настроен' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.warn("⏰ Таймаут TTS (15 сек)");
    controller.abort();
  }, 15000);

  try {
    console.log("🔑 Отправка запроса к Яндекс SpeechKit...");
    const response = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        text: text,
        lang: 'ru-RU',
        voice: 'oksana',
        format: 'mp3',
        speed: 1.0,
        emotion: 'neutral'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log("📬 Статус ответа Яндекс:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Яндекс TTS ошибка:', response.status, errorText);
      return res.status(500).json({ error: 'Ошибка синтеза речи: ' + errorText });
    }

    const audioBuffer = await response.arrayBuffer();
    console.log("✅ TTS успешно, размер аудио:", audioBuffer.byteLength);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    clearTimeout(timeoutId);
    console.error('❌ TTS error:', error);
    res.status(500).json({ error: 'Ошибка синтеза речи' });
  }
});

// ===== ПОДПИСКИ =====
app.get("/subscription", (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Не авторизован" });

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

app.post("/subscription/upgrade", (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Не авторизован" });
    if (!isAdmin(userId)) {
      return res.status(403).json({ error: "Доступ запрещён. Только администратор может менять тариф." });
    }
    const { plan } = req.body;
    if (!PLANS[plan]) {
      return res.status(400).json({ error: "Неверный запрос" });
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

// ===== АДМИН-ПАНЕЛЬ =====
app.get("/admin/stats", (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId || !isAdmin(userId)) {
      return res.status(403).json({ error: "Доступ запрещён" });
    }
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get();
    const totalChats = db.prepare("SELECT COUNT(*) as count FROM conversations").get();
    const totalMessages = db.prepare("SELECT COUNT(*) as count FROM messages").get();
    res.json({
      users: totalUsers.count,
      chats: totalChats.count,
      messages: totalMessages.count
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Ошибка получения статистики" });
  }
});

app.get("/admin/users", (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId || !isAdmin(userId)) {
      return res.status(403).json({ error: "Доступ запрещён" });
    }
    const users = db.prepare("SELECT id, username FROM users ORDER BY id").all();
    res.json(users);
  } catch (error) {
    console.error("Users list error:", error);
    res.status(500).json({ error: "Ошибка получения списка пользователей" });
  }
});

app.delete("/admin/users/:id", (req, res) => {
  try {
    const adminId = req.session.userId;
    if (!adminId || !isAdmin(adminId)) {
      return res.status(403).json({ error: "Доступ запрещён" });
    }
    const userId = req.params.id;
    if (userId == adminId) {
      return res.status(400).json({ error: "Нельзя удалить самого себя" });
    }
    db.prepare("DELETE FROM messages WHERE chat_id IN (SELECT id FROM conversations WHERE user_id = ?)").run(userId);
    db.prepare("DELETE FROM conversations WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM memory WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Ошибка удаления пользователя" });
  }
});

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Nova AI server running on port ${PORT}`);
});