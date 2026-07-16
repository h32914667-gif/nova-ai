require("dotenv").config();
const { Telegraf } = require('telegraf');
const http = require('http');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан!');
  process.exit(1);
}

const bot = new Telegraf(token);

// Обработчик команды /start
bot.start((ctx) => {
  const userName = ctx.from.first_name || 'друг';
  ctx.reply(`Привет, ${userName}! 👋 Открой Nova AI прямо в Telegram:`, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🚀 Открыть Nova AI',
            web_app: { url: 'https://nova-ai-ten-ashen.vercel.app' }
          }
        ]
      ]
    }
  });
});

// Запуск бота
bot.launch();
console.log('🤖 Telegram бот запущен и готов к работе!');

// Обработка ошибок
bot.catch((err) => {
  console.error('❌ Ошибка бота:', err);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ===== ДОБАВЛЯЕМ HTTP-СЕРВЕР ДЛЯ HEALTH CHECK =====
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`🩺 Health check server running on port ${PORT}`);
});

// Закрываем HTTP-сервер при завершении бота
process.once('SIGINT', () => {
  server.close(() => console.log('HTTP server closed'));
});
process.once('SIGTERM', () => {
  server.close(() => console.log('HTTP server closed'));
});