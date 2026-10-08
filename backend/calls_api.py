"""Emergency calling through Twilio Voice.

Credentials live ONLY in backend/.env and are never sent to the browser:
    TWILIO_ACCOUNT_SID           Account SID (starts with AC)
    TWILIO_AUTH_TOKEN            Auth token
    TWILIO_PHONE_NUMBER          Your Twilio "From" number in E.164, e.g. +17372508034
    TWILIO_DEFAULT_COUNTRY_CODE  Optional, default +91. Used for numbers saved without a country code.

The browser only talks to this router; this router talks to Twilio. Twilio rings the
emergency number and reads a short spoken alert (inline TwiML, so no public webhook
URL is needed and it works from localhost).
"""
import logging
import os
import re
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional
from xml.sax.saxutils import escape

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/calls", tags=["Emergency Calls"])
logger = logging.getLogger("phantom.calls")

TWILIO_API = "https://api.twilio.com/2010-04-01"
CALL_SID_RE = re.compile(r"^CA[0-9a-fA-F]{32}$")

# Placing calls costs money, so cap how fast one client can start them.
RATE_LIMIT_CALLS = 6
RATE_LIMIT_WINDOW_SECONDS = 60.0
_recent_starts: Dict[str, Deque[float]] = defaultdict(deque)

# Twilio call status -> the statuses the Phantom call screen already understands.
STATUS_MAP = {
    "queued": "connecting",
    "initiated": "connecting",
    "ringing": "ringing",
    "in-progress": "connected",
    "completed": "ended",
    "canceled": "ended",
    "busy": "failed",
    "failed": "failed",
    "no-answer": "failed",
}
FINISHED = {"completed", "canceled", "busy", "failed", "no-answer"}


class StartCallRequest(BaseModel):
    to: str = Field(min_length=1, max_length=32, description="Emergency contact / hospital number")
    caller_name: Optional[str] = Field(default=None, max_length=80, description="Name read out in the alert")


def _twilio_config():
    sid = (os.getenv("TWILIO_ACCOUNT_SID") or "").strip()
    token = (os.getenv("TWILIO_AUTH_TOKEN") or "").strip()
    from_number = (os.getenv("TWILIO_PHONE_NUMBER") or "").strip()
    if not (sid.startswith("AC") and token and from_number.startswith("+")) or "your_" in token.lower():
        raise HTTPException(
            status_code=503,
            detail=(
                "Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and "
                "TWILIO_PHONE_NUMBER to backend/.env, then restart the backend."
            ),
        )
    return sid, token, from_number


def to_e164(raw: str) -> str:
    """Turn a saved phone number into E.164 (+<country><number>) or raise a 400."""
    cleaned = re.sub(r"[\s().\-]", "", raw or "")
    if cleaned.startswith("00"):
        cleaned = "+" + cleaned[2:]
    if not re.fullmatch(r"\+?\d+", cleaned):
        raise HTTPException(status_code=400, detail="That phone number isn't valid. Use digits only, e.g. +91 98765 43210.")

    if cleaned.startswith("+"):
        digits = cleaned[1:]
    else:
        if len(cleaned) <= 5:
            raise HTTPException(
                status_code=400,
                detail="Twilio can't call short emergency numbers like 108 or 112. Save a full phone number instead.",
            )
        country = re.sub(r"\D", "", os.getenv("TWILIO_DEFAULT_COUNTRY_CODE", "+91")) or "91"
        if len(cleaned) > 10 and cleaned.startswith(country):
            digits = cleaned  # already has the country code, just no "+"
        else:
            digits = country + cleaned.lstrip("0")

    if not 8 <= len(digits) <= 15:
        raise HTTPException(status_code=400, detail="That phone number looks too short or too long to call.")
    return "+" + digits


def build_twiml(caller_name: Optional[str]) -> str:
    """The spoken alert. The name is user-typed, so it is cleaned and XML-escaped."""
    name = re.sub(r"[\x00-\x1f\x7f]", " ", caller_name or "")
    name = re.sub(r"\s+", " ", name).strip()[:60]
    who = name or "A Phantom user"
    message = escape(
        f"This is an automated emergency alert from Phantom. {who} has asked for urgent help. "
        "Please call them back or check on them right away."
    )
    return f'<Response><Say>{message}</Say><Pause length="1"/><Say>{message}</Say></Response>'


def _check_rate_limit(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    recent = _recent_starts[key]
    while recent and now - recent[0] > RATE_LIMIT_WINDOW_SECONDS:
        recent.popleft()
    if len(recent) >= RATE_LIMIT_CALLS:
        raise HTTPException(status_code=429, detail="Too many call attempts. Please wait a minute and try again.")
    recent.append(now)


def _require_sid(call_sid: str) -> None:
    if not CALL_SID_RE.match(call_sid):
        raise HTTPException(status_code=400, detail="Invalid call id.")


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0))


async def _twilio(method: str, path: str, sid: str, token: str, data: Optional[dict] = None) -> httpx.Response:
    try:
        async with _http_client() as client:
            return await client.request(method, f"{TWILIO_API}/Accounts/{sid}{path}", auth=(sid, token), data=data)
    except httpx.HTTPError as exc:
        logger.error("Could not reach Twilio: %s", exc.__class__.__name__)
        raise HTTPException(status_code=502, detail="Could not reach Twilio. Check the internet connection and try again.")


def _twilio_error(resp: httpx.Response) -> HTTPException:
    try:
        body = resp.json()
    except ValueError:
        body = {}
    code = body.get("code")
    message = body.get("message") or "Twilio rejected the call."
    logger.warning("Twilio error %s (HTTP %s): %s", code, resp.status_code, message)
    friendly = {
        20003: "Twilio rejected the credentials. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in backend/.env.",
        21211: "Twilio says that phone number isn't valid.",
        21214: "Twilio says that phone number can't be called.",
        21215: "Calling that country isn't enabled. Turn it on under Twilio Console, Voice, Geo Permissions.",
        21408: "Calling that country isn't enabled. Turn it on under Twilio Console, Voice, Geo Permissions.",
        21608: (
            "This Twilio trial account can only call verified numbers. Verify the number in the Twilio Console "
            "(Verified Caller IDs) or upgrade the account."
        ),
        21210: "TWILIO_PHONE_NUMBER isn't a number on this Twilio account.",
        21212: "TWILIO_PHONE_NUMBER isn't a valid caller number for this Twilio account.",
        21606: "TWILIO_PHONE_NUMBER isn't able to make voice calls.",
    }
    return HTTPException(status_code=502, detail=friendly.get(code, message))


@router.get("/status")
def calls_status():
    """Tells the caller whether Twilio is configured. Never returns any credential."""
    try:
        _twilio_config()
        configured = True
    except HTTPException:
        configured = False
    return {"mode": "calls", "twilio_configured": configured}


@router.post("/start")
async def start_call(req: StartCallRequest, request: Request):
    sid, token, from_number = _twilio_config()
    to = to_e164(req.to)
    if to == from_number:
        raise HTTPException(status_code=400, detail="The emergency number can't be your own Twilio number.")
    _check_rate_limit(request)

    resp = await _twilio(
        "POST",
        "/Calls.json",
        sid,
        token,
        data={"To": to, "From": from_number, "Url": "https://webhooks.twilio.com/v1/Voice/Template/voice_speech_recognition"},
    )
    if resp.status_code >= 400:
        raise _twilio_error(resp)

    body = resp.json()
    call_sid = body.get("sid")
    logger.info("Emergency call %s started to number ending %s", call_sid, to[-4:])
    return {"call_id": call_sid, "status": STATUS_MAP.get(body.get("status", ""), "connecting")}


@router.get("/{call_sid}")
async def call_status(call_sid: str):
    _require_sid(call_sid)
    sid, token, _ = _twilio_config()
    resp = await _twilio("GET", f"/Calls/{call_sid}.json", sid, token)
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Call not found.")
    if resp.status_code >= 400:
        raise _twilio_error(resp)
    raw = resp.json().get("status", "")
    return {"call_id": call_sid, "status": STATUS_MAP.get(raw, "connecting"), "twilio_status": raw}


@router.post("/{call_sid}/end")
async def end_call(call_sid: str):
    _require_sid(call_sid)
    sid, token, _ = _twilio_config()
    current = await _twilio("GET", f"/Calls/{call_sid}.json", sid, token)
    if current.status_code >= 400:
        raise _twilio_error(current)
    raw = current.json().get("status", "")
    if raw in FINISHED:
        return {"call_id": call_sid, "status": "ended"}

    # Twilio cancels calls that haven't been answered yet and completes ones in progress.
    target = "canceled" if raw in ("queued", "initiated", "ringing") else "completed"
    resp = await _twilio("POST", f"/Calls/{call_sid}.json", sid, token, data={"Status": target})
    if resp.status_code >= 400:
        raise _twilio_error(resp)
    return {"call_id": call_sid, "status": "ended"}
