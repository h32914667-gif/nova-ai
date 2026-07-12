const API = import.meta.env.VITE_API_URL || "https://nova-api.onrender.com";

export async function createChat() {
  const userId = localStorage.getItem("userId");
  const response = await fetch(`${API}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId })
  });
  return await response.json();
}

export async function getChats() {
  const userId = localStorage.getItem("userId");
  const response = await fetch(`${API}/chats/${userId}`);
  return await response.json();
}

export async function getMessages(chatId) {
  const response = await fetch(`${API}/messages/${chatId}`);
  return await response.json();
}

export async function askNova(chatId, message, onChunk) {
  const userId = localStorage.getItem("userId");
  try {
    const response = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, chatId, message })
    });
    if (response.status === 429) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Слишком много запросов. Подождите минуту.");
    }
    if (!response.ok) {
      throw new Error("Ошибка сервера");
    }
    const remaining = response.headers.get('x-ratelimit-remaining');
    const limit = response.headers.get('x-ratelimit-limit');
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

export async function getMemory(userId) {
  const response = await fetch(`${API}/memory/${userId}`);
  return await response.json();
}

export async function deleteChat(chatId) {
  const response = await fetch(`${API}/chats/${chatId}`, {
    method: "DELETE"
  });
  return await response.json();
}

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