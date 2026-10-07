import os
import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from groq import Groq

try:
    from backend.config import GROQ_MODEL_TABLETS as VISION_MODEL, GROQ_MODEL_DASHBOARD as TEXT_MODEL, GROQ_API_KEY_TABLETS
except ModuleNotFoundError:
    from config import GROQ_MODEL_TABLETS as VISION_MODEL, GROQ_MODEL_DASHBOARD as TEXT_MODEL, GROQ_API_KEY_TABLETS

router = APIRouter(prefix="/tablets", tags=["Tablets Mode"])

def get_groq_client() -> Groq:
    if not GROQ_API_KEY_TABLETS or "your_groq" in GROQ_API_KEY_TABLETS:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GROQ_API_KEY_TABLETS is not configured in backend/.env"
        )
    return Groq(api_key=GROQ_API_KEY_TABLETS)

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
    Frontend does OCR with Tesseract.js, backend parses with qwen.
    """
    client = get_groq_client()

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

    try:
        import requests as req_lib
        import re

        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY_TABLETS}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": VISION_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.1,
            "max_tokens": 1200,
        }

        print(f"Sending OCR text to {VISION_MODEL} ({len(ocr_text)} chars)")
        resp = req_lib.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=60.0)
        if resp.status_code != 200:
            print(f"Groq API returned {resp.status_code}: {resp.text}")
            resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        print(f"Groq response: {content[:500]}")

        # Strip out markdown json blocks if groq returned them
        match = re.search(r'\{[\s\S]*\}', content)
        if match:
            content = match.group(0)

        parsed = json.loads(content)

        doctor = parsed.get("doctor", "")
        notes = parsed.get("notes", "")
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
    except Exception as e:
        print(f"Parsing Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to parse prescription: {str(e)}")

