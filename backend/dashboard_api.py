import os
import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from groq import Groq

try:
    from backend.config import GROQ_MODEL_DASHBOARD as MODEL_NAME, GROQ_API_KEY_DASHBOARD
except ModuleNotFoundError:
    from config import GROQ_MODEL_DASHBOARD as MODEL_NAME, GROQ_API_KEY_DASHBOARD

# Offline fallback: reuse the local Ollama helper from chat_api
try:
    from backend.chat_api import ollama_stream
except ModuleNotFoundError:
    from chat_api import ollama_stream

router = APIRouter(prefix="/dashboard", tags=["Dashboard Mode"])

def get_groq_client() -> Optional[Groq]:
    # None when no key is configured: requests then fall through to the local Ollama model.
    if not GROQ_API_KEY_DASHBOARD or "your_groq" in GROQ_API_KEY_DASHBOARD:
        print("GROQ_API_KEY_DASHBOARD is not configured in backend/.env; using local Ollama", flush=True)
        return None
    return Groq(api_key=GROQ_API_KEY_DASHBOARD, timeout=15.0, max_retries=1)

class VitalsInput(BaseModel):
    age: Optional[int] = 30
    gender: Optional[str] = "unspecified"
    height_cm: float = 170.0
    weight_kg: float = 70.0
    sugar_fasting: float = 95.0
    bp_systolic: int = 120
    bp_diastolic: int = 80
    goal: Optional[str] = "maintain"
    diet: Optional[str] = "balanced"
    conditions: List[str] = Field(default_factory=list)
    allergies: List[str] = Field(default_factory=list)

class InsightResponse(BaseModel):
    recommendation: str  # "gain" | "lose" | "maintain"
    headline: str
    target_weight_min: float
    target_weight_max: float
    daily_calories: int
    tips: List[str]

@router.get("/status")
def dashboard_status():
    has_key = bool(GROQ_API_KEY_DASHBOARD and "your_groq" not in GROQ_API_KEY_DASHBOARD)
    return {
        "mode": "dashboard",
        "api_key_configured": has_key,
        "model": MODEL_NAME
    }

@router.post("/insight", response_model=InsightResponse)
def generate_dashboard_insight(data: VitalsInput):
    """
    Generate AI health insight and recommendations for the Dashboard mode using GROQ_API_KEY_DASHBOARD.
    """
    client = get_groq_client()
    
    # Calculate basic BMI for context
    height_m = data.height_cm / 100.0
    bmi = round(data.weight_kg / (height_m * height_m), 1) if height_m > 0 else 22.0
    min_w = round(18.5 * (height_m ** 2), 1)
    max_w = round(24.9 * (height_m ** 2), 1)

    system_prompt = (
        "You are Phantom, a careful personal health assistant. Base recommendations on BMI, blood sugar, and BP vitals. "
        "Be practical, empathetic, and encouraging. Return ONLY a valid JSON object without markdown formatting."
    )

    user_prompt = f"""
Profile details:
- Age: {data.age}, Gender: {data.gender}
- Height: {data.height_cm} cm, Weight: {data.weight_kg} kg (BMI: {bmi})
- Healthy weight range: {min_w} - {max_w} kg
- Fasting Blood Sugar: {data.sugar_fasting} mg/dL
- Blood Pressure: {data.bp_systolic}/{data.bp_diastolic} mmHg
- Stated Goal: {data.goal}, Diet preference: {data.diet}
- Existing Health Conditions: {', '.join(data.conditions) if data.conditions else 'None'}
- Allergies: {', '.join(data.allergies) if data.allergies else 'None'}

Generate a JSON object strictly matching this schema:
{{
  "recommendation": "gain" | "lose" | "maintain",
  "headline": "<max 8 word headline summarizing current status>",
  "target_weight_min": <number min weight in kg>,
  "target_weight_max": <number max weight in kg>,
  "daily_calories": <recommended calorie target integer>,
  "tips": ["tip 1", "tip 2", "tip 3"]
}}
"""

    insight_messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    try:
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=insight_messages,
                response_format={"type": "json_object"},
                temperature=0.4,
                max_tokens=400,
            )
            content = response.choices[0].message.content
        except Exception as cloud_error:
            print(f"[insight] Groq failed ({cloud_error}), trying local Ollama...", flush=True)
            content = "".join(ollama_stream(insight_messages, temperature=0.4, max_tokens=500, json_mode=True))
        parsed = json.loads(content)
        
        # Ensure mandatory fields with fallbacks
        return InsightResponse(
            recommendation=parsed.get("recommendation", "maintain"),
            headline=parsed.get("headline", "Keep tracking your daily vitals"),
            target_weight_min=float(parsed.get("target_weight_min", min_w)),
            target_weight_max=float(parsed.get("target_weight_max", max_w)),
            daily_calories=int(parsed.get("daily_calories", 2000)),
            tips=parsed.get("tips", [
                "Drink 2.5L of water daily.",
                "Maintain consistent meal times.",
                "Log your daily blood pressure and sugar levels."
            ])[:3]
        )
    except Exception as e:
        # Graceful fallback if Groq API call fails or key is unconfigured
        return InsightResponse(
            recommendation="maintain",
            headline="Health tracking initialized",
            target_weight_min=min_w,
            target_weight_max=max_w,
            daily_calories=2000,
            tips=[
                "Stay hydrated throughout the day.",
                "Maintain a balanced daily diet.",
                "Monitor your blood sugar and pressure regularly."
            ]
        )

class CardInsightRequest(BaseModel):
    card_type: str
    metric_label: str
    current_value: str
    status: Optional[str] = None
    age: Optional[int] = 30
    gender: Optional[str] = "unspecified"
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    bmi: Optional[float] = None
    bmi_category: Optional[str] = None
    sugar: Optional[float] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    goal: Optional[str] = None
    diet: Optional[str] = None
    conditions: List[str] = Field(default_factory=list)

class CardInsightResponse(BaseModel):
    card_type: str
    metric_label: str
    headline: str
    tips: List[str]

import re

def safe_parse_json(text: str) -> dict:
    if not text:
        return {}
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end+1])
        except Exception:
            pass
    try:
        return json.loads(text)
    except Exception:
        pass

    # Regex fallback for truncated or partial JSON responses
    res: dict = {}
    headline_match = re.search(r'"headline"\s*:\s*"([^"]+)"', text)
    if headline_match:
        res["headline"] = headline_match.group(1)

    tips_match = re.search(r'"tips"\s*:\s*\[(.*)', text, re.DOTALL)
    if tips_match:
        raw_tips = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', tips_match.group(1))
        valid_tips = [t for t in raw_tips if t.strip() and t not in ("headline", "tips")]
        if valid_tips:
            res["tips"] = valid_tips[:3]

    return res

@router.post("/card-insight", response_model=CardInsightResponse)
def generate_card_insight(data: CardInsightRequest):
    """
    Generate focused AI betterment insights for a specific clicked dashboard card.
    Uses MODEL_NAME from config (configured via GROQ_MODEL_DASHBOARD in backend/.env).
    """
    print(f"[card-insight] ▶ Received: metric={data.metric_label} | value={data.current_value} | status={data.status}")
    client = get_groq_client()
    system_prompt = (
        "You are Phantom AI, a careful health assistant. Provide concise, medically sound betterment advice for a specific health card metric. "
        "Output ONLY a raw JSON object with keys 'headline' and 'tips' (array of 3 short strings). Do not write reasoning or markdown."
    )
    profile_lines = [
        f"Age: {data.age}, Gender: {data.gender}",
        f"Height: {data.height_cm} cm, Weight: {data.weight_kg} kg" if data.height_cm and data.weight_kg else None,
        f"BMI: {data.bmi} ({data.bmi_category})" if data.bmi else None,
        f"Fasting blood sugar: {data.sugar} mg/dL" if data.sugar else None,
        f"Blood pressure: {data.bp_systolic}/{data.bp_diastolic} mmHg" if data.bp_systolic and data.bp_diastolic else None,
        f"Goal: {data.goal}, Diet: {data.diet}" if data.goal or data.diet else None,
        f"Conditions: {', '.join(data.conditions)}" if data.conditions else None,
    ]
    profile_context = ". ".join(line for line in profile_lines if line)

    user_prompt = f"""Full health profile: {profile_context}.

The user clicked on the '{data.metric_label}' card.
Current reading: {data.current_value}. Status: {data.status or 'Normal'}.

Give 3 personalised, specific improvement tips for THIS metric only, based on the full profile above.
Output raw JSON matching this schema:
{{
  "headline": "<max 6 words specific to this metric and profile>",
  "tips": ["<personalised tip 1, max 12 words>", "<personalised tip 2, max 12 words>", "<personalised tip 3, max 12 words>"]
}}
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    content = ""
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=1000,
        )
        content = response.choices[0].message.content or ""
    except Exception as e:
        print(f"[card-insight] Notice: json_object mode failed ({e}), retrying standard completion...")
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                temperature=0.3,
                max_tokens=1000,
            )
            content = response.choices[0].message.content or ""
        except Exception as e2:
            print(f"[card-insight] Groq unavailable ({e2}), trying local Ollama...", flush=True)
            try:
                content = "".join(ollama_stream(messages, temperature=0.3, max_tokens=700, json_mode=True))
            except Exception as e3:
                print(f"[card-insight] ❌ Error in backend generation: {e3}")

    print(f"[card-insight] Groq raw response: {content}")
    parsed = safe_parse_json(content)

    headline = parsed.get("headline") or f"Betterment for {data.metric_label}"
    tips = parsed.get("tips")
    if not isinstance(tips, list) or len(tips) == 0:
        tips = [
            f"Keep tracking your {data.metric_label} regularly.",
            "Maintain healthy hydration and sleep habits.",
            "Stay active with daily physical movement."
        ]

    return CardInsightResponse(
        card_type=data.card_type,
        metric_label=data.metric_label,
        headline=headline,
        tips=tips[:3]
    )

