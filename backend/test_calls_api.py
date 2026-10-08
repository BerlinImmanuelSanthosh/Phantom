"""Tests for backend/calls_api.py. Twilio is mocked, so no real call is ever placed.

Run from the backend folder:  python -m pytest test_calls_api.py -q
"""
import json
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import calls_api

SID = "AC" + "a" * 32
TOKEN = "super-secret-token-value"
FROM = "+17372508034"
CALL_SID = "CA" + "b" * 32


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", SID)
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", TOKEN)
    monkeypatch.setenv("TWILIO_PHONE_NUMBER", FROM)
    monkeypatch.delenv("TWILIO_DEFAULT_COUNTRY_CODE", raising=False)
    calls_api._recent_starts.clear()


@pytest.fixture
def twilio(monkeypatch):
    """Replace Twilio with a fake. `fake.handler` can be reassigned per test; `fake.seen` records requests."""

    class Fake:
        def __init__(self):
            self.seen = []
            self.handler = lambda request: httpx.Response(201, json={"sid": CALL_SID, "status": "queued"})

    fake = Fake()

    def respond(request: httpx.Request) -> httpx.Response:
        fake.seen.append(request)
        return fake.handler(request)

    monkeypatch.setattr(calls_api, "_http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(respond)))
    return fake


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(calls_api.router, prefix="/api")
    return TestClient(app)


def form(request: httpx.Request) -> dict:
    return {k: v[0] for k, v in parse_qs(request.content.decode()).items()}


# ---------- phone number handling ----------


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("+917810927270", "+917810927270"),
        ("7810927270", "+917810927270"),
        ("07810927270", "+917810927270"),
        ("78109 27270", "+917810927270"),
        ("(781) 092-7270", "+917810927270"),
        ("917810927270", "+917810927270"),
        ("0091 7810927270", "+917810927270"),
        ("+1 737 250 8034", "+17372508034"),
    ],
)
def test_to_e164_accepts_common_formats(raw, expected):
    assert calls_api.to_e164(raw) == expected


def test_default_country_code_is_configurable(monkeypatch):
    monkeypatch.setenv("TWILIO_DEFAULT_COUNTRY_CODE", "+1")
    assert calls_api.to_e164("7372508034") == "+17372508034"


@pytest.mark.parametrize("raw", ["108", "112", "abc", "+", "", "98x76", "+1234", "+" + "9" * 16])
def test_to_e164_rejects_bad_numbers(raw):
    with pytest.raises(calls_api.HTTPException) as err:
        calls_api.to_e164(raw)
    assert err.value.status_code == 400


# ---------- spoken message ----------


def test_twiml_escapes_the_user_typed_name():
    xml = calls_api.build_twiml('</Say><Dial>+1999</Dial><Say>&')
    assert "<Dial>" not in xml
    assert "&lt;/Say&gt;" in xml and "&amp;" in xml
    assert xml.startswith("<Response>") and xml.endswith("</Response>")


def test_twiml_defaults_when_no_name_and_truncates_long_names():
    assert "A Phantom user has asked for urgent help" in calls_api.build_twiml(None)
    assert "x" * 61 not in calls_api.build_twiml("x" * 200)


# ---------- start ----------


def test_start_places_a_call_with_the_right_twilio_request(client, twilio):
    res = client.post("/api/calls/start", json={"to": "7810927270", "caller_name": "Keshoare"})
    assert res.status_code == 200
    assert res.json() == {"call_id": CALL_SID, "status": "connecting"}

    (sent,) = twilio.seen
    assert sent.method == "POST"
    assert str(sent.url) == f"https://api.twilio.com/2010-04-01/Accounts/{SID}/Calls.json"
    body = form(sent)
    assert body["To"] == "+917810927270"
    assert body["From"] == FROM
    assert "Keshoare has asked for urgent help" in body["Twiml"]
    assert body["Timeout"] == "30"
    # Basic auth with the SID/token, built server-side
    assert sent.headers["authorization"].startswith("Basic ")


def test_start_response_never_contains_credentials(client, twilio):
    res = client.post("/api/calls/start", json={"to": "7810927270"})
    assert TOKEN not in res.text and SID not in res.text


def test_start_without_twilio_config_says_what_to_add(client, twilio, monkeypatch):
    monkeypatch.delenv("TWILIO_AUTH_TOKEN")
    res = client.post("/api/calls/start", json={"to": "7810927270"})
    assert res.status_code == 503
    assert "backend/.env" in res.json()["detail"]
    assert twilio.seen == []


def test_placeholder_credentials_count_as_not_configured(client, twilio, monkeypatch):
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "your_twilio_auth_token")
    assert client.post("/api/calls/start", json={"to": "7810927270"}).status_code == 503


def test_trial_account_unverified_number_gets_a_clear_message(client, twilio):
    twilio.handler = lambda r: httpx.Response(400, json={"code": 21608, "message": "unverified"})
    res = client.post("/api/calls/start", json={"to": "7810927270"})
    assert res.status_code == 502
    assert "verified" in res.json()["detail"].lower() and "trial" in res.json()["detail"].lower()


def test_twilio_down_is_reported_not_crashed(client, monkeypatch):
    def boom(request):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(calls_api, "_http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(boom)))
    res = client.post("/api/calls/start", json={"to": "7810927270"})
    assert res.status_code == 502 and "Could not reach Twilio" in res.json()["detail"]


def test_cannot_call_the_twilio_number_itself(client, twilio):
    assert client.post("/api/calls/start", json={"to": FROM}).status_code == 400


def test_invalid_number_is_rejected_before_calling_twilio(client, twilio):
    assert client.post("/api/calls/start", json={"to": "108"}).status_code == 400
    assert twilio.seen == []


def test_start_is_rate_limited(client, twilio):
    codes = [client.post("/api/calls/start", json={"to": "7810927270"}).status_code for _ in range(calls_api.RATE_LIMIT_CALLS + 1)]
    assert codes[:-1] == [200] * calls_api.RATE_LIMIT_CALLS
    assert codes[-1] == 429


# ---------- status ----------


@pytest.mark.parametrize(
    "twilio_status,expected",
    [
        ("queued", "connecting"),
        ("ringing", "ringing"),
        ("in-progress", "connected"),
        ("completed", "ended"),
        ("canceled", "ended"),
        ("busy", "failed"),
        ("no-answer", "failed"),
        ("failed", "failed"),
    ],
)
def test_status_is_mapped_to_the_call_screen_states(client, twilio, twilio_status, expected):
    twilio.handler = lambda r: httpx.Response(200, json={"sid": CALL_SID, "status": twilio_status})
    res = client.get(f"/api/calls/{CALL_SID}")
    assert res.status_code == 200
    assert res.json()["status"] == expected


def test_status_rejects_malformed_call_ids(client, twilio):
    assert client.get("/api/calls/not-a-sid").status_code == 400
    assert twilio.seen == []


def test_status_check_endpoint_reports_config_only(client):
    res = client.get("/api/calls/status")
    assert res.json() == {"mode": "calls", "twilio_configured": True}
    assert TOKEN not in res.text


def test_status_check_endpoint_when_unconfigured(client, monkeypatch):
    monkeypatch.delenv("TWILIO_ACCOUNT_SID")
    assert client.get("/api/calls/status").json()["twilio_configured"] is False


# ---------- end ----------


@pytest.mark.parametrize("current,sent", [("ringing", "canceled"), ("queued", "canceled"), ("in-progress", "completed")])
def test_end_cancels_unanswered_and_completes_answered_calls(client, twilio, current, sent):
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json={"status": current})
        return httpx.Response(200, json={"status": sent})

    twilio.handler = handler
    res = client.post(f"/api/calls/{CALL_SID}/end")
    assert res.status_code == 200 and res.json()["status"] == "ended"
    assert form(twilio.seen[-1]) == {"Status": sent}


def test_end_on_an_already_finished_call_is_a_quiet_success(client, twilio):
    twilio.handler = lambda r: httpx.Response(200, json={"status": "completed"})
    assert client.post(f"/api/calls/{CALL_SID}/end").json()["status"] == "ended"
    assert [r.method for r in twilio.seen] == ["GET"]  # no update sent
