const express = require('express');
const cors = require('cors');
const app = express();

// CORS — разрешаем всё
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Обработка OPTIONS (preflight) для всех маршрутов
app.options('*', (req, res) => {
  res.sendStatus(200);
});

// Корневой путь — просто проверка, что сервер работает
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Nova API is running' });
});

// Тестовый эндпоинт /chats
app.get('/chats/:userId', (req, res) => {
  res.json([]);
});

app.post('/chats', (req, res) => {
  res.json({ id: 1, title: 'Новый чат' });
});

// Тестовый /chat
app.post('/chat', (req, res) => {
  res.json({ reply: 'Привет! Это тестовый ответ от Nova.' });
});

// Запуск
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Nova AI server running on port ${PORT}`);
});