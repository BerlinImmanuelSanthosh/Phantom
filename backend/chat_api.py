import os
import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from groq import Groq

try:
    from backend.config import GROQ_MODEL_CHAT as MODEL_NAME, GROQ_API_KEY_CHAT
except ModuleNotFoundError:
    from config import GROQ_MODEL_CHAT as MODEL_NAME, GROQ_API_KEY_CHAT

router = APIRouter(prefix="/chat", tags=["Chat Mode"])

def get_groq_client() -> Groq:
    if not GROQ_API_KEY_CHAT or "your_groq" in GROQ_API_KEY_CHAT:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GROQ_API_KEY_CHAT is not configured in backend/.env"
        )
    return Groq(api_key=GROQ_API_KEY_CHAT)

class Message(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str

class ChatRequest(BaseModel):
    mode: str = "health"  # "health" | "food"
    messages: List[Message]
    ingredients: Optional[List[str]] = Field(default_factory=list)
    profile_context: Optional[str] = ""

class ChatResponse(BaseModel):
    role: str = "assistant"
    content: str
    mode: str

@router.get("/status")
def chat_status():
    has_key = bool(GROQ_API_KEY_CHAT and "your_groq" not in GROQ_API_KEY_CHAT)
    return {
        "mode": "chat",
        "api_key_configured": has_key,
        "model": MODEL_NAME
    }

def build_system_prompt(req: ChatRequest) -> str:
    context_str = req.profile_context or "No specific medical history provided."
    if req.mode == "food":
        ing_str = ", ".join(req.ingredients) if req.ingredients else "unspecified"
        return (
            f"You are Phantom's kitchen AI assistant. User Context: {context_str}\n"
            f"Available ingredients: {ing_str}.\n"
            "Provide concise, delicious, health-conscious recipe suggestions and cooking advice. "
            "Respect diets, allergies, and health conditions (e.g., low glycemic for high sugar, low salt for high BP). "
            "Use clear Markdown formatting and keep under 200 words."
        )
    else:
        return (
            f"You are Phantom, a warm, highly knowledgeable personal AI health assistant. User Context: {context_str}\n"
            "Personalise every answer using the profile vitals provided. Be concise, empathetic, and clear. "
            "Use Markdown formatting with bullet points when listing instructions or steps. "
            "Disclaimer: You are an AI health assistant, not a medical doctor. For emergency symptoms (chest pain, severe breathlessness, fainting, stroke signs), "
            "immediately instruct the user to contact emergency services or their emergency contact."
        )

@router.post("/completions", response_model=ChatResponse)
def chat_completion(req: ChatRequest):
    """
    Generate a full text response for the Chat mode using GROQ_API_KEY_CHAT.
    """
    client = get_groq_client()
    system_prompt = build_system_prompt(req)
    
    groq_messages = [{"role": "system", "content": system_prompt}]
    for msg in req.messages:
        groq_messages.append({"role": msg.role, "content": msg.content})

    try:
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=groq_messages,
            temperature=0.6,
            max_tokens=600,
        )
        reply = completion.choices[0].message.content
        return ChatResponse(role="assistant", content=reply, mode=req.mode)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat generation failed: {str(e)}"
        )

@router.post("/stream")
def chat_stream(req: ChatRequest):
    """
    Stream text tokens for the Chat mode using GROQ_API_KEY_CHAT.
    """
    client = get_groq_client()
    system_prompt = build_system_prompt(req)

    groq_messages = [{"role": "system", "content": system_prompt}]
    for msg in req.messages:
        groq_messages.append({"role": msg.role, "content": msg.content})

    def text_generator():
        try:
            stream = client.chat.completions.create(
                model=MODEL_NAME,
                messages=groq_messages,
                temperature=0.6,
                max_tokens=600,
                stream=True
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as e:
            yield f"\n[Error streaming response: {str(e)}]"

    return StreamingResponse(text_generator(), media_type="text/plain")
