import React, { useState, useEffect } from 'react';
import { getStats, getUsers, deleteUser } from '../api';

export default function AdminPanel({ onClose }) {
  const [stats, setStats] = useState({ users: 0, chats: 0, messages: 0 });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const statsData = await getStats();
      setStats(statsData);
      const usersData = await getUsers();
      setUsers(usersData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(id) {
    if (!confirm('Удалить пользователя?')) return;
    try {
      await deleteUser(id);
      setUsers(users.filter(u => u.id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="text-center text-white">Загрузка...</div>;
  if (error) return <div className="text-red-400">{error}</div>;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4 animate-scaleIn">
      <div className="w-full max-w-4xl bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent mb-6">👑 Админ-панель</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/10 rounded-2xl p-4 text-center border border-white/10">
            <div className="text-4xl font-bold text-indigo-400">{stats.users}</div>
            <div className="text-slate-400 text-sm">Пользователей</div>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 text-center border border-white/10">
            <div className="text-4xl font-bold text-purple-400">{stats.chats}</div>
            <div className="text-slate-400 text-sm">Чатов</div>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 text-center border border-white/10">
            <div className="text-4xl font-bold text-pink-400">{stats.messages}</div>
            <div className="text-slate-400 text-sm">Сообщений</div>
          </div>
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">👥 Пользователи</h3>
        <div className="space-y-2">
          {users.map(user => (
            <div key={user.id} className="flex items-center justify-between bg-white/5 rounded-xl p-3 border border-white/5 hover:bg-white/10 transition">
              <div>
                <span className="text-white font-medium">{user.username}</span>
                <span className="text-slate-400 text-sm ml-3">ID: {user.id}</span>
                <span className="text-slate-500 text-xs ml-3">{user.created_at ? new Date(user.created_at).toLocaleDateString() : ''}</span>
              </div>
              {user.username !== 'admin' && (
                <button onClick={() => handleDeleteUser(user.id)} className="text-red-400 hover:text-red-300 transition hover:scale-110">🗑</button>
              )}
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-6 w-full p-3 rounded-xl bg-white/10 hover:bg-white/20 transition hover:scale-[1.02] active:scale-[0.98] text-white">Закрыть</button>
      </div>
    </div>
  );
}