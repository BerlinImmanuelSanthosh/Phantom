// TODO: Replace this simulated implementation with the real telephony provider.
// Keep the public API (startCall, endCall, onCallStatus) unchanged.
export type CallStatus = "connecting" | "ringing" | "connected" | "ended" | "failed";
type Cb = (s: CallStatus) => void;

const listeners = new Map<string, Set<Cb>>();
const timers = new Map<string, ReturnType<typeof setTimeout>[]>();

function emit(id: string, s: CallStatus) {
  listeners.get(id)?.forEach((cb) => cb(s));
}

export async function startCall(phoneNumber: string): Promise<{ callId: string }> {
  const callId = `mock-${Date.now()}-${phoneNumber.replace(/\D/g, "").slice(-4)}`;
  listeners.set(callId, new Set());
  timers.set(callId, [
    setTimeout(() => emit(callId, "connecting"), 50),
    setTimeout(() => emit(callId, "ringing"), 1200),
    setTimeout(() => emit(callId, "connected"), 3800),
  ]);
  return { callId };
}

export function endCall(callId: string) {
  timers.get(callId)?.forEach(clearTimeout);
  emit(callId, "ended");
  setTimeout(() => listeners.delete(callId), 0);
}

export function onCallStatus(callId: string, callback: Cb) {
  listeners.get(callId)?.add(callback);
  return () => listeners.get(callId)?.delete(callback);
}
