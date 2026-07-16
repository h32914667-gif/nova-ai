import React, { useState, useEffect } from 'react';
import { getSubscription, getPlans, upgradePlan, createInvoice } from '../api';
import { useTelegram } from '../hooks/useTelegram';

export default function Subscription({ onClose }) {
  const { tg } = useTelegram();
  const [currentPlan, setCurrentPlan] = useState(null);
  const [plans, setPlans] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [plansData, subData] = await Promise.all([
        getPlans(),
        getSubscription()
      ]);
      setPlans(plansData);
      setCurrentPlan(subData);
    } catch (err) {
      console.error('Subscription load error:', err);
      setError(err.message || 'Ошибка загрузки данных подписки');
    } finally {
      setLoading(false);
    }
  }

  // Обработка оплаты через Telegram Stars
  async function handlePay(planKey) {
    if (planKey === currentPlan?.plan) {
      alert('Вы уже на этом тарифе');
      return;
    }
    if (!tg) {
      alert('Оплата доступна только в Telegram');
      return;
    }

    setPaying(true);
    try {
      // 1. Получаем инвойс от сервера
      const response = await createInvoice(planKey);
      if (response.error) throw new Error(response.error);

      // 2. Открываем окно оплаты Telegram
      tg.openInvoice({
        title: response.title,
        description: response.description,
        payload: response.payload,
        provider_token: '', // для Stars не нужен
        currency: 'XTR',
        prices: [{ label: 'Подписка', amount: response.starsPrice }]
      });

    } catch (err) {
      alert(err.message || 'Ошибка создания счёта');
    } finally {
      setPaying(false);
    }
  }

  // Слушаем событие закрытия инвойса
  useEffect(() => {
    if (tg) {
      const onInvoiceClosed = (data) => {
        if (data.status === 'paid') {
          // Оплата прошла – обновляем данные подписки
          loadData();
          alert('🎉 Подписка активирована!');
        } else if (data.status === 'failed') {
          alert('❌ Оплата не удалась. Попробуйте снова.');
        }
      };
      tg.onEvent('invoiceClosed', onInvoiceClosed);
      return () => {
        tg.offEvent('invoiceClosed', onInvoiceClosed);
      };
    }
  }, [tg]);

  if (loading) return <div className="text-center text-white py-8">Загрузка...</div>;
  if (error) return <div className="text-center text-red-400 py-8">{error}</div>;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4 animate-scaleIn">
      <div className="w-full max-w-4xl bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent mb-6">💎 Подписки</h2>
        
        {currentPlan && (
          <div className="mb-6 p-4 bg-white/10 rounded-2xl border border-white/10">
            <p className="text-lg text-white">
              Текущий тариф: <span className="font-bold text-indigo-400">{plans[currentPlan.plan]?.name || currentPlan.plan}</span>
            </p>
            {currentPlan.expires_at && (
              <p className="text-sm text-slate-400">Действует до: {new Date(currentPlan.expires_at).toLocaleDateString()}</p>
            )}
            <p className="text-sm text-slate-400">
              Сообщений в день: {currentPlan.messagesPerDay === Infinity ? '∞' : currentPlan.messagesPerDay}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(plans).map(([key, plan]) => {
            const isCurrent = currentPlan?.plan === key;
            const isFree = key === 'free';
            const starsPrice = plan.starsPrice || 0;

            return (
              <div 
                key={key} 
                className={`bg-white/5 rounded-2xl p-6 border ${
                  isCurrent 
                    ? 'border-indigo-500 shadow-lg shadow-indigo-500/20' 
                    : 'border-white/10'
                } hover:bg-white/10 transition-all duration-300 flex flex-col`}
              >
                <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                {isFree ? (
                  <p className="text-2xl font-bold text-green-400 mt-2">Бесплатно</p>
                ) : (
                  <p className="text-3xl font-bold text-indigo-400 mt-2">
                    {starsPrice} ⭐<span className="text-sm font-normal text-slate-400">/мес</span>
                  </p>
                )}
                <ul className="mt-4 space-y-2 flex-1">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-center gap-2">
                      <span className="text-green-400">✓</span> {feature}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => isFree ? handleUpgrade(key) : handlePay(key)}
                  disabled={isCurrent || paying}
                  className={`mt-6 w-full py-3 rounded-xl font-medium transition-all duration-300 ${
                    isCurrent
                      ? 'bg-slate-600 text-slate-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 text-white shadow-lg hover:scale-105'
                  }`}
                >
                  {paying ? 'Обработка...' :
                    isCurrent ? 'Текущий тариф' :
                    isFree ? 'Выбрать' : `Оплатить ${starsPrice} ⭐`}
                </button>
              </div>
            );
          })}
        </div>
        
        <button 
          onClick={onClose} 
          className="mt-6 w-full p-3 rounded-xl bg-white/10 hover:bg-white/20 transition hover:scale-[1.02] text-white"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}