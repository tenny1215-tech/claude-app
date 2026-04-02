import os
import re
from typing import Any, Dict, List, Union

from anthropic import Anthropic
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()

APP_NAME = "小克"
MODEL_NAME = "claude-haiku-4-5"
SYSTEM_PROMPT = (
    "你是小克，一个智能AI助手。不要提及Claude、Anthropic或任何其他AI公司。"
    "如果用户问你是什么模型或谁开发的，就说你是小克，一个独立的AI助手，无法透露技术细节。"
)

ALLOWED_IMAGE_MEDIA = frozenset(
    {"image/jpeg", "image/png", "image/gif", "image/webp"}
)
# 单张图片 base64 字符数上限（约 6MB 原始量级的粗上限，可按需调小）
MAX_IMAGE_B64_CHARS = 8_000_000


def _get_api_key() -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("未检测到环境变量 ANTHROPIC_API_KEY")
    return api_key


def _extract_text(resp: Any) -> str:
    parts: List[str] = []
    for block in getattr(resp, "content", []) or []:
        if getattr(block, "type", None) == "text":
            text = getattr(block, "text", "")
            if text:
                parts.append(text)
    return "".join(parts).strip()


def _validate_user_blocks(blocks: List[Any]) -> List[Dict[str, Any]]:
    if not blocks:
        raise ValueError("user content 不能为空")
    out: List[Dict[str, Any]] = []
    has_image = False
    for block in blocks:
        if not isinstance(block, dict):
            raise ValueError("无效的消息块")
        btype = block.get("type")
        if btype == "text":
            txt = block.get("text")
            if not isinstance(txt, str):
                raise ValueError("无效的文本块")
            out.append({"type": "text", "text": txt})
        elif btype == "image":
            src = block.get("source")
            if not isinstance(src, dict):
                raise ValueError("无效的图片块")
            if src.get("type") != "base64":
                raise ValueError("图片仅支持 base64")
            mt = src.get("media_type")
            data = src.get("data")
            if mt not in ALLOWED_IMAGE_MEDIA:
                raise ValueError(f"不支持的图片类型: {mt}")
            if not isinstance(data, str) or not data.strip():
                raise ValueError("图片数据为空")
            if len(data) > MAX_IMAGE_B64_CHARS:
                raise ValueError("图片过大，请选较小的图片")
            if not re.fullmatch(r"[A-Za-z0-9+/=\s]+", data.replace("\n", "").replace("\r", "")):
                raise ValueError("图片 base64 格式无效")
            out.append(
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": mt, "data": data.strip()},
                }
            )
            has_image = True
        else:
            raise ValueError(f"不支持的内容类型: {btype}")
    if not has_image and not any(b.get("type") == "text" and b.get("text", "").strip() for b in out):
        raise ValueError("至少需要文字或图片")
    return out


def _normalize_message(m: Dict[str, Any]) -> Union[Dict[str, str], Dict[str, Any], None]:
    role = m.get("role")
    content = m.get("content")
    if role == "assistant":
        if isinstance(content, str):
            return {"role": "assistant", "content": content}
        return None
    if role == "user":
        if isinstance(content, str):
            return {"role": "user", "content": content}
        if isinstance(content, list):
            blocks = _validate_user_blocks(content)
            return {"role": "user", "content": blocks}
    return None


def _normalize_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    for m in messages:
        nm = _normalize_message(m)
        if nm:
            cleaned.append(nm)
    return cleaned


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024


@app.get("/")
def index():
    return render_template("index.html", app_name=APP_NAME)


@app.post("/api/chat")
def chat():
    payload: Dict[str, Any] = request.get_json(silent=True) or {}
    raw_messages: List[Dict[str, Any]] = payload.get("messages") or []

    try:
        cleaned = _normalize_messages(raw_messages)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    if not cleaned:
        return jsonify({"error": "messages 不能为空"}), 400

    try:
        client = Anthropic(api_key=_get_api_key())
        resp = client.messages.create(
            model=MODEL_NAME,
            system=SYSTEM_PROMPT,
            max_tokens=1024,
            messages=cleaned,
        )
        answer = _extract_text(resp)
        return jsonify({"assistant": {"role": "assistant", "content": answer}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run()
