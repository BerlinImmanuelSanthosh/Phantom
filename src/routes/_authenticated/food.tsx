import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Camera, ChefHat, Clock, Flame, Plus, Send, Sparkles, Upload, X, ArrowLeft, ArrowRight, Maximize2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { detectIngredients, generateRecipes, type Recipe } from "@/lib/ai.functions";
import { fileToPayload, streamChat } from "@/lib/files";
import { GhostButton, GlassCard, PrimaryButton, Skeleton, inputCls } from "@/components/phantom/ui";
import { useProfile } from "@/hooks/useProfile";
import { stagger, ease } from "@/lib/motion";

export const Route = createFileRoute("/_authenticated/food")({
  head: () => ({
    meta: [
      { title: "Food Maker — Phantom" },
      { name: "description", content: "Turn your fridge into recipes that fit your health goal." },
      { property: "og:title", content: "Food Maker — Phantom" },
      { property: "og:description", content: "Turn your fridge into recipes that fit your health goal." },
    ],
  }),
  component: Food,
});

function Food() {
  const { data: p } = useProfile();
  const detect = useServerFn(detectIngredients);
  const gen = useServerFn(generateRecipes);
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [open, setOpen] = useState<Recipe | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  async function onFile(f?: File) {
    if (!f || !f.type.startsWith("image/")) return f && toast.error("Please choose a photo");
    setDetecting(true);
    try {
      const payload = await fileToPayload(f);
      setPreview(payload.dataUrl);
      const found = await detect({ data: payload });
      if (!found.length) toast("No ingredients spotted — add them manually.");
      setItems((s) => Array.from(new Set([...s, ...found])));
    } catch {
      toast.error("Couldn't read that photo");
    }
    setDetecting(false);
  }

  async function makeRecipes(request = "") {
    if (!items.length) return toast.error("Add at least one ingredient");
    setLoadingRecipes(true);
    try {
      setRecipes(await gen({ data: { ingredients: items, request } }));
    } catch (e) {
      toast.error((e as Error).message || "Couldn't create recipes");
    }
    setLoadingRecipes(false);
  }

  function addItem() {
    const v = newItem.trim().toLowerCase();
    if (v && !items.includes(v)) setItems([...items, v]);
    setNewItem("");
  }

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Food Maker</h1>
        <p className="text-sm text-muted-foreground">Goal: {p?.goal} weight · {p?.diet} {p?.allergies?.length ? `· avoids ${p.allergies.join(", ")}` : ""}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <GlassCard hover={false}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
            className={`relative flex min-h-48 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${drag ? "border-cyan bg-secondary" : "border-cyan/40"}`}
          >
            {preview && <img src={preview} alt="Your fridge" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
            <div className="relative">
              {detecting ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} className="mx-auto h-10 w-10 rounded-full border-4 border-cyan border-t-transparent" />
              ) : <ChefHat size={40} className="mx-auto" />}
              <p className="mt-3 font-semibold">{detecting ? "Spotting ingredients…" : "Drop a photo of your fridge or ingredients"}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <GhostButton onClick={() => fileRef.current?.click()} disabled={detecting}><Upload size={18} /> Upload</GhostButton>
                <GhostButton onClick={() => camRef.current?.click()} disabled={detecting}><Camera size={18} /> Camera</GhostButton>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold">Ingredients ({items.length})</p>
            <div className="flex flex-wrap gap-2">
              <AnimatePresence>
                {items.map((it, i) => (
                  <motion.span key={it} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.04 } }} exit={{ opacity: 0, scale: 0.6 }} className="flex items-center gap-1 rounded-full border border-cyan/50 bg-secondary py-1 pl-3 pr-1.5 text-sm font-medium">
                    {it}
                    <button onClick={() => setItems(items.filter((x) => x !== it))} aria-label={`Remove ${it}`} className="rounded-full p-0.5 hover:bg-background"><X size={14} /></button>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addItem(); }} className="mt-3 flex gap-2">
              <input className={inputCls} value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an ingredient" aria-label="Add ingredient" />
              <GhostButton type="submit" aria-label="Add"><Plus size={18} /></GhostButton>
            </form>
            <PrimaryButton onClick={() => makeRecipes()} disabled={loadingRecipes || !items.length} className="pulse-glow mt-4 w-full"><Sparkles size={18} /> {loadingRecipes ? "Cooking up ideas…" : "Generate recipes"}</PrimaryButton>
          </div>
        </GlassCard>

        <FoodChat items={items} onUpdate={(req) => makeRecipes(req)} busy={loadingRecipes} />
      </div>

      {loadingRecipes ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : recipes.length > 0 && (
        <motion.div variants={stagger} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {recipes.map((r) => (
            <GlassCard key={r.name} className="cursor-pointer">
              <button onClick={() => setOpen(r)} className="w-full text-left">
                <div className="flex h-24 items-center justify-center rounded-xl bg-secondary text-5xl">{r.emoji}</div>
                <h3 className="mt-3 font-bold leading-tight">{r.name}</h3>
                <p className="mt-1 flex gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock size={14} />{r.prep_minutes} min</span><span className="flex items-center gap-1"><Flame size={14} />{r.calories} kcal</span></p>
                <Macros r={r} />
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.why}</p>
              </button>
            </GlassCard>
          ))}
        </motion.div>
      )}

      <AnimatePresence>{open && <RecipeDetail r={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </motion.div>
  );
}

function Macros({ r }: { r: Recipe }) {
  const max = Math.max(r.protein, r.carbs, r.fat, 1);
  return (
    <div className="mt-3 space-y-1.5">
      {([["Protein", r.protein], ["Carbs", r.carbs], ["Fat", r.fat]] as const).map(([l, v]) => (
        <div key={l} className="flex items-center gap-2 text-xs">
          <span className="w-12 text-muted-foreground">{l}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-phantom" initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }} transition={{ duration: 0.8, ease }} /></div>
          <span className="w-8 text-right font-medium">{v}g</span>
        </div>
      ))}
    </div>
  );
}

function RecipeDetail({ r, onClose }: { r: Recipe; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [cooking, setCooking] = useState(false);
  const [logged, setLogged] = useState(false);
  async function log() {
    const { error } = await supabase.from("meals").insert({ name: r.name, calories: Math.round(r.calories) });
    if (error) return toast.error(error.message);
    setLogged(true);
    qc.invalidateQueries({ queryKey: ["meals-today"] });
    toast.success(`Logged ${r.calories} kcal`);
  }
  const stepper = (
    <div>
      <div className="mb-3 flex gap-1">{r.steps.map((_, i) => <motion.span key={i} className="h-1.5 flex-1 rounded-full" animate={{ backgroundColor: i <= step ? "var(--cyan)" : "var(--muted)" }} />)}</div>
      <AnimatePresence mode="wait">
        <motion.p key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, ease }} className={cooking ? "min-h-40 font-display text-3xl font-semibold leading-snug md:text-4xl" : "min-h-16"}>
          <span className="text-muted-foreground">Step {step + 1}/{r.steps.length} · </span>{r.steps[step]}
        </motion.p>
      </AnimatePresence>
      <div className="mt-4 flex justify-between">
        <GhostButton onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}><ArrowLeft size={18} /> Back</GhostButton>
        <PrimaryButton onClick={() => setStep(Math.min(r.steps.length - 1, step + 1))} disabled={step === r.steps.length - 1}>Next <ArrowRight size={18} /></PrimaryButton>
      </div>
    </div>
  );
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end justify-center bg-primary/30 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.35, ease }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={r.name} className={`relative w-full overflow-y-auto bg-background p-6 shadow-lift ${cooking ? "h-full max-w-none sm:rounded-none" : "max-h-[90vh] max-w-2xl rounded-t-3xl sm:rounded-3xl"}`}>
        <button onClick={cooking ? () => setCooking(false) : onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-2 hover:bg-muted"><X size={20} /></button>
        {cooking ? (
          <div className="mx-auto flex h-full max-w-3xl flex-col justify-center"><h2 className="mb-6 text-2xl font-bold">{r.emoji} {r.name}</h2>{stepper}</div>
        ) : (
          <>
            <div className="flex items-center gap-4"><span className="text-5xl">{r.emoji}</span><div><h2 className="text-2xl font-bold">{r.name}</h2><p className="text-sm text-muted-foreground">{r.prep_minutes} min · {r.calories} kcal</p></div></div>
            <p className="mt-3 rounded-xl bg-secondary p-3 text-sm">{r.why}</p>
            <Macros r={r} />
            <h3 className="mt-5 font-bold">Ingredients</h3>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{r.ingredients.map((i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" />{i}</li>)}</ul>
            <h3 className="mb-2 mt-5 font-bold">Method</h3>
            {stepper}
            <div className="mt-6 flex flex-wrap gap-2">
              <GhostButton onClick={() => setCooking(true)}><Maximize2 size={18} /> Cooking mode</GhostButton>
              <PrimaryButton onClick={log} disabled={logged} className="pulse-glow">{logged ? <><Check size={18} /> Logged</> : <><Flame size={18} /> Log this meal</>}</PrimaryButton>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function FoodChat({ items, onUpdate, busy }: { items: string[]; onUpdate: (req: string) => void; busy: boolean }) {
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = input.trim();
    if (!t || streaming) return;
    setInput("");
    const next = [...msgs, { role: "user" as const, content: t }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setStreaming(true);
    if (items.length) onUpdate(t);
    try {
      await streamChat({ mode: "food", ingredients: items, messages: next.slice(-12) }, (txt) => setMsgs([...next, { role: "assistant", content: txt }]));
    } catch (err) {
      toast.error((err as Error).message);
      setMsgs(next);
    }
    setStreaming(false);
  }
  return (
    <GlassCard hover={false} className="flex max-h-[34rem] min-h-80 flex-col">
      <h2 className="flex items-center gap-2 font-bold"><Sparkles size={18} /> Food chat</h2>
      <p className="text-xs text-muted-foreground">Try "make something low calorie" or "I want to gain weight" — recipes update too.</p>
      <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={m.role === "user" ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground" : "prose prose-sm max-w-none text-sm [&_*]:text-foreground"}>
            {m.role === "user" ? m.content : m.content ? <ReactMarkdown>{m.content}</ReactMarkdown> : (
              <span className="flex gap-1 py-2">{[0, 1, 2].map((j) => <motion.span key={j} className="h-2 w-2 rounded-full bg-primary" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: j * 0.12 }} />)}</span>
            )}
          </motion.div>
        ))}
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input className={inputCls} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the kitchen…" aria-label="Food chat message" />
        <PrimaryButton type="submit" disabled={streaming || busy || !input.trim()} aria-label="Send" className="px-4"><Send size={18} /></PrimaryButton>
      </form>
    </GlassCard>
  );
}
