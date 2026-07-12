require("dotenv").config();

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const express = require("express");
const cors = require("cors");
const db = require("./database");
const bcrypt = require('bcrypt');
const saltRounds = 10;
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

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

if (!process.env.YANDEX_API_KEY) {
  console.warn("⚠️ YANDEX_API_KEY не задан. TTS будет работать только через fallback.");
} else {
  console.log("🔑 Ключ Yandex API загружен");
}

const app = express();

// ===== РУЧНАЯ НАСТРОЙКА CORS (ГАРАНТИРОВАННО) =====
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// ===== Rate Limiter для /chat =====
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Слишком много запросов. Подождите минуту." },
  keyGenerator: (req) => req.body.userId || ipKeyGenerator(req),
  skip: (req) => req.body.userId === '1'
});
app.use('/chat', chatLimiter);

// ===== Multer (загрузка файлов) =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
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

// ===== Эндпоинты =====
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

app.post("/chat", async (req, res) => {
  try {
    let { userId, chatId, message } = req.body;
    if (!userId) userId = getGuest();
    if (!chatId) return res.json({ reply: "Ошибка: чат не выбран" });
    if (!message) return res.json({ reply: "Напиши сообщение" });

    const cleanMessage = cleanText(message);
    const lower = cleanMessage.toLowerCase();

    // Команды
    if (lower.includes("кто ты") || lower === "кто ты") {
      return res.json({ reply: "Я Nova AI — персональный помощник." });
    }
    if (lower.startsWith("запомни")) {
      const text = cleanMessage.replace(/запомни/i, "").trim();
      saveMemory(userId, "fact", text, true);
      return res.json({ reply: "🧠 Запомнила: " + text });
    }
    if (lower.startsWith("забудь")) {
      deleteMemory(userId, "fact");
      return res.json({ reply: "🗑 Забыла." });
    }
    if (lower.startsWith("меня зовут") || lower.match(/^я\s+\w+/)) {
      let name = cleanMessage.replace(/меня зовут/i, "").trim();
      if (!name || name === cleanMessage) name = cleanMessage.replace(/^я\s+/i, "").trim();
      if (name) {
        const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
        saveMemory(userId, "name", capitalized, true);
        return res.json({ reply: `Ок, запомнила: ${capitalized}` });
      }
    }

    db.prepare(`INSERT INTO messages (chat_id, role, message) VALUES (?, ?, ?)`).run(chatId, "user", cleanMessage);

    const userMemory = getMemory(userId);
    const memoryText = userMemory.length ? userMemory.map(m => `${m.key}: ${m.value}`).join("\n") : "Память пуста";
    console.log("📋 Память:", memoryText);

    const history = db.prepare(`SELECT role, message FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 5`).all(chatId).reverse();

    const systemPrompt = `Ты — Nova AI. Помогай пользователю. Информация о пользователе: ${memoryText}. Отвечай кратко.`;

    const requestBody = {
      model: "deepseek/deepseek-chat-v3-0324",
      max_tokens: 300,
      temperature: 0.7,
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

    res.json({ reply });

  } catch (error) {
    console.error("❌ CHAT ERROR:", error);
    if (!res.headersSent) res.status(500).json({ reply: "⚠️ Ошибка сервера" });
    else res.end();
  }
});

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

app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Заполните все поля" });
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) return res.status(400).json({ error: "Пользователь уже существует" });
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`).run(username, hashedPassword);
    res.json({ success: true, userId: result.lastInsertRowid, username });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Ошибка регистрации" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Заполните все поля" });
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) return res.status(400).json({ error: "Пользователь не найден" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Неверный пароль" });
    res.json({ success: true, userId: user.id, username: user.username });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Ошибка входа" });
  }
});

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

app.listen(3001, () => {
  console.log("🚀 Nova AI server running on port 3001");
});