const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const imagePickBtn = document.getElementById("imagePickBtn");
const imageFileInput = document.getElementById("imageFile");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const imagePreviewImg = document.getElementById("imagePreviewImg");
const imageRemoveBtn = document.getElementById("imageRemoveBtn");
const quotaLabel = document.getElementById("quotaLabel");
const quotaFill = document.getElementById("quotaFill");
const quotaTrack = document.getElementById("quotaTrack");

const QUOTA_STORAGE_KEY = "xiaoke_daily_quota";
const QUOTA_DAILY_LIMIT = 100;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function escapeToText(text) {
  return (text ?? "").toString();
}

function todayLocalKey() {
  return new Date().toLocaleDateString("en-CA");
}

function getQuotaUsed() {
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    const day = todayLocalKey();
    if (!raw) return 0;
    const s = JSON.parse(raw);
    if (!s || s.date !== day) return 0;
    const n = Number(s.used);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function setQuotaUsed(used) {
  const day = todayLocalKey();
  localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify({ date: day, used }));
}

function getQuotaRemaining() {
  return Math.max(0, QUOTA_DAILY_LIMIT - getQuotaUsed());
}

let isSending = false;

function updateQuotaUI() {
  const used = getQuotaUsed();
  const remaining = Math.max(0, QUOTA_DAILY_LIMIT - used);
  const pct = (remaining / QUOTA_DAILY_LIMIT) * 100;
  quotaLabel.textContent = `今日剩余 ${remaining}/${QUOTA_DAILY_LIMIT}`;
  quotaFill.style.width = `${pct}%`;
  quotaTrack.setAttribute("aria-valuenow", String(remaining));
  syncInputControls();
}

function syncInputControls() {
  const exhausted = getQuotaRemaining() <= 0;
  const busy = isSending;
  const locked = exhausted || busy;
  sendBtn.disabled = locked;
  inputEl.disabled = locked;
  imagePickBtn.disabled = locked;
  imageRemoveBtn.disabled = busy || !pendingImage;
  imageFileInput.disabled = locked;
}

function consumeOneQuota() {
  const used = getQuotaUsed();
  if (used >= QUOTA_DAILY_LIMIT) return false;
  setQuotaUsed(used + 1);
  updateQuotaUI();
  return true;
}

function autoResizeTextarea(el) {
  el.style.height = "0px";
  const next = Math.min(el.scrollHeight, 120);
  el.style.height = next + "px";
}

function updateInputBarHeight() {
  const bar = document.querySelector(".input-bar");
  if (!bar) return;
  const h = Math.ceil(bar.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--input-bar-height", `${h + 12}px`);
}

let pendingImage = null;
/** @type {string | null} */
let pendingObjectUrl = null;

function clearPendingImage() {
  if (pendingObjectUrl) {
    URL.revokeObjectURL(pendingObjectUrl);
    pendingObjectUrl = null;
  }
  pendingImage = null;
  imagePreviewImg.removeAttribute("src");
  imagePreviewWrap.classList.add("hidden");
  imageFileInput.value = "";
  syncInputControls();
  updateInputBarHeight();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("读取文件失败"));
    r.readAsDataURL(file);
  });
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.replace(/\r?\n/g, ""));
  if (!m) return null;
  const mediaType = m[1].trim();
  const data = m[2].replace(/\s/g, "");
  return { mediaType, data };
}

imagePickBtn.addEventListener("click", () => {
  if (imagePickBtn.disabled) return;
  imageFileInput.click();
});

imageRemoveBtn.addEventListener("click", () => {
  clearPendingImage();
});

imageFileInput.addEventListener("change", async () => {
  const file = imageFileInput.files && imageFileInput.files[0];
  if (!file) return;
  if (file.size > MAX_IMAGE_BYTES) {
    alert("图片不能超过 4MB");
    imageFileInput.value = "";
    return;
  }
  const okType = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type);
  if (!okType) {
    alert("仅支持 JPG、PNG、GIF、WebP");
    imageFileInput.value = "";
    return;
  }

  clearPendingImage();
  pendingObjectUrl = URL.createObjectURL(file);
  imagePreviewImg.src = pendingObjectUrl;
  imagePreviewWrap.classList.remove("hidden");

  try {
    const dataUrl = await fileToDataUrl(file);
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) throw new Error("解析图片失败");
    pendingImage = { file, mediaType: parsed.mediaType, data: parsed.data };
  } catch (e) {
    alert(String((e && e.message) || e));
    clearPendingImage();
    return;
  }
  syncInputControls();
  updateInputBarHeight();
});

function createMessageNode(msg) {
  const role = msg.role;
  const row = document.createElement("div");
  row.className = `row ${role === "user" ? "user" : "assistant"}`;

  if (role === "user") {
    const bubble = document.createElement("div");
    bubble.className = "bubble-user";
    if (msg.thumbUrl) {
      const img = document.createElement("img");
      img.className = "bubble-user-img";
      img.src = msg.thumbUrl;
      img.alt = "图片";
      bubble.appendChild(img);
    }
    const textEl = document.createElement("div");
    textEl.className = "bubble-user-text";
    textEl.textContent = escapeToText(msg.content);
    bubble.appendChild(textEl);
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
  text.textContent = escapeToText(msg.content);
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

/** @type {{role:'assistant'|'user', content:string, thumbUrl?:string, image?:{mediaType:string,data:string}}[]} */
let messages = [
  {
    role: "assistant",
    content: "你好！我是小克，有什么可以帮你的？",
  },
];

function toApiMessages(msgs) {
  return msgs.map((m) => {
    if (m.role === "assistant") {
      return { role: "assistant", content: m.content };
    }
    if (m.image) {
      const text = (m.content || "").trim() || "（用户上传了一张图片）";
      return {
        role: "user",
        content: [
          { type: "text", text: text },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: m.image.mediaType,
              data: m.image.data,
            },
          },
        ],
      };
    }
    return { role: "user", content: m.content || "" };
  });
}

renderChat(messages);
autoResizeTextarea(inputEl);
updateQuotaUI();
updateInputBarHeight();
window.addEventListener("resize", updateInputBarHeight);

function setLoading(isLoading) {
  isSending = isLoading;
  sendBtn.textContent = isLoading ? "发送中..." : "发送";
  syncInputControls();
}

async function sendMessage() {
  if (getQuotaRemaining() <= 0) {
    alert("今日额度已用完，明天再来");
    return;
  }

  const text = (inputEl.value || "").trim();
  const hasImage = Boolean(pendingImage);
  if (!text && !hasImage) return;
  if (sendBtn.disabled && sendBtn.textContent === "发送中...") return;

  const thumbForBubble = pendingObjectUrl;
  const imagePayload = pendingImage
    ? { mediaType: pendingImage.mediaType, data: pendingImage.data }
    : undefined;

  inputEl.value = "";
  autoResizeTextarea(inputEl);

  const userMsg = {
    role: "user",
    content: text,
    ...(imagePayload ? { image: imagePayload, thumbUrl: thumbForBubble || undefined } : {}),
  };
  messages = messages.concat([userMsg]);
  renderChat(messages);

  if (hasImage) {
    pendingImage = null;
    pendingObjectUrl = null;
    imagePreviewImg.removeAttribute("src");
    imagePreviewWrap.classList.add("hidden");
    imageFileInput.value = "";
  }

  setLoading(true);
  updateInputBarHeight();

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: toApiMessages(messages) }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.error) {
      const errText = data?.error ? String(data.error) : `HTTP ${resp.status}`;
      messages = messages.concat([{ role: "assistant", content: `发生错误：${errText}` }]);
      renderChat(messages);
      return;
    }

    if (!consumeOneQuota()) {
      messages = messages.concat([{ role: "assistant", content: "今日额度已用完，明天再来" }]);
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
    updateQuotaUI();
    updateInputBarHeight();
    inputEl.focus();
  }
}

sendBtn.addEventListener("click", sendMessage);

inputEl.addEventListener("input", () => {
  autoResizeTextarea(inputEl);
});
