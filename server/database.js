const path = require("path");
const Database = require("better-sqlite3");

// Абсолютный путь — не зависит от того, из какой директории запущен процесс
const dbPath = path.join(__dirname, "nova.db");

let db;
try {
  db = new Database(dbPath);
} catch (err) {
  console.error("❌ Не удалось открыть базу данных:", err.message);
  process.exit(1);
}

// Включаем поддержку внешних ключей — без этого ON DELETE CASCADE
// в других таблицах (subscriptions, usage) просто игнорируется,
// и при удалении пользователя в базе остаются "осиротевшие" записи.
db.pragma("foreign_keys = ON");

// WAL — меньше блокировок при параллельных запросах на чтение/запись
db.pragma("journal_mode = WAL");

// Если база на мгновение занята другим запросом — ждать до 5с вместо
// немедленной ошибки SQLITE_BUSY
db.pragma("busy_timeout = 5000");

// =======================
// USERS
// =======================
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    created DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// =======================
// ЧАТЫ
// =======================
db.prepare(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT DEFAULT 'Новый чат',
    created DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`).run();

// =======================
// СООБЩЕНИЯ
// =======================
db.prepare(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT,
    message TEXT,
    created DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES conversations(id) ON DELETE CASCADE
  )
`).run();

// =======================
// MEMORY NOVA
// =======================
db.prepare(`
  CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key TEXT,
    value TEXT,
    created DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`).run();

// Индексы под самые частые запросы (список чатов юзера, история сообщений чата, память юзера)
db.prepare(`CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_memory_user_id ON memory(user_id)`).run();

module.exports = db;