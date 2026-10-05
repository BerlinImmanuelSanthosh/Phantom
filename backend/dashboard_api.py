import os
import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from groq import Groq

# Load environment variables
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

router = APIRouter(prefix="/dashboard", tags=["Dashboard Mode"])

# Retrieve Dashboard specific Groq API Key
GROQ_API_KEY_DASHBOARD = os.getenv("GROQ_API_KEY_DASHBOARD") or os.getenv("GROQ_API_KEY")
MODEL_NAME = os.getenv("GROQ_MODEL_DASHBOARD", "llama-3.3-70b-versatile")

def get_groq_client() -> Groq:
    if not GROQ_API_KEY_DASHBOARD or "your_groq" in GROQ_API_KEY_DASHBOARD:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GROQ_API_KEY_DASHBOARD is not configured in backend/.env"
        )
    return Groq(api_key=GROQ_API_KEY_DASHBOARD)

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

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=400,
        )
        content = response.choices[0].message.content
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
