const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// =======================
// СОЗДАТЬ ЧАТ
// =======================
export async function createChat() {
  const userId = localStorage.getItem("userId");
  const response = await fetch(`${API}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId })
  });
  return await response.json();
}

// =======================
// ПОЛУЧИТЬ ЧАТЫ
// =======================
export async function getChats() {
  const userId = localStorage.getItem("userId");
  const response = await fetch(`${API}/chats/${userId}`);
  return await response.json();
}

// =======================
// ПОЛУЧИТЬ СООБЩЕНИЯ
// =======================
export async function getMessages(chatId) {
  const response = await fetch(`${API}/messages/${chatId}`);
  return await response.json();
}

// =======================
// ОТПРАВИТЬ NOVA (возвращает { reply, rateLimit } или выбрасывает ошибку)
// =======================
export async function askNova(chatId, message, onChunk) {
  const userId = localStorage.getItem("userId");

  try {
    const response = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, chatId, message })
    });

    // Если сервер вернул 429 (Too Many Requests)
    if (response.status === 429) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Слишком много запросов. Подождите минуту.");
    }

    if (!response.ok) {
      throw new Error("Ошибка сервера");
    }

    // Получаем заголовки с лимитами (OpenRouter их передаёт)
    const remaining = response.headers.get('x-ratelimit-remaining');
    const limit = response.headers.get('x-ratelimit-limit');

    const contentType = response.headers.get("content-type");

    // Если это JSON (для команд: запомни, забудь, кто ты и т.д.)
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return {
        reply: data.reply || "Ошибка",
        rateLimit: { remaining, limit }
      };
    }

    // Иначе — поток (обычный диалог)
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
    // Пробрасываем ошибку дальше, чтобы обработать в sendMessage
    throw error;
  }
}

// =======================
// ПАМЯТЬ NOVA
// =======================
export async function getMemory(userId) {
  const response = await fetch(`${API}/memory/${userId}`);
  return await response.json();
}

// =======================
// УДАЛИТЬ ЧАТ
// =======================
export async function deleteChat(chatId) {
  const response = await fetch(`${API}/chats/${chatId}`, {
    method: "DELETE"
  });
  return await response.json();
}

// =======================
// TTS (голос Nova)
// =======================
export async function getTTS(text) {
  const response = await fetch(`${API}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "TTS error");
  }
  return await response.arrayBuffer();
}