require("dotenv").config();
const { Telegraf } = require('telegraf');
const http = require('http');
const db = require('./database'); // для обновления подписки

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан!');
  process.exit(1);
}

const bot = new Telegraf(token);

// ===== Обработчик команды /start =====
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

// ===== Обработка предоплатного запроса (Telegram проверяет, можем ли принять оплату) =====
bot.on('pre_checkout_query', (ctx) => {
  // Всегда подтверждаем
  ctx.answerPreCheckoutQuery(true);
});

// ===== Успешная оплата =====
bot.on('successful_payment', async (ctx) => {
  const payment = ctx.message.successful_payment;
  const payload = payment.invoice_payload;

  try {
    const data = JSON.parse(payload);
    const { userId, plan, invoiceId } = data;

    // Обновляем подписку в БД
    const expiresAt = plan === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, expires_at) 
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, expires_at = excluded.expires_at
    `).run(userId, plan, expiresAt);

    console.log(`✅ Подписка обновлена для пользователя ${userId} -> ${plan}`);

    // Уведомляем пользователя в чате
    ctx.reply(`🎉 Подписка ${plan} активирована! Спасибо за оплату.`);
  } catch (err) {
    console.error('❌ Ошибка обработки платежа:', err);
    ctx.reply('⚠️ Произошла ошибка при активации подписки. Обратитесь в поддержку.');
  }
});

// ===== Запуск бота =====
bot.launch();
console.log('🤖 Telegram бот запущен и готов к работе!');

// ===== Обработка ошибок =====
bot.catch((err) => {
  console.error('❌ Ошибка бота:', err);
});

// ===== Graceful shutdown =====
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ===== HTTP-сервер для health check (не даёт Render ругаться) =====
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

// Закрываем HTTP-сервер при завершении
process.once('SIGINT', () => server.close(() => console.log('HTTP server closed')));
process.once('SIGTERM', () => server.close(() => console.log('HTTP server closed')));