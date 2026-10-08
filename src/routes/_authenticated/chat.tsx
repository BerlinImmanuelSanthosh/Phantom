import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Mic, MicOff, Paperclip, Phone, Send, Siren, FileText, Check, Trash2, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo, PrimaryButton, GhostButton } from "@/components/phantom/ui";
import { useCall } from "@/components/phantom/CallProvider";
import { useProfile } from "@/hooks/useProfile";
import { scanPrescription, type Prescription } from "@/lib/ai.functions";
import { EMERGENCY_RE, fileToPayload, streamChat } from "@/lib/files";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat — Phantom" },
      { name: "description", content: "Talk to Phantom, your AI health assistant." },
      { property: "og:title", content: "Chat — Phantom" },
      { property: "og:description", content: "Talk to Phantom, your AI health assistant." },
    ],
  }),
  component: Chat,
});

type Msg = { id: string; role: "user" | "assistant"; content: string; kind?: "rx" | "emergency"; rx?: Prescription };
const CHIPS = ["Explain my BP", "Diet plan for me", "Side effects of my tablets?", "How's my sugar?"];

function Chat() {
  const qc = useQueryClient();
  const { openSheet } = useCall();
  const { data: p } = useProfile();
  const scan = useServerFn(scanPrescription);
  const [input, setInput] = useState("");
  const [local, setLocal] = useState<Msg[]>([]);
  const [busy, setBusy] = useState<"idle" | "typing" | "streaming" | "scanning">("idle");
  const [voiceAgent, setVoiceAgent] = useState<{ active: boolean; mode: "sos" | "pharmacy"; roomUrl?: string | null }>({ active: false, mode: "sos" });
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const history = useQuery({
    queryKey: ["chat"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_messages").select("id,role,content").order("created_at").limit(200);
      if (error) throw error;
      return data as Msg[];
    },
  });

  const msgs = [...(history.data ?? []), ...local];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, local.at(-1)?.content, busy]);
  useEffect(() => inputRef.current?.focus(), [busy]);

  const [streamingId, setStreamingId] = useState<string | null>(null);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy !== "idle") return;
    setInput("");
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: t };
    const extra: Msg[] = EMERGENCY_RE.test(t) ? [{ id: crypto.randomUUID(), role: "assistant", content: "", kind: "emergency" }] : [];
    setLocal((l) => [...l, userMsg, ...extra]);
    setBusy("typing");
    const { error: e1 } = await supabase.from("chat_messages").insert({ role: "user", content: t });
    if (e1) console.error(e1);
    let saved = !e1; // offline: keep the messages on screen when they could not be saved
    const convo = [...(history.data ?? []), ...local.filter((m) => !m.kind), userMsg].slice(-30).map((m) => ({ role: m.role, content: m.content }));
    const aid = crypto.randomUUID();
    try {
      const full = await streamChat({ mode: "health", messages: convo }, (txt) => {
        setBusy("streaming");
        setStreamingId(aid);
        setLocal((l) => (l.some((m) => m.id === aid) ? l.map((m) => (m.id === aid ? { ...m, content: txt } : m)) : [...l, { id: aid, role: "assistant", content: txt }]));
      });
      if (full.trim()) {
        const { error: e2 } = await supabase.from("chat_messages").insert({ role: "assistant", content: full });
        if (e2) {
          console.error(e2);
          saved = false;
        }
      }
      if (saved) {
        await qc.invalidateQueries({ queryKey: ["chat"] });
        setLocal((l) => l.filter((m) => m.kind));
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
    setStreamingId(null);
    setBusy("idle");
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 10_000_000) return toast.error("File is too large (max 10 MB)");
    setBusy("scanning");
    setLocal((l) => [...l, { id: crypto.randomUUID(), role: "user", content: `📎 ${f.name}` }]);
    try {
      const rx = await scan({ data: await fileToPayload(f) });
      setLocal((l) => [...l, { id: crypto.randomUUID(), role: "assistant", content: "", kind: "rx", rx }]);
    } catch {
      toast.error("Couldn't read that prescription");
    }
    setBusy("idle");
  }

  async function clearChat() {
    await supabase.from("chat_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setLocal([]);
    qc.invalidateQueries({ queryKey: ["chat"] });
  }

  function handleCallClick() {
    const lastText = input || local.at(-1)?.content || history.data?.at(-1)?.content || "";
    const txt = lastText.toLowerCase();
    const mode = (txt.includes("get a medicin") || txt.includes("tablet") || txt.includes("order")) ? "pharmacy" : "sos";
    setVoiceAgent({ active: true, mode, roomUrl: null });
    
    fetch("/api/chat/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode })
    })
    .then(r => r.json())
    .then(d => {
       if (d.room_url && d.room_url !== "mock_room_url") {
           setVoiceAgent({ active: true, mode, roomUrl: d.room_url });
       } else {
           toast.info("Add DAILY_API_KEY to config to enable live audio.");
       }
    })
    .catch(console.error);
  }

  return (
    <div className="glass flex h-[calc(100dvh-11rem)] flex-col overflow-hidden p-0 md:h-[calc(100dvh-7rem)]">
      <AnimatePresence>
        {voiceAgent.active && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-primary px-6 py-16 text-primary-foreground">
             <h2 className="text-3xl font-bold mb-4">Speaking to AI...</h2>
             <p className="text-xl opacity-80 mb-8">{voiceAgent.mode === "pharmacy" ? "Ordering Tablets from Pharmacy" : "Emergency SOS Call"}</p>
             <div className="pulse-glow rounded-full p-8 bg-secondary/20 mb-12">
               <Mic size={48} />
             </div>
             {voiceAgent.roomUrl ? <p className="text-sm font-mono opacity-60 mb-6">Connected: {new URL(voiceAgent.roomUrl).pathname}</p> : <p className="text-sm opacity-60 mb-6">Audio transport connecting...</p>}
             <motion.button whileTap={{ scale: 0.9 }} onClick={() => setVoiceAgent({ active: false, mode: "sos", roomUrl: null })} className="rounded-full bg-destructive p-4">
               <PhoneOff size={32} color="white" />
             </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="flex items-center gap-3 border-b border-cyan/20 px-4 py-3">
        <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 3, repeat: Infinity }}><Logo size={36} /></motion.div>
        <div className="flex-1"><h1 className="text-lg font-bold">Phantom</h1><p className="text-xs text-muted-foreground">Knows your profile, vitals and tablets</p></div>
        <button onClick={clearChat} aria-label="Clear chat" className="rounded-full p-2 hover:bg-muted"><Trash2 size={18} /></button>
        <motion.button whileTap={{ scale: 0.92 }} onClick={handleCallClick} aria-label="Call Voice Agent" className="pulse-glow flex h-11 w-11 items-center justify-center rounded-full bg-primary"><Phone size={20} /></motion.button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && !history.isLoading && (
          <div className="py-10 text-center">
            <Logo size={56} />
            <p className="mt-3 font-display text-xl font-semibold">Hi {p?.full_name?.split(" ")[0]}, how are you feeling?</p>
            <p className="text-sm text-muted-foreground">Ask anything, or attach a prescription to add your tablets.</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {msgs.map((m) => (
            <motion.div key={m.id} layout initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 28 }} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              {m.kind === "emergency" ? <EmergencyCard onCall={handleCallClick} /> : m.kind === "rx" && m.rx ? <RxCard rx={m.rx} /> : m.role === "user" ? (
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground">{m.content}</div>
              ) : m.id === streamingId ? (
                /* ── Live streaming bubble ── renders plain text so ReactMarkdown
                   doesn't re-parse the whole tree on every token. A blinking cursor
                   shows the reply is still being typed. */
                <div className="prose prose-sm max-w-[85%] text-foreground [&_*]:text-foreground">
                  <span className="whitespace-pre-wrap">{m.content}</span>
                  <motion.span
                    aria-hidden
                    className="ml-0.5 inline-block h-[1em] w-0.5 rounded-sm bg-primary align-middle"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
              ) : (
                <div className="prose prose-sm max-w-[85%] text-foreground [&_*]:text-foreground"><ReactMarkdown>{m.content}</ReactMarkdown></div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {(busy === "typing" || busy === "scanning") && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex gap-1 rounded-2xl bg-secondary px-4 py-3">
              {[0, 1, 2].map((i) => <motion.span key={i} className="h-2 w-2 rounded-full bg-primary" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }} />)}
            </span>
            {busy === "scanning" && "Reading prescription…"}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-cyan/20 p-3">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {CHIPS.map((c) => <motion.button key={c} whileTap={{ scale: 0.95 }} onClick={() => send(c)} className="shrink-0 rounded-full border border-cyan/40 bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-accent">{c}</motion.button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach prescription" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"><Paperclip size={20} /></button>
          <VoiceButton onText={(t) => setInput((s) => (s ? s + " " : "") + t)} />
          <textarea ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder="Message Phantom…" aria-label="Message" className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-indigo/15 bg-background px-4 py-2.5 outline-none focus:border-cyan focus:ring-4 focus:ring-cyan/25" />
          <PrimaryButton type="submit" disabled={busy !== "idle" || !input.trim()} aria-label="Send" className="h-11 w-11 shrink-0 rounded-full p-0"><Send size={18} /></PrimaryButton>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Phantom is not a substitute for a doctor. For serious symptoms, see a professional.</p>
      </div>
    </div>
  );
}

function EmergencyCard({ onCall }: { onCall: () => void }) {
  return (
    <div className="max-w-sm rounded-2xl border-2 border-destructive/60 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 font-bold text-destructive"><Siren size={20} /> Emergency detected — call now?</p>
      <p className="mt-1 text-sm">If this is serious, don't wait. Call your emergency contact or an ambulance.</p>
      <PrimaryButton onClick={onCall} className="pulse-glow mt-3 w-full"><Phone size={18} /> Call now</PrimaryButton>
    </div>
  );
}

function RxCard({ rx }: { rx: Prescription }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [saved, setSaved] = useState(false);
  async function saveAll() {
    const rows = rx.medicines.map((m) => {
      const end = m.duration_days ? new Date(Date.now() + m.duration_days * 86400000).toISOString().slice(0, 10) : null;
      const times = m.times?.length ? m.times : ["09:00"];
      return { name: m.name, dosage: m.dosage, specific_times: times, times_per_day: times.length, meal_relation: m.meal_relation || "after", end_date: end, notes: m.notes, source: "prescription", total_stock: m.duration_days ? m.duration_days * times.length : 30 };
    });
    const { error } = await supabase.from("medicines").insert(rows);
    if (error) return toast.error(error.message);
    setSaved(true);
    qc.invalidateQueries({ queryKey: ["medicines"] });
    toast.success(`${rows.length} tablets saved`, { action: { label: "View", onClick: () => nav({ to: "/tablets" }) } });
  }
  if (!rx.medicines.length) return <div className="rounded-2xl bg-secondary px-4 py-3 text-sm">{rx.notes || "I couldn't find any medicines in that file. Try a clearer photo."}</div>;
  return (
    <div className="w-full max-w-md rounded-2xl border border-cyan/40 bg-background p-4 shadow-soft">
      <p className="flex items-center gap-2 font-bold"><FileText size={18} /> Prescription{rx.doctor && ` · ${rx.doctor}`}</p>
      <ul className="mt-3 space-y-2">
        {rx.medicines.map((m, i) => (
          <li key={i} className="rounded-xl bg-secondary p-3 text-sm">
            <span className="font-semibold">{m.name}</span> {m.dosage}
            <span className="block text-xs text-muted-foreground">{m.frequency} · {m.times?.join(", ")} · {m.meal_relation} food{m.duration_days ? ` · ${m.duration_days} days` : ""}</span>
          </li>
        ))}
      </ul>
      {rx.notes && <p className="mt-2 text-xs text-muted-foreground">Doctor notes: {rx.notes}</p>}
      {saved ? <GhostButton disabled className="mt-3 w-full"><Check size={18} /> Saved to My Tablets</GhostButton> : <PrimaryButton onClick={saveAll} className="mt-3 w-full">Save all to My Tablets</PrimaryButton>}
    </div>
  );
}

type SR = { start: () => void; stop: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; interimResults: boolean; lang: string };

function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const rec = useRef<SR | null>(null);
  function toggle() {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return toast.error("Voice input isn't supported in this browser");
    if (on) return rec.current?.stop();
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0]!.transcript).join(" "));
    r.onend = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  }
  return (
    <button type="button" onClick={toggle} aria-label={on ? "Stop voice input" : "Voice input"} aria-pressed={on} className={`flex h-11 shrink-0 items-center justify-center gap-0.5 rounded-full px-3 ${on ? "bg-secondary" : "hover:bg-muted"}`}>
      {on ? (
        <>
          {[0, 1, 2, 3, 4].map((i) => <motion.span key={i} className="w-1 rounded-full bg-primary" animate={{ height: [6, 18, 6] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.1 }} />)}
          <MicOff size={18} className="ml-1" />
        </>
      ) : <Mic size={20} />}
    </button>
  );
}
