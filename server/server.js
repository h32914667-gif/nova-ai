require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./database");
const bcrypt = require('bcrypt');
const saltRounds = 10;

const app = express();

// ===== CORS (работает всегда) =====
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ===== Тестовый эндпоинт =====
app.get('/', (req, res) => {
  res.json({ message: 'Nova API работает!' });
});

// ===== Заглушка для /chats =====
app.get('/chats/:userId', (req, res) => {
  res.json([]);
});

app.post('/chats', (req, res) => {
  res.json({ id: 1, title: 'Новый чат' });
});

// ===== Заглушка для /chat =====
app.post('/chat', (req, res) => {
  res.json({ reply: 'Привет! Это тестовый ответ.' });
});

// ===== Заглушка для /upload =====
app.post('/upload', (req, res) => {
  res.json({ success: true, filename: 'test.txt', content: 'Тестовое содержимое' });
});

// ===== Заглушка для /register и /login =====
app.post('/register', (req, res) => {
  res.json({ success: true, userId: 1, username: req.body.username });
});

app.post('/login', (req, res) => {
  res.json({ success: true, userId: 1, username: req.body.username });
});

// ===== Запуск =====
app.listen(3001, () => {
  console.log("🚀 Nova AI server running on port 3001");
});