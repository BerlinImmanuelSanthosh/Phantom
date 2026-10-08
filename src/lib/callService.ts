// Telephony provider: places real calls through the Phantom backend (backend/calls_api.py -> Twilio Voice).
// The browser never sees Twilio credentials; they live only in backend/.env.
// Public API (startCall, endCall, onCallStatus) is unchanged so CallProvider didn't need redesigning.
import { toast } from "sonner";

export type CallStatus = "connecting" | "ringing" | "connected" | "ended" | "failed";
type Cb = (s: CallStatus) => void;

const BACKENDS = ["http://127.0.0.1:8000", "http://localhost:8000"];
const POLL_MS = 2000;
const MAX_POLL_FAILURES = 5;

const listeners = new Map<string, Set<Cb>>();
const last = new Map<string, CallStatus>();
const pollers = new Map<string, ReturnType<typeof setInterval>>();

function emit(id: string, s: CallStatus) {
  listeners.get(id)?.forEach((cb) => cb(s));
}

async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  for (const base of BACKENDS) {
    try {
      return await fetch(`${base}${path}`, init);
    } catch {
      // try the next local address
    }
  }
  throw new Error("Can't reach the Phantom backend. Start it with: uvicorn main:app --reload --port 8000");
}

async function errorDetail(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
  return typeof body?.detail === "string" ? body.detail : `The call couldn't be placed (error ${res.status}).`;
}

function finish(id: string) {
  const timer = pollers.get(id);
  if (timer) clearInterval(timer);
  pollers.delete(id);
  // Keep the entry briefly so a late subscriber still sees the final state.
  setTimeout(() => {
    listeners.delete(id);
    last.delete(id);
  }, 5000);
}

function update(id: string, s: CallStatus) {
  if (last.get(id) === s) return;
  last.set(id, s);
  emit(id, s);
  if (s === "ended" || s === "failed") finish(id);
}

function startPolling(id: string) {
  let failures = 0;
  let inFlight = false;
  pollers.set(
    id,
    setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await backendFetch(`/api/calls/${id}`);
        if (!res.ok) throw new Error(String(res.status));
        const { status } = (await res.json()) as { status: CallStatus };
        failures = 0;
        update(id, status);
      } catch {
        if (++failures >= MAX_POLL_FAILURES) update(id, "failed");
      } finally {
        inFlight = false;
      }
    }, POLL_MS),
  );
}

export async function startCall(phoneNumber: string, opts: { callerName?: string | undefined } = {}): Promise<{ callId: string }> {
  try {
    const res = await backendFetch("/api/calls/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phoneNumber, caller_name: opts.callerName ?? null }),
    });
    if (!res.ok) throw new Error(await errorDetail(res));
    const { call_id } = (await res.json()) as { call_id: string };
    listeners.set(call_id, new Set());
    last.set(call_id, "connecting");
    startPolling(call_id);
    return { callId: call_id };
  } catch (e) {
    // The call screen only says "Call failed", so say why.
    toast.error(e instanceof Error ? e.message : "Couldn't place the call");
    throw e;
  }
}

export function endCall(callId: string) {
  update(callId, "ended");
  backendFetch(`/api/calls/${callId}/end`, { method: "POST" }).catch((e) => console.warn("[callService] end call failed", e));
}

export function onCallStatus(callId: string, callback: Cb) {
  listeners.get(callId)?.add(callback);
  const current = last.get(callId);
  if (current && current !== "connecting") queueMicrotask(() => callback(current));
  return () => listeners.get(callId)?.delete(callback);
}
