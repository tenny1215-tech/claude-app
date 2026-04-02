import os
from typing import Any, Dict, List

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


def _get_api_key() -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("未检测到环境变量 ANTHROPIC_API_KEY")
    return api_key


def _extract_text(resp: Any) -> str:
    # Anthropic SDK returns content blocks, we concatenate only text blocks.
    parts: List[str] = []
    for block in getattr(resp, "content", []) or []:
        if getattr(block, "type", None) == "text":
            text = getattr(block, "text", "")
            if text:
                parts.append(text)
    return "".join(parts).strip()


app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html", app_name=APP_NAME)


@app.post("/api/chat")
def chat():
    payload: Dict[str, Any] = request.get_json(silent=True) or {}
    messages: List[Dict[str, str]] = payload.get("messages") or []

    # Basic validation: keep only role/content pairs expected by the SDK.
    cleaned: List[Dict[str, str]] = []
    for m in messages:
        role = m.get("role")
        content = m.get("content")
        if role in ("user", "assistant") and isinstance(content, str):
            cleaned.append({"role": role, "content": content})

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
        # Don’t leak secrets; just return the error message.
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run()

