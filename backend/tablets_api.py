import os
import json
import re
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from groq import Groq

try:
    from backend.config import GROQ_MODEL_TABLETS as VISION_MODEL, GROQ_API_KEY_TABLETS
except ModuleNotFoundError:
    from config import GROQ_MODEL_TABLETS as VISION_MODEL, GROQ_API_KEY_TABLETS

# Offline fallback: reuse the local Ollama helper from chat_api
try:
    from backend.chat_api import ollama_stream, OFFLINE_ERROR
except ModuleNotFoundError:
    from chat_api import ollama_stream, OFFLINE_ERROR

TEXT_MODEL = VISION_MODEL

router = APIRouter(prefix="/tablets", tags=["Tablets Mode"])

# ── Singleton Groq client ────────────────────────────────────────────────────
_groq_client: Optional[Groq] = None

def get_groq_client() -> Groq:
    global _groq_client
    if not GROQ_API_KEY_TABLETS or "your_groq" in GROQ_API_KEY_TABLETS:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GROQ_API_KEY_TABLETS is not configured in backend/.env"
        )
    if _groq_client is None:
        _groq_client = Groq(api_key=GROQ_API_KEY_TABLETS, timeout=30.0, max_retries=1)
    return _groq_client

class ScannedMed(BaseModel):
    name: str
    dosage: str
    frequency: str
    times: List[str]  # e.g. ["09:00", "21:00"]
    duration_days: Optional[int] = None
    meal_relation: str = "after"  # "before" | "after"
    notes: Optional[str] = ""

class PrescriptionResponse(BaseModel):
    doctor: str = ""
    notes: str = ""
    medicines: List[ScannedMed] = Field(default_factory=list)

class ScanPrescriptionRequest(BaseModel):
    data_url: Optional[str] = Field(default=None, description="Base64 encoded string or data URL of prescription photo or PDF")
    ocr_text: Optional[str] = Field(default=None, description="Raw OCR text extracted from the prescription image")
    media_type: Optional[str] = "image/jpeg"

@router.get("/status")
def tablets_status():
    has_key = bool(GROQ_API_KEY_TABLETS and "your_groq" not in GROQ_API_KEY_TABLETS)
    return {
        "mode": "tablets",
        "api_key_configured": has_key,
        "model": VISION_MODEL,
        "text_model": TEXT_MODEL
    }

@router.post("/scan-prescription", response_model=PrescriptionResponse)
def scan_prescription(req: ScanPrescriptionRequest):
    """
    Parse prescription text (from OCR) and extract medicines using qwen model.
    Frontend does OCR with Tesseract.js, backend parses with qwen via Groq SDK.
    """
    ocr_text = req.ocr_text or ""
    if not ocr_text.strip():
        raise HTTPException(status_code=400, detail="No OCR text provided. Please scan the image first.")

    prompt = f"""You are a medical prescription parser. Below is raw OCR text extracted from a prescription image. 
Extract the doctor's name, general instructions/notes, and ALL prescribed medicines.

For each medicine extract:
- name: medicine name
- dosage: e.g. 500mg, 10ml
- frequency: e.g. OD, BD, TDS, HS
- times: map frequency to 24h times (OD->["09:00"], BD->["09:00","21:00"], TDS->["08:00","14:00","20:00"], HS->["22:00"])
- duration_days: number of days
- meal_relation: "before" or "after" food
- notes: any extra instructions

Return ONLY a valid JSON object (no markdown, no explanation) matching this schema:
{{
  "doctor": "Dr. Name",
  "notes": "general notes",
  "medicines": [
    {{
      "name": "Medicine Name",
      "dosage": "500mg",
      "frequency": "BD",
      "times": ["09:00", "21:00"],
      "duration_days": 30,
      "meal_relation": "after",
      "notes": ""
    }}
  ]
}}

OCR TEXT:
{ocr_text}
"""

    offline = False
    content = ""
    try:
        client = get_groq_client()
    except HTTPException:
        # No cloud key — fall through to Ollama
        client = None

    try:
        if client:
            print(f"Sending OCR text to {VISION_MODEL} ({len(ocr_text)} chars)")
            response = client.chat.completions.create(
                model=VISION_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1000,
                response_format={"type": "json_object"}
            )
            content = response.choices[0].message.content or ""
            print(f"Groq response: {content[:500]}")
        else:
            raise Exception("No API key — falling through to Ollama")
    except Exception as cloud_error:
        print(f"Groq prescription parse failed ({cloud_error}), trying local Ollama...", flush=True)
        try:
            content = "".join(ollama_stream([{"role": "user", "content": prompt}], temperature=0.1, max_tokens=1000, json_mode=True))
            offline = True
        except Exception as local_error:
            print(f"Local Ollama prescription parse failed: {local_error}", flush=True)
            raise HTTPException(status_code=503, detail=OFFLINE_ERROR)

    try:
        content = content.strip()
        if not content:
            raise ValueError("Received an empty response from the AI model")

        # Strip out markdown json blocks if model wrapped them
        match = re.search(r'\{[\s\S]*\}', content)
        if match:
            content = match.group(0)
            
        if not content:
             raise ValueError("Could not extract JSON object from the AI response")

        parsed = json.loads(content)

        doctor = parsed.get("doctor", "")
        notes = parsed.get("notes", "")
        if offline:
            notes = ("Read by the offline AI - please double-check every medicine, dose and time before saving. " + (notes or "")).strip()
        meds_raw = parsed.get("medicines", [])

        medicines = []
        for m in meds_raw:
            medicines.append(ScannedMed(
                name=m.get("name", "Unknown Medicine"),
                dosage=m.get("dosage", "1 tablet"),
                frequency=m.get("frequency", "OD"),
                times=m.get("times", ["09:00"]),
                duration_days=m.get("duration_days", 14),
                meal_relation=m.get("meal_relation", "after"),
                notes=m.get("notes", "")
            ))

        print(f"Successfully parsed {len(medicines)} medicine(s)")
        return PrescriptionResponse(doctor=doctor, notes=notes, medicines=medicines)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Parsing Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to parse prescription: {str(e)}")
