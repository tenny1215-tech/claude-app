const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

function escapeToText(text) {
  return (text ?? "").toString();
}

function autoResizeTextarea(el) {
  // Reset height then grow to content.
  el.style.height = "0px";
  const next = Math.min(el.scrollHeight, 120);
  el.style.height = next + "px";
}

function createMessageNode(msg) {
  const role = msg.role;
  const content = escapeToText(msg.content);

  const row = document.createElement("div");
  row.className = `row ${role === "user" ? "user" : "assistant"}`;

  if (role === "user") {
    const bubble = document.createElement("div");
    bubble.className = "bubble-user";
    bubble.textContent = content;
    row.appendChild(bubble);
    return row;
  }

  const line = document.createElement("div");
  line.className = "assistant-line";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = "克";

  const text = document.createElement("div");
  text.className = "assistant-text";
  text.textContent = content;

  line.appendChild(avatar);
  line.appendChild(text);
  row.appendChild(line);
  return row;
}

function renderChat(messages) {
  chatEl.innerHTML = "";
  for (const m of messages) {
    chatEl.appendChild(createMessageNode(m));
  }
  chatEl.scrollTop = chatEl.scrollHeight;
}

let messages = [
  {
    role: "assistant",
    content: "你好！我是小克，有什么可以帮你的？",
  },
];

renderChat(messages);
autoResizeTextarea(inputEl);

function setLoading(isLoading) {
  sendBtn.disabled = isLoading;
  inputEl.disabled = isLoading;
  sendBtn.textContent = isLoading ? "发送中..." : "发送";
}

async function sendMessage() {
  const text = (inputEl.value || "").trim();
  if (!text) return;
  if (sendBtn.disabled) return;

  inputEl.value = "";
  autoResizeTextarea(inputEl);

  messages = messages.concat([{ role: "user", content: text }]);
  renderChat(messages);

  setLoading(true);
  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    const data = await resp.json();
    if (!resp.ok || data.error) {
      const errText = data?.error ? String(data.error) : `HTTP ${resp.status}`;
      messages = messages.concat([{ role: "assistant", content: `发生错误：${errText}` }]);
      renderChat(messages);
      return;
    }

    const assistantMsg = data?.assistant || { role: "assistant", content: "" };
    messages = messages.concat([assistantMsg]);
    renderChat(messages);
  } catch (e) {
    messages = messages.concat([{ role: "assistant", content: `发生错误：${String(e)}` }]);
    renderChat(messages);
  } finally {
    setLoading(false);
    inputEl.focus();
  }
}

sendBtn.addEventListener("click", sendMessage);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

inputEl.addEventListener("input", () => {
  autoResizeTextarea(inputEl);
});

