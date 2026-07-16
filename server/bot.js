require("dotenv").config();
const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан!');
  process.exit(1);
}

const bot = new Telegraf(token);

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

bot.launch();
console.log('🤖 Telegram бот запущен и готов к работе!');

// Обработка ошибок
bot.catch((err) => {
  console.error('❌ Ошибка бота:', err);
});

// Остановка при завершении
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));