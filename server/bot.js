require("dotenv").config();
const { Telegraf } = require('telegraf');
const http = require('http');
const db = require('./database');

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

// ===== Обработка предоплатного запроса =====
bot.on('pre_checkout_query', (ctx) => {
  ctx.answerPreCheckoutQuery(true);
});

// ===== Успешная оплата =====
bot.on('successful_payment', async (ctx) => {
  const payment = ctx.message.successful_payment;
  const payload = payment.invoice_payload;

  try {
    const data = JSON.parse(payload);
    const { userId, plan, invoiceId } = data;

    const expiresAt = plan === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, expires_at) 
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, expires_at = excluded.expires_at
    `).run(userId, plan, expiresAt);

    console.log(`✅ Подписка обновлена для пользователя ${userId} -> ${plan}`);
    ctx.reply(`🎉 Подписка ${plan} активирована! Спасибо за оплату.`);
  } catch (err) {
    console.error('❌ Ошибка обработки платежа:', err);
    ctx.reply('⚠️ Произошла ошибка при активации подписки. Обратитесь в поддержку.');
  }
});

// ===== Функция запуска бота с повторными попытками =====
async function startBot() {
  try {
    // Уникальный offset, чтобы не конфликтовать с другими экземплярами
    const offset = Math.floor(Date.now() / 1000);
    console.log(`🚀 Запуск бота с offset: ${offset}`);

    await bot.launch({
      polling: {
        timeout: 30,
        limit: 100,
        offset: offset
      }
    });
    console.log('🤖 Telegram бот запущен и готов к работе!');
  } catch (err) {
    if (err.response && err.response.error_code === 409) {
      console.warn('⚠️ Конфликт (409). Повторный запуск через 5 секунд...');
      setTimeout(startBot, 5000);
    } else {
      console.error('❌ Ошибка запуска бота:', err);
      process.exit(1);
    }
  }
}

// ===== Запускаем бота =====
startBot();

// ===== Обработка ошибок =====
bot.catch((err) => {
  console.error('❌ Ошибка бота:', err);
});

// ===== Graceful shutdown =====
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  server.close(() => console.log('HTTP server closed'));
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  server.close(() => console.log('HTTP server closed'));
});

// ===== HTTP-сервер для health check =====
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