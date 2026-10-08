import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Mic, MicOff, PhoneOff, Volume2, VolumeX, Phone, Ambulance, User } from "lucide-react";
import { toast } from "sonner";
import { endCall, onCallStatus, startCall, type CallStatus } from "@/lib/callService";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

type Ctx = { call: (name: string, phone: string) => void; openSheet: () => void; sos: () => void };
const CallCtx = createContext<Ctx>({ call: () => {}, openSheet: () => {}, sos: () => {} });
export const useCall = () => useContext(CallCtx);

const label: Record<CallStatus, string> = { connecting: "Connecting…", ringing: "Ringing…", connected: "Connected", ended: "Call ended", failed: "Call failed" };

export function CallProvider({ children }: { children: ReactNode }) {
  const { data: p } = useProfile();
  const callerName = p?.full_name ?? undefined;
  const [active, setActive] = useState<{ name: string; phone: string; id?: string } | null>(null);
  const [status, setStatus] = useState<CallStatus>("connecting");
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [sheet, setSheet] = useState(false);
  const unsub = useRef<(() => void) | undefined>(undefined);

  const call = useCallback(async (name: string, phone: string) => {
    setSheet(false);
    setActive({ name, phone });
    setStatus("connecting");
    setSecs(0);
    setMuted(false);
    try {
      const { callId } = await startCall(phone, { callerName });
      unsub.current = onCallStatus(callId, (s) => {
        setStatus(s);
        if (s === "ended" || s === "failed") setTimeout(() => setActive(null), 1200);
      });
      setActive({ name, phone, id: callId });
    } catch {
      setStatus("failed");
      setTimeout(() => setActive(null), 1500);
    }
  }, [callerName]);

  useEffect(() => {
    if (status !== "connected") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const hangup = () => {
    if (active?.id) endCall(active.id);
    else setActive(null);
    unsub.current?.();
  };

  const sos = useCallback(async () => {
    const c = p?.emergency_contacts?.[0];
    const target = c ? { name: c.name, phone: c.phone } : { name: "Ambulance", phone: p?.hospital_number || "108" };
    await supabase.from("notifications").insert({ kind: "sos", title: "SOS alert sent", body: `Alert sent to ${target.name} (${target.phone})` });
    toast.error(`SOS: alerting ${target.name}`);
    call(target.name, target.phone);
  }, [p, call]);

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <CallCtx.Provider value={{ call, openSheet: () => setSheet(true), sos }}>
      {children}
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl">
          <SheetHeader><SheetTitle>Call for help</SheetTitle></SheetHeader>
          <div className="space-y-2 p-4">
            {(p?.emergency_contacts ?? []).map((c) => (
              <motion.button key={c.phone} whileTap={{ scale: 0.97 }} onClick={() => call(c.name, c.phone)} className="flex w-full items-center gap-3 rounded-2xl border border-cyan/30 bg-glass p-4 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary"><User size={20} /></span>
                <span className="flex-1"><span className="block font-semibold">{c.name}</span><span className="text-sm text-muted-foreground">{c.relation} · {c.phone}</span></span>
                <Phone size={20} />
              </motion.button>
            ))}
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => call("Hospital / Ambulance", p?.hospital_number || "108")} className="pulse-glow flex w-full items-center gap-3 rounded-2xl bg-primary p-4 text-left text-primary-foreground">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background"><Ambulance size={20} /></span>
              <span className="flex-1 font-semibold">Call Hospital / Ambulance</span>
              <span className="text-sm">{p?.hospital_number || "108"}</span>
            </motion.button>
          </div>
        </SheetContent>
      </Sheet>

      <AnimatePresence>
        {active && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-primary px-6 py-16 text-primary-foreground" role="dialog" aria-label="Call in progress">
            <div className="text-center">
              <p className="text-sm uppercase tracking-widest opacity-80">{label[status]}</p>
              <h2 className="mt-2 text-3xl font-bold">{active.name}</h2>
              <p className="opacity-80">{active.phone}</p>
              {status === "connected" && <p className="mt-3 font-display text-2xl tabular-nums">{mm}:{ss}</p>}
            </div>
            <div className="relative flex h-56 w-56 items-center justify-center">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="absolute inset-0 rounded-full border-2 border-cyan" animate={status === "connected" ? { scale: 1, opacity: 0.4 } : { scale: [0.6, 1.4], opacity: [0.8, 0] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }} />
              ))}
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-background glow-cyan"><User size={48} /></div>
            </div>
            <div className="flex items-center gap-6">
              <CallBtn label={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)} active={muted}>{muted ? <MicOff size={24} /> : <Mic size={24} />}</CallBtn>
              <motion.button whileTap={{ scale: 0.92 }} onClick={hangup} aria-label="End call" className="flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-lift"><PhoneOff size={30} /></motion.button>
              <CallBtn label={speaker ? "Speaker off" : "Speaker"} onClick={() => setSpeaker(!speaker)} active={speaker}>{speaker ? <Volume2 size={24} /> : <VolumeX size={24} />}</CallBtn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </CallCtx.Provider>
  );
}

function CallBtn({ children, label, onClick, active }: { children: ReactNode; label: string; onClick: () => void; active: boolean }) {
  return (
    <motion.button whileTap={{ scale: 0.92 }} onClick={onClick} aria-label={label} aria-pressed={active} className={`flex h-14 w-14 items-center justify-center rounded-full ${active ? "bg-cyan" : "bg-background/90"}`}>
      {children}
    </motion.button>
  );
}

export function SosButton() {
  const { sos } = useCall();
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = () => {
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      sos();
    }, 2000);
  };
  const stop = () => {
    setHolding(false);
    clearTimeout(timer.current);
  };
  return (
    <motion.button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !holding && start()}
      onKeyUp={stop}
      whileTap={{ scale: 0.95 }}
      aria-label="SOS — hold for 2 seconds to call your emergency contact"
      className="pulse-glow relative flex h-14 w-14 select-none items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground shadow-lift"
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56">
        <motion.circle cx="28" cy="28" r="25" fill="none" stroke="var(--icon)" strokeWidth="4" strokeLinecap="round" initial={false} animate={{ pathLength: holding ? 1 : 0 }} transition={{ duration: holding ? 2 : 0.2, ease: "linear" }} />
      </svg>
      SOS
    </motion.button>
  );
}
