const API = import.meta.env.VITE_API_URL || "https://nova-ai-6z2q.onrender.com";

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ТОКЕНА =====
function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function removeToken() {
  localStorage.removeItem('token');
}

function getHeaders() {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ===== АВТОРИЗАЦИЯ =====
export async function register(username, password) {
  const response = await fetch(`${API}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Ошибка регистрации");
  }
  const data = await response.json();
  if (data.token) {
    setToken(data.token);
  }
  return data;
}

export async function login(username, password) {
  const response = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Ошибка входа");
  }
  const data = await response.json();
  if (data.token) {
    setToken(data.token);
  }
  return data;
}

export async function logout() {
  removeToken();
  localStorage.removeItem('userId');
  localStorage.removeItem('username');
  return { success: true };
}

// ===== ЧАТЫ =====
export async function createChat() {
  const response = await fetch(`${API}/chats`, {
    method: "POST",
    headers: getHeaders()
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка создания чата");
  }
  return await response.json();
}

export async function getChats() {
  const response = await fetch(`${API}/chats`, {
    headers: getHeaders()
  });
  if (!response.ok) {
    throw new Error("Ошибка загрузки чатов");
  }
  return await response.json();
}

export async function deleteChat(chatId) {
  const response = await fetch(`${API}/chats/${chatId}`, {
    method: "DELETE",
    headers: getHeaders()
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка удаления чата");
  }
  return await response.json();
}

// ===== ПЕРЕКЛЮЧИТЬ ЗАКРЕПЛЕНИЕ ЧАТА =====
export async function togglePinChat(chatId) {
  const response = await fetch(`${API}/chats/${chatId}/pin`, {
    method: "PATCH",
    headers: getHeaders()
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка закрепления");
  }
  return await response.json();
}

// ===== СООБЩЕНИЯ =====
export async function getMessages(chatId) {
  const response = await fetch(`${API}/messages/${chatId}`, {
    headers: getHeaders()
  });
  if (!response.ok) {
    throw new Error("Ошибка загрузки сообщений");
  }
  return await response.json();
}

// ===== ОСНОВНОЙ ЧАТ =====
export async function askNova(chatId, message, onChunk) {
  try {
    const response = await fetch(`${API}/chat`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ chatId, message })
    });
    if (response.status === 429) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Слишком много запросов. Подождите минуту.");
    }
    if (!response.ok) {
      throw new Error("Ошибка сервера");
    }
    const remaining = response.headers.get("x-ratelimit-remaining");
    const limit = response.headers.get("x-ratelimit-limit");
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return {
        reply: data.reply || "Ошибка",
        rateLimit: { remaining, limit }
      };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      fullText += chunk;
      if (onChunk) {
        onChunk(fullText);
      }
    }
    return {
      reply: fullText,
      rateLimit: { remaining, limit }
    };
  } catch (error) {
    console.error("ASK NOVA ERROR:", error);
    throw error;
  }
}

// ===== ПАМЯТЬ =====
export async function getMemory() {
  const response = await fetch(`${API}/memory`, {
    headers: getHeaders()
  });
  if (!response.ok) {
    throw new Error("Ошибка загрузки памяти");
  }
  return await response.json();
}

// ===== TTS =====
export async function getTTS(text) {
  const response = await fetch(`${API}/tts`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ text })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "TTS error");
  }
  return await response.arrayBuffer();
}

// ===== ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ =====
export async function generateImage(prompt) {
  const response = await fetch(`${API}/generate-image`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ prompt })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка генерации изображения");
  }
  return await response.json();
}

// ===== СОЗДАНИЕ ИНВОЙСА ДЛЯ ОПЛАТЫ ПОДПИСКИ =====
export async function createInvoice(plan) {
  const response = await fetch(`${API}/create-invoice`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ plan })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка создания счёта");
  }
  return await response.json();
}

// ===== ЗАГРУЗКА ФАЙЛОВ =====
export async function uploadFile(file, question = "Опиши, что изображено на картинке.") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("question", question);
  const response = await fetch(`${API}/upload`, {
    method: "POST",
    headers: {
      'Authorization': getHeaders()['Authorization'] || ''
    },
    body: formData
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Ошибка загрузки файла");
  }
  return await response.json();
}

// ===== АДМИН-ПАНЕЛЬ =====
export async function checkAdmin() {
  try {
    const response = await fetch(`${API}/admin/stats`, {
      headers: getHeaders()
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getStats() {
  const response = await fetch(`${API}/admin/stats`, {
    headers: getHeaders()
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка статистики");
  }
  return await response.json();
}

export async function getUsers() {
  const response = await fetch(`${API}/admin/users`, {
    headers: getHeaders()
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка списка пользователей");
  }
  return await response.json();
}

export async function deleteUser(id) {
  const response = await fetch(`${API}/admin/users/${id}`, {
    method: "DELETE",
    headers: getHeaders()
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка удаления");
  }
  return await response.json();
}

// ===== ПОДПИСКИ =====
export async function getSubscription() {
  const response = await fetch(`${API}/subscription`, {
    headers: getHeaders()
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка получения подписки");
  }
  return await response.json();
}

export async function upgradePlan(plan) {
  const response = await fetch(`${API}/subscription/upgrade`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ plan })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка обновления подписки");
  }
  return await response.json();
}

export async function getPlans() {
  const response = await fetch(`${API}/plans`, {
    headers: getHeaders()
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка получения тарифов");
  }
  return await response.json();
}

export { API };