const Database = require("better-sqlite3");


const db = new Database("nova.db");




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

user_id INTEGER,

title TEXT DEFAULT 'Новый чат',

created DATETIME DEFAULT CURRENT_TIMESTAMP

)
`).run();








// =======================
// СООБЩЕНИЯ
// =======================

db.prepare(`
CREATE TABLE IF NOT EXISTS messages (

id INTEGER PRIMARY KEY AUTOINCREMENT,

chat_id INTEGER,

role TEXT,

message TEXT,

created DATETIME DEFAULT CURRENT_TIMESTAMP

)
`).run();








// =======================
// MEMORY NOVA
// =======================

db.prepare(`
CREATE TABLE IF NOT EXISTS memory(

id INTEGER PRIMARY KEY AUTOINCREMENT,

user_id INTEGER,

key TEXT,

value TEXT,

created DATETIME DEFAULT CURRENT_TIMESTAMP,

UNIQUE(user_id,key)

)
`).run();







module.exports = db;