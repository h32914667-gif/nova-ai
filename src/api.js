const API = import.meta.env.VITE_API_URL || "https://nova-ai-6z2q.onrender.com";

// ===== АВТОРИЗАЦИЯ =====
export async function register(username, password) {
  const response = await fetch(`${API}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Ошибка регистрации");
  }
  return await response.json();
}

export async function login(username, password) {
  const response = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Ошибка входа");
  }
  return await response.json();
}

// ===== ЧАТЫ =====
export async function createChat() {
  const response = await fetch(`${API}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'include'
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка создания чата");
  }
  return await response.json();
}

export async function getChats() {
  const response = await fetch(`${API}/chats`, {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error("Ошибка загрузки чатов");
  }
  return await response.json();
}

export async function deleteChat(chatId) {
  const response = await fetch(`${API}/chats/${chatId}`, {
    method: "DELETE",
    credentials: 'include'
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка удаления чата");
  }
  return await response.json();
}

// ===== СООБЩЕНИЯ =====
export async function getMessages(chatId) {
  const response = await fetch(`${API}/messages/${chatId}`, {
    credentials: 'include'
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
      headers: { "Content-Type": "application/json" },
      credentials: 'include',
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
    credentials: 'include'
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
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify({ text })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "TTS error");
  }
  return await response.arrayBuffer();
}

// ===== ЗАГРУЗКА ФАЙЛОВ =====
export async function uploadFile(file, question = "Опиши, что изображено на картинке.") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("question", question);
  const response = await fetch(`${API}/upload`, {
    method: "POST",
    credentials: 'include',
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
      credentials: 'include'
    });
    return response.ok; // 200 – админ, иначе false
  } catch {
    return false;
  }
}

export async function getStats() {
  const response = await fetch(`${API}/admin/stats`, {
    credentials: 'include'
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка статистики");
  }
  return await response.json();
}

export async function getUsers() {
  const response = await fetch(`${API}/admin/users`, {
    credentials: 'include'
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
    credentials: 'include'
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
    credentials: 'include'
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
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
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
    credentials: 'include'
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Ошибка получения тарифов");
  }
  return await response.json();
}
export { API };