import {
  useState,
  useEffect,
  useRef
} from "react";

import { Plus, Menu, Send, Settings, Brain, FolderOpen, Copy, LogOut, User, Lock, Mail, Sparkles, Zap } from 'lucide-react';

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  askNova,
  deleteChat,
  getChats,
  getMessages,
  createChat,
  getMemory,
  register,
  login,
  uploadFile,
  checkAdmin,
  getSubscription,
  upgradePlan,
  getPlans,
  API
} from "./api";

import AdminPanel from "./components/AdminPanel";
import Subscription from "./components/Subscription";

import logo from "./assets/nova-logo.png";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function App() {
  // ===== STATE =====
  const [loading, setLoading] = useState(true);
  const [loadingFade, setLoadingFade] = useState(false);
  const [loadingText, setLoadingText] = useState("Запуск Nova Core...");

  const [messages, setMessages] = useState([
    { role: "ai", text: "👋 Привет! Я Nova AI. Чем могу помочь?" }
  ]);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authEmail, setAuthEmail] = useState("");

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [rateLimit, setRateLimit] = useState({ remaining: null, limit: null });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userName, setUserName] = useState("Гость");
  const [userPlan, setUserPlan] = useState("Free Plan");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [novaStatus, setNovaStatus] = useState("Готова");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState('free');
  const [remainingMessages, setRemainingMessages] = useState(null);
  const [profile, setProfile] = useState([]);
  const [projects, setProjects] = useState([
    {
      id: 1,
      name: "Nova AI",
      items: ["Frontend", "Backend", "Идеи"]
    }
  ]);
  const [animations, setAnimations] = useState(true);
  const [showHome, setShowHome] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const chatEnd = useRef(null);

  // ===== START NOVA =====
  useEffect(() => {
    async function boot() {
      setLoading(true);
      setLoadingText("🔧 Запуск ядра Nova...");
      await sleep(700);
      setLoadingText("🧠 Загрузка памяти...");
      await sleep(700);
      setLoadingText("💬 Подключение чатов...");
      await sleep(700);
      setLoadingText("✨ Nova готова");
      await sleep(1000);
      setLoadingFade(true);
      await sleep(500);
      setLoading(false);

      // Проверяем, есть ли сохранённый пользователь
      const savedUserId = localStorage.getItem("userId");
      const savedUsername = localStorage.getItem("username");

      if (savedUserId && savedUsername) {
        setUserName(savedUsername);
        // ✅ Загружаем данные ТОЛЬКО если пользователь уже авторизован
        await loadChats();
        const adminStatus = await checkAdmin();
        setIsAdmin(adminStatus);
        await loadSubscription();
      } else {
        // ✅ Показываем модалку авторизации (без загрузки данных)
        setShowAuthModal(true);
      }
    }
    boot();
  }, []);

  // ===== AUTO SCROLL =====
  useEffect(() => {
    if (chatEnd.current) {
      chatEnd.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typing]);

  // ===== АДАПТИВНАЯ БОКОВАЯ ПАНЕЛЬ =====
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ===== ЗАКРЫТИЕ МЕНЮ ПРИ КЛИКЕ ВНЕ =====
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showUserMenu && !e.target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showUserMenu]);

  // ===== ОТСЛЕЖИВАНИЕ СКРОЛЛА =====
  useEffect(() => {
    const chatContainer = document.querySelector('.chat-scroll-container');
    if (!chatContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = chatContainer;
      const isBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShowScrollButton(!isBottom);
    };

    chatContainer.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => chatContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // ===== CHAT FUNCTIONS =====
  async function loadChats() {
    try {
      const data = await getChats();
      if (Array.isArray(data)) {
        setChats(data);
        if (data.length) {
          openChat(data[0]);
        }
      }
    } catch (error) {
      console.log("Chats error:", error);
    }
  }

  async function newChat() {
    try {
      const chat = await createChat();
      setChats(prev => [chat, ...prev]);
      setActiveChatId(chat.id);
      setMessages([{ role: "ai", text: "🚀 Новый чат создан. Чем помочь?" }]);
      setShowHome(false);
    } catch (error) {
      console.log(error);
    }
  }

  async function openChat(chat) {
    try {
      setActiveChatId(chat.id);
      const data = await getMessages(chat.id);
      if (data.length) {
        setMessages(
          data.map(msg => ({
            role: msg.role === "ai" ? "ai" : "user",
            text: msg.message
          }))
        );
      } else {
        setMessages([{ role: "ai", text: "👋 Новый чат" }]);
      }
    } catch (error) {
      console.log(error);
    }
  }

  async function removeChat(id) {
    try {
      await deleteChat(id);
      setChats(prev => prev.filter(chat => chat.id !== id));
      if (activeChatId === id) {
        setActiveChatId(null);
        setMessages([{ role: "ai", text: "Создай новый чат 🚀" }]);
      }
    } catch (error) {
      console.log(error);
    }
  }

  // ===== OPEN PROFILE =====
  async function openProfile() {
    try {
      const data = await getMemory();
      setProfile(Array.isArray(data) ? data : []);
      setShowProfile(true);
    } catch (error) {
      console.log("Memory error", error);
    }
  }

  // ===== ЗАГРУЗКА ПОДПИСКИ =====
  async function loadSubscription() {
    try {
      const data = await getSubscription();
      setSubscriptionPlan(data.plan);
      setRemainingMessages(data.remaining);
      setUserPlan(data.name);
    } catch (e) {
      console.error("Subscription load error", e);
    }
  }

  // ===== AUTH HANDLER =====
  const handleAuth = async () => {
    if (!authUsername || !authPassword) {
      alert("Заполните все поля");
      return;
    }

    try {
      const result = authMode === "login"
        ? await login(authUsername, authPassword)
        : await register(authUsername, authPassword);

      if (result.success) {
        localStorage.setItem("userId", result.userId);
        localStorage.setItem("username", result.username);
        setUserName(result.username);
        setShowAuthModal(false);
        setAuthUsername("");
        setAuthPassword("");
        await loadChats();
        const adminStatus = await checkAdmin();
        setIsAdmin(adminStatus);
        await loadSubscription();
      } else {
        alert(result.error || "Ошибка");
      }
    } catch (error) {
      console.error("Auth error:", error);
      alert(error.message || "Ошибка соединения с сервером");
    }
  };

  // ===== LOGOUT =====
  const handleLogout = () => setShowLogoutModal(true);
  const confirmLogout = () => {
    setShowLogoutModal(false);
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    setUserName('Гость');
    setIsAdmin(false);
    setChats([]);
    setMessages([{ role: 'ai', text: '👋 Привет! Я Nova AI. Чем могу помочь?' }]);
    setActiveChatId(null);
    setProfile([]);
    setRateLimit({ remaining: null, limit: null });
    setShowProfile(false);
    setShowSettings(false);
    setShowProjects(false);
    setShowUserMenu(false);
    setRemainingMessages(null);
    setUserPlan("Free Plan");
    setShowAuthModal(true);
  };

  // ===== SCROLL TO BOTTOM =====
  const scrollToBottom = () => {
    const chatContainer = document.querySelector('.chat-scroll-container');
    if (chatContainer) {
      chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
    }
  };

  // ===== SEND MESSAGE =====
  async function sendMessage(customText) {
    const userText = typeof customText === "string" ? customText : input.trim();
    if (!userText && !selectedFile) return;
    if (sending) return;

    setShowHome(false);

    if (selectedFile) {
      const fileSize = (selectedFile.size / 1024).toFixed(1);
      const fileMessage = `📎 ${selectedFile.name} (${fileSize} КБ)`;
      setMessages(prev => [...prev, { role: 'user', text: fileMessage }]);

      setSending(true);
      setTyping(true);
      setNovaStatus("Думаю...");
      setFileUploading(true);

      try {
        const uploadData = await uploadFile(
          selectedFile,
          userText || 'Опиши, что изображено на картинке.'
        );

        let replyText = uploadData.content;

        if (!uploadData.isImage) {
          const chatId = activeChatId;
          let messageToNova = `Файл: ${uploadData.filename}\n\nСодержимое:\n${uploadData.content}`;
          if (userText) {
            messageToNova += `\n\nВопрос пользователя: ${userText}`;
          }
          let answer;
          if (!chatId) {
            const newChat = await createChat();
            setChats(prev => [newChat, ...prev]);
            setActiveChatId(newChat.id);
            answer = await askNova(newChat.id, messageToNova);
          } else {
            answer = await askNova(chatId, messageToNova);
          }
          replyText = answer.reply || answer;
        }

        setMessages(prev => [...prev, { role: 'ai', text: replyText }]);
        if (remainingMessages !== null && remainingMessages !== Infinity) {
          setRemainingMessages(prev => prev - 1);
        }

      } catch (error) {
        console.error('File error:', error);
        alert('Ошибка обработки файла: ' + error.message);
        setMessages(prev => prev.slice(0, -1));
      } finally {
        setFileUploading(false);
        setSelectedFile(null);
        document.querySelector('input[type="file"]').value = '';
        setInput('');
        setSending(false);
        setTyping(false);
        setNovaStatus("Готова");
      }
    } else {
      if (!userText) return;

      setMessages(prev => [...prev, { role: "user", text: userText }]);
      setInput("");
      setSending(true);
      setTyping(true);
      setNovaStatus("Думаю...");

      try {
        const result = await askNova(activeChatId, userText);

        if (result.rateLimit) {
          setRateLimit(result.rateLimit);
        }

        const novaText = result.reply || result;
        setMessages(prev => [...prev, { role: "ai", text: novaText }]);
        setNovaStatus("Готова");

        if (remainingMessages !== null && remainingMessages !== Infinity) {
          setRemainingMessages(prev => prev - 1);
        }
      } catch (error) {
        console.log("Nova error", error);
        let errorText = "⚠️ Ошибка связи с Nova";
        if (error.message && error.message.includes("Слишком много запросов")) {
          errorText = "⏳ Слишком много запросов. Подождите минуту.";
        }
        setMessages(prev => [...prev, { role: "ai", text: errorText }]);
      }
      setTyping(false);
      setSending(false);
    }
  }

  // ===== ЗАГРУЗКА ФАЙЛА =====
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Файл слишком большой (макс. 5 МБ)');
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="h-screen w-screen overflow-hidden flex bg-gradient-to-br from-slate-950 via-[#0a0a1a] to-slate-950 text-white relative">
      {/* ===== AURORA BACKGROUND ===== */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-50%] left-[-20%] w-[80%] h-[80%] rounded-full bg-indigo-500/20 blur-[120px] animate-aurora1"></div>
        <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-purple-500/20 blur-[120px] animate-aurora2"></div>
        <div className="absolute top-[30%] left-[40%] w-[50%] h-[50%] rounded-full bg-pink-500/10 blur-[100px] animate-aurora3"></div>
      </div>

      {/* ===== LOADING ===== */}
      {loading && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-all duration-1000 ${
            loadingFade ? "opacity-0 scale-110" : "opacity-100 scale-100"
          }`}
          style={{
            background: "radial-gradient(ellipse at 50% 50%, #0f0c29, #1a1a3e, #0a0a1a)"
          }}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full bg-indigo-500/20 blur-[100px] animate-aurora1"></div>
            <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-purple-500/20 blur-[100px] animate-aurora2"></div>
            <div className="absolute top-[40%] left-[30%] w-[40%] h-[40%] rounded-full bg-pink-500/10 blur-[80px] animate-aurora3"></div>
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="relative w-32 h-32 sm:w-40 sm:h-40">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 blur-2xl animate-pulse-slow opacity-70"></div>
              <div className="absolute inset-[-4px] rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-rotate-gradient"></div>
              <div className="relative w-full h-full rounded-full bg-slate-900/50 backdrop-blur-sm p-2">
                <img src={logo} className="w-full h-full object-contain rounded-full animate-float" />
              </div>
            </div>
            <h1 className="mt-6 text-4xl sm:text-5xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent animate-slide-up">Nova AI</h1>
            <div className="mt-4 text-slate-300 text-sm sm:text-base flex items-center gap-2">
              <span className="typing-text">{loadingText}</span>
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-blink"></span>
            </div>
            <div className="mt-6 flex gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-loading-dot" style={{ animationDelay: '0s' }}></div>
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-loading-dot" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-loading-dot" style={{ animationDelay: '0.4s' }}></div>
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-loading-dot" style={{ animationDelay: '0.6s' }}></div>
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-loading-dot" style={{ animationDelay: '0.8s' }}></div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-green-400 text-sm">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              <span>Система готова</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== AUTH MODAL ===== */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-3xl flex items-center justify-center animate-scaleIn p-4">
          <div className="relative w-full max-w-[420px] bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl shadow-indigo-500/10 p-6 sm:p-8 overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-400/5 rounded-full blur-3xl"></div>
            <div className="relative z-10">
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-1 shadow-lg shadow-indigo-500/30 animate-pulse-glow">
                  <img src={logo} className="w-full h-full rounded-full" />
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2 bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
                {authMode === "login" ? "Добро пожаловать" : "Создать аккаунт"}
              </h2>
              <p className="text-center text-slate-400 mb-6 text-sm">
                {authMode === "login" ? "Войдите в свой аккаунт Nova" : "Начните использовать Nova AI"}
              </p>
              <div className="space-y-4">
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-indigo-400 transition-colors" />
                  <input
                    type="text"
                    placeholder="Имя пользователя"
                    value={authUsername}
                    onChange={e => setAuthUsername(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-11 py-3.5 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-500/10 transition-all duration-300 text-sm sm:text-base hover:bg-white/10"
                  />
                </div>
                {authMode === "register" && (
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-indigo-400 transition-colors" />
                    <input
                      type="email"
                      placeholder="Email (опционально)"
                      value={authEmail}
                      onChange={e => setAuthEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-11 py-3.5 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-500/10 transition-all duration-300 text-sm sm:text-base hover:bg-white/10"
                    />
                  </div>
                )}
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-indigo-400 transition-colors" />
                  <input
                    type="password"
                    placeholder="Пароль"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAuth()}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-11 py-3.5 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-500/10 transition-all duration-300 text-sm sm:text-base hover:bg-white/10"
                  />
                </div>
                <button
                  onClick={handleAuth}
                  className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 py-3.5 rounded-2xl font-medium transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base relative overflow-hidden group"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {authMode === "login" ? "Войти" : "Зарегистрироваться"}
                    <Zap size={18} className="group-hover:rotate-12 transition-transform" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </button>
                <div className="text-center">
                  <button
                    onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
                    className="text-sm text-slate-400 hover:text-white transition-colors duration-200"
                  >
                    {authMode === "login"
                      ? "Нет аккаунта? Зарегистрируйтесь"
                      : "Уже есть аккаунт? Войдите"}
                  </button>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(`${API}/guest`, {
                        credentials: 'include'
                      });
                      const data = await response.json();
                      if (data.userId) {
                        localStorage.setItem("userId", data.userId);
                        localStorage.setItem("username", "Гость");
                        setUserName("Гость");
                        setShowAuthModal(false);
                        await loadChats();
                        const adminStatus = await checkAdmin();
                        setIsAdmin(adminStatus);
                        await loadSubscription();
                      } else {
                        alert("Ошибка входа как гость");
                      }
                    } catch (error) {
                      console.error("Guest error:", error);
                      alert("Ошибка соединения с сервером");
                    }
                  }}
                  className="w-full text-sm text-red-400/80 hover:text-red-400 transition-colors duration-200 mt-2"
                >
                  Продолжить как гость
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== SIDEBAR ===== */}
      <aside
        className={`fixed md:relative z-40 h-screen flex-shrink-0 border-r border-white/10 bg-white/5 backdrop-blur-2xl p-4 transition-all duration-500 flex flex-col ${
          sidebarOpen ? "w-72 left-0" : "w-0 -left-72 md:left-0 md:w-20"
        }`}
        style={{ overflow: 'hidden' }}
      >
        {sidebarOpen && (
          <>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-0.5 shadow-lg shadow-indigo-500/30 animate-pulse-glow">
                <img src={logo} className="w-full h-full rounded-full" />
              </div>
              <div>
                <h1 className="font-bold text-xl bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">Nova AI</h1>
                <p className="text-sm text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                  Online
                </p>
              </div>
            </div>

            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden w-full mb-4 p-3 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center gap-2 transition-all duration-300"
            >
              ✕ Закрыть
            </button>

            <button
              onClick={newChat}
              className="w-full p-3 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 mb-3 flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
              Новый чат
            </button>

            <div className="space-y-2">
              <button
                onClick={openProfile}
                className="w-full p-3 rounded-xl hover:bg-white/10 text-left flex items-center gap-2 transition-all duration-300 hover:scale-[1.02]"
              >
                <Brain size={20} className="text-indigo-400" />
                Память
              </button>
              <button
                onClick={() => setShowProjects(true)}
                className="w-full p-3 rounded-xl hover:bg-white/10 text-left flex items-center gap-2 transition-all duration-300 hover:scale-[1.02]"
              >
                <FolderOpen size={20} className="text-purple-400" />
                Проекты
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="w-full p-3 rounded-xl hover:bg-white/10 text-left flex items-center gap-2 transition-all duration-300 hover:scale-[1.02]"
              >
                <Settings size={20} className="text-pink-400" />
                Настройки
              </button>
            </div>

            <h2 className="mt-6 mb-3 text-sm text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span className="h-px flex-1 bg-white/10"></span>
              История
              <span className="h-px flex-1 bg-white/10"></span>
            </h2>
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
              {chats.map(chat => (
                <div
                  key={chat.id}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 rounded-xl p-2 transition-all duration-300 group hover:scale-[1.02]"
                >
                  <button
                    onClick={() => openChat(chat)}
                    className="flex-1 text-left truncate text-sm"
                  >
                    💬 {chat.title || "Новый чат"}
                  </button>
                  <button onClick={() => removeChat(chat.id)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110">
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-3 relative user-menu-container border-t border-white/10">
              {showUserMenu && (
                <div className="absolute bottom-full left-0 w-full mb-2 bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl shadow-indigo-500/5 p-2 z-50 animate-fadeInDown">
                  <div className="px-3 py-2 border-b border-white/10 mb-1">
                    <div className="font-medium text-white text-sm">{userName}</div>
                    <div className="text-xs text-slate-400">{userPlan}</div>
                  </div>
                  <div className="px-3 py-2 border-b border-white/10 text-xs text-slate-400">
                    Осталось сообщений: {remainingMessages === Infinity ? '∞' : remainingMessages}
                  </div>
                  <button className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-xl text-sm text-white flex items-center gap-2 transition-all duration-200 hover:scale-[1.02]">
                    <span>✨</span> Попробовать Plus бесплатно
                  </button>
                  <button className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-xl text-sm text-white flex items-center gap-2 transition-all duration-200 hover:scale-[1.02]">
                    <span>🎨</span> Персонализация
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); openProfile(); }}
                    className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-xl text-sm text-white flex items-center gap-2 transition-all duration-200 hover:scale-[1.02]"
                  >
                    <span>👤</span> Профиль
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); setShowSettings(true); }}
                    className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-xl text-sm text-white flex items-center gap-2 transition-all duration-200 hover:scale-[1.02]"
                  >
                    <span>⚙️</span> Настройки
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); setShowSubscription(true); }}
                    className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-xl text-sm text-white flex items-center gap-2 transition-all duration-200 hover:scale-[1.02]"
                  >
                    <span>💎</span> Подписка
                  </button>
                  <button className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-xl text-sm text-white flex items-center gap-2 transition-all duration-200 hover:scale-[1.02]">
                    <span>❓</span> Справка
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-xl text-sm text-white flex items-center gap-2 border-t border-white/10 mt-1 pt-2 text-red-400 hover:text-red-300 transition-all duration-200 hover:scale-[1.02]"
                  >
                    <LogOut size={16} />
                    Выйти
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => { setShowUserMenu(false); setShowAdminPanel(true); }}
                      className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-xl text-sm text-white flex items-center gap-2 border-t border-white/10 mt-1 pt-2 transition-all duration-200 hover:scale-[1.02]"
                    >
                      <span>👑</span> Админ-панель
                    </button>
                  )}
                </div>
              )}

              <div
                className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-3 hover:bg-white/15 transition-all duration-300 cursor-pointer hover:scale-[1.02]"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-lg shadow-indigo-500/25">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white text-sm tracking-wide truncate">{userName}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-slate-400 truncate">{userPlan}</span>
                      <span className="w-1 h-1 rounded-full bg-indigo-400/60"></span>
                      <span className="text-[10px] text-emerald-400 font-medium">● Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* ===== MAIN ===== */}
      <main className="flex-1 h-screen min-w-0 flex flex-col relative z-10">
        <button
          onClick={() => setSidebarOpen(true)}
          className={`md:hidden fixed top-4 left-4 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur-2xl border border-white/20 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
            sidebarOpen ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <Menu size={24} />
        </button>

        <div className="flex-1 overflow-y-auto chat-scroll-container custom-scrollbar">
          <div className="max-w-4xl mx-auto px-3 sm:px-4 space-y-4 sm:space-y-5 py-4 sm:py-6">
            {showHome && (
              <div className="h-full flex flex-col items-center justify-center animate-fadeIn text-center px-4">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-1 shadow-2xl shadow-indigo-500/30 mb-6 animate-pulse-glow">
                  <img src={logo} className="w-full h-full rounded-full" />
                </div>
                <h1 className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent animate-fadeIn">
                  Nova AI Dashboard
                </h1>
                <p className="mt-4 text-base sm:text-lg text-slate-400 animate-fadeIn">Центр управления твоим AI</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 mt-8 w-full max-w-md sm:max-w-none">
                  <div className="group p-4 sm:p-6 rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-[1.05] shadow-lg hover:shadow-indigo-500/10">
                    💬<p className="font-bold mt-2 text-sm sm:text-base">Чаты</p><p className="text-slate-400 text-sm sm:text-base">{chats.length}</p>
                  </div>
                  <div className="group p-4 sm:p-6 rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-[1.05] shadow-lg hover:shadow-purple-500/10">
                    🧠<p className="font-bold mt-2 text-sm sm:text-base">Память</p><p className="text-slate-400 text-sm sm:text-base">{profile.length}</p>
                  </div>
                  <div className="group p-4 sm:p-6 rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-[1.05] shadow-lg hover:shadow-pink-500/10">
                    🟢<p className="font-bold mt-2 text-sm sm:text-base">Статус</p><p className="text-green-400 text-sm sm:text-base">Online</p>
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg, index) => {
              const isFileMessage = msg.text && msg.text.startsWith("📎");
              return (
                <div
                  key={index}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  } animate-fadeInUp`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-3xl rounded-2xl px-4 sm:px-5 py-3 sm:py-4 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/5 ${
                      msg.role === "user"
                        ? "bg-gradient-to-br from-indigo-600/90 via-purple-600/90 to-pink-600/90 text-white border border-indigo-400/30"
                        : "bg-white/10 border border-white/20 text-white hover:bg-white/15"
                    }`}
                  >
                    <div className="flex gap-2 sm:gap-3 items-start min-w-0">
                      {msg.role === "ai" && (
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-0.5 flex-shrink-0 shadow-lg shadow-indigo-500/20 animate-pulse-glow">
                          <img src={logo} className="w-full h-full rounded-full bg-white/10 p-1" />
                        </div>
                      )}
                      <div className="prose prose-invert max-w-full overflow-hidden break-words w-full prose-sm sm:prose-base">
                        {isFileMessage ? (
                          <div className="flex items-center gap-2 sm:gap-3 bg-white/5 rounded-xl p-2 sm:p-3 border border-indigo-500/30 hover:bg-white/10 transition-all duration-200">
                            <span className="text-2xl sm:text-3xl">📄</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-white text-sm sm:text-base truncate">
                                {msg.text.replace("📎", "").trim()}
                              </div>
                              <div className="text-xs text-slate-400">Файл</div>
                            </div>
                          </div>
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({ children }) => <h1 className="text-xl sm:text-2xl font-bold text-indigo-400 mt-3 sm:mt-4 mb-1 sm:mb-2">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-lg sm:text-xl font-semibold text-purple-300 mt-2 sm:mt-3 mb-1">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-base sm:text-lg font-medium text-pink-300 mt-2">{children}</h3>,
                              ul: ({ children }) => <ul className="list-disc pl-4 sm:pl-5 space-y-1 text-slate-300">{children}</ul>,
                              li: ({ children }) => <li className="marker:text-indigo-400 text-sm sm:text-base">{children}</li>,
                              p: ({ children }) => <p className="text-slate-300 my-1 sm:my-2 leading-relaxed text-sm sm:text-base">{children}</p>,
                              strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                              blockquote: ({ children }) => <blockquote className="border-l-4 border-indigo-500 pl-3 sm:pl-4 italic text-slate-400 my-2 text-sm sm:text-base">{children}</blockquote>,
                              code: ({ children }) => <pre className="bg-black/50 rounded-xl p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm text-green-300 border border-white/5"><code>{children}</code></pre>
                            }}
                          >
                            {String(msg.text || "")}
                          </ReactMarkdown>
                        )}
                        {msg.role === "ai" && (
                          <div className="flex gap-2 mt-2 sm:mt-4">
                            <button className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-all duration-200 hover:scale-110 text-sm sm:text-base">👍</button>
                            <button className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-all duration-200 hover:scale-110 text-sm sm:text-base">👎</button>
                            <button
                              onClick={() => navigator.clipboard.writeText(String(msg.text))}
                              className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-all duration-200 hover:scale-110"
                            >
                              <Copy size={16} className="sm:w-5 sm:h-5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {fileUploading && (
              <div className="flex justify-start animate-fadeInUp">
                <div className="bg-white/10 border border-white/20 rounded-2xl px-4 sm:px-5 py-2 sm:py-3 flex items-center gap-2 sm:gap-3 backdrop-blur-sm">
                  <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-indigo-500 border-t-transparent"></div>
                  <span className="text-slate-300 text-sm sm:text-base">Загрузка файла...</span>
                </div>
              </div>
            )}

            {typing && (
              <div className="flex justify-start animate-fadeInUp">
                <div className="bg-white/10 border border-white/10 rounded-2xl px-4 sm:px-5 py-2 sm:py-3 backdrop-blur-sm">
                  <div className="flex gap-1.5 items-center">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-typing-dot"></span>
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-typing-dot"></span>
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-typing-dot"></span>
                    <span className="ml-1 text-xs text-slate-400 font-light">печатает...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEnd} />
          </div>
        </div>

        {/* ===== INPUT ===== */}
        <div className="w-full max-w-4xl mx-auto px-2 sm:px-4 pb-2 sm:pb-4">
          {rateLimit.remaining !== null && rateLimit.remaining <= 0 ? (
            <div className="rounded-[32px] bg-white/10 border border-white/20 backdrop-blur-xl p-4 sm:p-6 text-center animate-fadeIn">
              <div className="text-3xl sm:text-4xl mb-2 sm:mb-3">🔒</div>
              <h3 className="text-base sm:text-lg font-semibold text-white">Лимит запросов исчерпан</h3>
              <p className="text-sm text-slate-400 mt-1">Вы использовали все бесплатные запросы на сегодня. Обновите подписку или подождите до завтра.</p>
              <button
                onClick={() => alert('Функция обновления подписки в разработке')}
                className="mt-3 sm:mt-4 px-4 sm:px-6 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 rounded-xl text-white font-medium transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
              >
                Обновить подписку
              </button>
            </div>
          ) : (
            <div className="rounded-[32px] bg-white/10 border border-white/20 backdrop-blur-2xl p-3 sm:p-4 transition-all duration-300 shadow-lg shadow-indigo-500/5 hover:shadow-indigo-500/10">
              {selectedFile && (
                <div className="flex items-center gap-2 sm:gap-3 bg-white/10 rounded-2xl px-3 sm:px-4 py-2 mb-2 border border-indigo-500/30 animate-fadeInUp">
                  <span className="text-xl">📄</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{selectedFile.name}</div>
                    <div className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(1)} КБ</div>
                  </div>
                  <button
                    onClick={() => { setSelectedFile(null); document.querySelector('input[type="file"]').value = ''; }}
                    className="text-slate-400 hover:text-white transition-colors text-lg sm:text-xl hover:scale-110"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex gap-2 sm:gap-3 items-center">
                <input
                  value={input}
                  disabled={sending}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !sending) sendMessage(); }}
                  placeholder="Напишите сообщение..."
                  className="flex-1 bg-transparent border border-white/10 rounded-2xl px-3 sm:px-5 py-3 sm:py-4 outline-none text-white placeholder-slate-400 text-sm sm:text-base focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-500/10 transition-all duration-300"
                />

                <label className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-300 bg-white/10 hover:bg-white/20 cursor-pointer hover:scale-105 active:scale-95 flex-shrink-0">
                  <input type="file" className="hidden" onChange={handleFileSelect} accept="image/*,.txt" />
                  <span className="text-lg sm:text-xl">📎</span>
                </label>

                <button
                  disabled={sending}
                  onClick={() => sendMessage()}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/25 group"
                >
                  {sending ? "..." : <Send size={20} className="sm:w-6 sm:h-6 group-hover:rotate-12 transition-transform" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ===== PROFILE MODAL ===== */}
      {showProfile && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-3xl flex items-center justify-center animate-scaleIn p-4">
          <div className="w-full max-w-96 bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl shadow-indigo-500/10 p-6">
            <h2 className="text-xl font-bold mb-5 bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">🧠 Память Nova</h2>
            {profile.length === 0 ? (
              <p className="text-slate-400">Nova ничего не знает</p>
            ) : (
              profile.map(item => (
                <div key={item.id} className="bg-white/10 rounded-xl p-3 mb-2 border border-white/5 hover:bg-white/15 transition-all duration-200 hover:scale-[1.02]">
                  <b className="text-sm sm:text-base text-indigo-300">{item.key}</b>
                  <p className="text-slate-300 text-sm sm:text-base mt-1">{item.value}</p>
                </div>
              ))
            )}
            <button onClick={() => setShowProfile(false)} className="mt-5 w-full p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base">
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* ===== SETTINGS ===== */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-3xl flex items-center justify-center animate-scaleIn p-4">
          <div className="w-full max-w-96 bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl shadow-purple-500/10 p-6">
            <h2 className="text-xl font-bold mb-6 bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">⚙️ Настройки</h2>
            <div className="bg-white/10 rounded-xl p-4 flex justify-between items-center border border-white/5">
              <span className="text-sm sm:text-base flex items-center gap-2">
                <Sparkles size={18} className="text-indigo-400" />
                Анимации
              </span>
              <button
                onClick={() => setAnimations(!animations)}
                className={`w-12 sm:w-14 h-7 sm:h-8 rounded-full transition-all duration-300 ${
                  animations ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-lg shadow-indigo-500/25" : "bg-slate-600"
                }`}
              >
                <div className={`w-5 sm:w-6 h-5 sm:h-6 bg-white rounded-full transition-transform duration-300 shadow-lg ${animations ? "translate-x-6 sm:translate-x-7" : "translate-x-1"}`} />
              </button>
            </div>
            <button onClick={() => setShowSettings(false)} className="mt-5 w-full p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base">
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* ===== PROJECTS ===== */}
      {showProjects && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-3xl flex items-center justify-center animate-scaleIn p-4">
          <div className="w-full max-w-[420px] bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl shadow-pink-500/10 p-6">
            <h2 className="text-xl font-bold mb-5 bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">🚀 Проекты</h2>
            {projects.map(project => (
              <div key={project.id} className="bg-white/10 rounded-xl p-4 mb-3 border border-white/5 hover:bg-white/15 transition-all duration-200 hover:scale-[1.02]">
                <h3 className="font-bold mb-2 text-sm sm:text-base text-indigo-300">📁 {project.name}</h3>
                {project.items.map((item, i) => <p key={i} className="text-slate-300 text-sm sm:text-base">• {item}</p>)}
              </div>
            ))}
            <button onClick={() => setShowProjects(false)} className="mt-4 w-full p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base">
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* ===== LOGOUT CONFIRMATION ===== */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-3xl flex items-center justify-center animate-scaleIn p-4">
          <div className="relative w-full max-w-[400px] bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl shadow-red-500/5 p-6 sm:p-8 overflow-hidden text-center">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-red-500/15 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/15 rounded-full blur-3xl"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-4 border-2 border-red-500/30">
                <LogOut className="w-8 h-8 sm:w-10 sm:h-10 text-red-400" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Выйти из аккаунта?</h3>
              <p className="text-sm sm:text-base text-slate-400 mb-6">Вы уверены? Данные сохранятся.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowLogoutModal(false)} className="flex-1 py-2.5 sm:py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base">
                  Отмена
                </button>
                <button onClick={confirmLogout} className="flex-1 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-medium transition-all duration-300 shadow-lg shadow-red-500/25 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base">
                  Выйти
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ADMIN PANEL ===== */}
      {showAdminPanel && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}

      {/* ===== SUBSCRIPTION PANEL ===== */}
      {showSubscription && (
        <Subscription onClose={() => setShowSubscription(false)} />
      )}

      {/* ===== SCROLL BUTTON ===== */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 sm:bottom-28 right-4 sm:right-8 z-40 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 shadow-lg shadow-indigo-500/25 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
          aria-label="Прокрутить вниз"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </button>
      )}
    </div>
  );
}