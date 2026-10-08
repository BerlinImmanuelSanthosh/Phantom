import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Camera, ChefHat, Clock, Flame, Plus, Send, Sparkles, Upload, X, ArrowLeft, ArrowRight, Maximize2, Check, Search, Filter, Utensils, Globe, BookOpen, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { detectIngredients, generateRecipes, fetchIndianFoods, type Recipe, type IndianFoodItem } from "@/lib/ai.functions";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const [cameraActive, setCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [detectedStatus, setDetectedStatus] = useState<{ detected: boolean; count: number } | null>(null);
  const [liveScanning, setLiveScanning] = useState(false);
  const [liveFridgeDetected, setLiveFridgeDetected] = useState(false);
  const [liveFoundIngredients, setLiveFoundIngredients] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [open, setOpen] = useState<Recipe | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cameraActive && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive, stream]);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  function parseDetection(res: any): { isFridge: boolean; ingredients: string[] } {
    if (typeof res === "object" && res !== null && "is_fridge_or_food" in res) {
      return {
        isFridge: Boolean(res.is_fridge_or_food),
        ingredients: Array.isArray(res.ingredients) ? res.ingredients : [],
      };
    }
    if (Array.isArray(res)) {
      return {
        isFridge: res.length > 0,
        ingredients: res,
      };
    }
    return { isFridge: false, ingredients: [] };
  }

  useEffect(() => {
    if (!cameraActive) {
      setLiveFridgeDetected(false);
      setLiveFoundIngredients([]);
      return;
    }

    let active = true;
    const runLiveScan = async () => {
      if (!videoRef.current || !active) return;
      const video = videoRef.current;
      if (video.readyState < 2) return;
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setLiveScanning(true);
      try {
        let isFridge = false;
        let ingredients: string[] = [];

        // Try Python backend first (has real Groq vision)
        let backendOk = false;
        for (const base of ["http://127.0.0.1:8000", "http://localhost:8000"]) {
          try {
            const res = await fetch(`${base}/api/foodmaker/detect-ingredients`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data_url: dataUrl }),
            });
            if (res.ok) {
              const json = await res.json();
              ({ isFridge, ingredients } = parseDetection(json));
              backendOk = true;
              break;
            }
          } catch {}
        }

        // Fallback: TanStack server fn
        if (!backendOk) {
          const rawRes = await detect({ data: { dataUrl, mediaType: "image/jpeg" } });
          ({ isFridge, ingredients } = parseDetection(rawRes));
        }

        if (active) {
          setLiveFridgeDetected(isFridge);
          if (isFridge && ingredients.length) {
            setLiveFoundIngredients((prev) => Array.from(new Set([...prev, ...ingredients])));
            setItems((s) => Array.from(new Set([...s, ...ingredients])));
          }
        }
      } catch {}
      if (active) setLiveScanning(false);
    };

    const timer = setTimeout(runLiveScan, 600);
    const interval = setInterval(runLiveScan, 3500);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [cameraActive]);

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setStream(s);
      setCameraActive(true);
      setLiveFridgeDetected(false);
    } catch {
      camRef.current?.click();
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setCameraActive(false);
  }

  async function captureFromCamera() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    stopCamera();
    setDetecting(true);
    setDetectedStatus(null);
    try {
      let result: { isFridge: boolean; ingredients: string[] } | null = null;

      // Try Python backend first (has real Groq vision)
      for (const base of ["http://127.0.0.1:8000", "http://localhost:8000"]) {
        try {
          const res = await fetch(`${base}/api/foodmaker/detect-ingredients`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data_url: dataUrl }),
          });
          if (res.ok) {
            const json = await res.json();
            result = parseDetection(json);
            break;
          }
        } catch {}
      }

      // Fallback: TanStack server fn
      if (!result) {
        const rawRes = await detect({ data: { dataUrl, mediaType: "image/jpeg" } });
        result = parseDetection(rawRes);
      }

      const { isFridge, ingredients } = result;
      if (isFridge) {
        setDetectedStatus({ detected: true, count: ingredients.length });
        if (!ingredients.length) {
          toast("Fridge detected, but no distinct ingredients spotted — add them manually.");
        } else {
          toast.success(`Fridge detected! Automatically added ${ingredients.length} ingredients.`);
          setItems((s) => Array.from(new Set([...s, ...ingredients])));
        }
      } else {
        setDetectedStatus({ detected: false, count: 0 });
        toast.error("No fridge or food items spotted in photo.");
      }
    } catch {
      toast.error("Couldn't analyze fridge snapshot");
      setDetectedStatus({ detected: false, count: 0 });
    }
    setDetecting(false);
    setPreview(null);
  }

  async function onFile(f?: File) {
    if (!f || !f.type.startsWith("image/")) return f && toast.error("Please choose a photo");
    setDetecting(true);
    setDetectedStatus(null);
    try {
      const payload = await fileToPayload(f);
      setPreview(payload.dataUrl);
      let result: { isFridge: boolean; ingredients: string[] } | null = null;

      // Try Python backend first (has real Groq vision)
      for (const base of ["http://127.0.0.1:8000", "http://localhost:8000"]) {
        try {
          const res = await fetch(`${base}/api/foodmaker/detect-ingredients`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data_url: payload.dataUrl }),
          });
          if (res.ok) {
            const json = await res.json();
            result = parseDetection(json);
            break;
          }
        } catch {}
      }

      // Fallback: TanStack server fn
      if (!result) {
        const rawRes = await detect({ data: payload });
        result = parseDetection(rawRes);
      }

      const { isFridge, ingredients } = result;
      if (isFridge) {
        setDetectedStatus({ detected: true, count: ingredients.length });
        if (!ingredients.length) {
          toast("Fridge detected, but no distinct ingredients spotted — add them manually.");
        } else {
          toast.success(`Fridge detected! Automatically added ${ingredients.length} ingredients.`);
          setItems((s) => Array.from(new Set([...s, ...ingredients])));
        }
      } else {
        setDetectedStatus({ detected: false, count: 0 });
        toast.error("No fridge or food items spotted in photo.");
      }
    } catch {
      toast.error("Couldn't read that photo");
      setDetectedStatus({ detected: false, count: 0 });
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

  function addIngredientsFromDish(dishIngredients: string[]) {
    const newItems = dishIngredients.map((i) => i.toLowerCase().trim()).filter(Boolean);
    setItems((s) => Array.from(new Set([...s, ...newItems])));
    toast.success(`Added ${newItems.length} ingredients from dish to your fridge list!`);
  }

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Food Maker</h1>
        <p className="text-sm text-muted-foreground">Goal: {p?.goal} weight · {p?.diet} {p?.allergies?.length ? `· avoids ${p.allergies.join(", ")}` : ""}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <GlassCard hover={false} className="flex h-[36rem] flex-col justify-between overflow-hidden">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
            className={`relative flex min-h-44 flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-4 text-center transition-colors ${drag ? "border-cyan bg-secondary" : "border-cyan/40"}`}
          >
            {cameraActive ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-between bg-black p-3">
                <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1.5">
                  {liveFridgeDetected ? (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-1.5 rounded-full border border-emerald-500/60 bg-emerald-500/30 px-3.5 py-1 text-xs font-bold text-emerald-300 backdrop-blur-md shadow">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <Check size={14} className="text-emerald-400" /> Fridge Detected
                    </motion.div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-full border border-cyan/60 bg-cyan/20 px-3 py-1 text-xs font-medium text-cyan backdrop-blur-md animate-pulse">
                      <Sparkles size={12} /> Point camera at fridge…
                    </div>
                  )}
                  {liveScanning && (
                    <div className="flex items-center gap-1 rounded-full border border-cyan/60 bg-cyan/20 px-2.5 py-1 text-[11px] font-medium text-cyan backdrop-blur-md animate-pulse">
                      Analyzing frame…
                    </div>
                  )}
                </div>

                {liveFoundIngredients.length > 0 && (
                  <div className="absolute right-3 top-3 z-20 flex max-w-[50%] flex-wrap justify-end gap-1">
                    {liveFoundIngredients.slice(-4).map((ing) => (
                      <motion.span key={ing} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                        +{ing}
                      </motion.span>
                    ))}
                  </div>
                )}

                <div className={`pointer-events-none absolute inset-6 z-10 rounded-xl border-2 border-dashed flex items-center justify-center ${liveFridgeDetected ? "border-emerald-500/50" : "border-cyan/40"}`}>
                  <p className={`text-[11px] font-semibold px-3 py-1 rounded-full backdrop-blur-sm border ${liveFridgeDetected ? "text-emerald-300 bg-black/60 border-emerald-500/30" : "text-cyan/80 bg-black/50 border-cyan/20"}`}>
                    {liveFridgeDetected
                      ? liveFoundIngredients.length
                        ? `${liveFoundIngredients.length} ingredients detected`
                        : "Fridge detected — identifying ingredients…"
                      : "Scanning… Point at your fridge"}
                  </p>
                </div>

                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full rounded-xl object-cover" />
                <div className="absolute bottom-4 z-20 flex gap-2">
                  <PrimaryButton onClick={captureFromCamera} type="button" className="px-4 py-1.5 text-xs shadow-lg">
                    <Camera size={16} /> Snap & Detect
                  </PrimaryButton>
                  <GhostButton onClick={stopCamera} type="button" className="bg-black/70 px-3 py-1.5 text-xs text-white hover:bg-black/90">
                    <X size={16} /> Close
                  </GhostButton>
                </div>
              </div>
            ) : (
              <>
                {preview && <img src={preview} alt="Your fridge" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
                <div className="relative z-10">
                  {detecting ? (
                    <div className="space-y-2">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} className="mx-auto h-10 w-10 rounded-full border-4 border-cyan border-t-transparent" />
                      <p className="text-sm font-semibold text-cyan animate-pulse">Detecting fridge & ingredients…</p>
                    </div>
                  ) : (
                    <>
                      <ChefHat size={38} className="mx-auto text-cyan" />
                      <p className="mt-2 text-sm font-semibold">Drop a photo of your fridge or ingredients</p>
                      
                      {detectedStatus?.detected && (
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-sm">
                          <Check size={14} className="text-emerald-400" /> Fridge Detected ({detectedStatus.count} ingredients added)
                        </motion.div>
                      )}

                      <div className="mt-3 flex flex-wrap justify-center gap-2">
                        <GhostButton onClick={() => fileRef.current?.click()} disabled={detecting}><Upload size={16} /> Upload</GhostButton>
                        <GhostButton onClick={startCamera} disabled={detecting}><Camera size={16} /> Camera</GhostButton>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold">Ingredients ({items.length})</p>
            <div className="max-h-20 flex-wrap gap-1.5 overflow-y-auto pr-1 flex">
              <AnimatePresence>
                {items.map((it, i) => (
                  <motion.span key={it} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.04 } }} exit={{ opacity: 0, scale: 0.6 }} className="flex items-center gap-1 rounded-full border border-cyan/50 bg-secondary py-0.5 pl-2.5 pr-1 text-xs font-medium">
                    {it}
                    <button onClick={() => setItems(items.filter((x) => x !== it))} aria-label={`Remove ${it}`} className="rounded-full p-0.5 hover:bg-background"><X size={12} /></button>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addItem(); }} className="mt-2 flex gap-2">
              <input className={inputCls} value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an ingredient" aria-label="Add ingredient" />
              <GhostButton type="submit" aria-label="Add"><Plus size={18} /></GhostButton>
            </form>
            <PrimaryButton onClick={() => makeRecipes()} disabled={loadingRecipes || !items.length} className="pulse-glow mt-3 w-full"><Sparkles size={18} /> {loadingRecipes ? "Cooking up ideas…" : "Generate recipes"}</PrimaryButton>
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

      {/* Authentic Indian Food Explorer Section */}
      <IndianFoodExplorer
        activeIngredients={items}
        onAddIngredients={addIngredientsFromDish}
        onSelectDish={(dish) => setOpen(indianFoodToRecipe(dish))}
      />

      <AnimatePresence>
        {open && <RecipeDetail r={open} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}

function indianFoodToRecipe(food: IndianFoodItem): Recipe {
  const isSweet = food.flavor_profile.includes("sweet") || food.course.includes("dessert");
  const isStarter = food.course.includes("starter") || food.course.includes("snack");
  const emoji = isSweet ? "🍨" : isStarter ? "🫓" : "🍛";

  const steps = [
    `Gather and prepare ingredients: ${food.ingredients.join(", ")}.`,
    `Heat oil or ghee in a pan and temper spices to release rich, authentic ${food.flavor_profile} aromas.`,
    `Add ${food.ingredients.slice(0, 3).join(", ")} and sauté over medium heat for ${food.prep_time} minutes.`,
    `Simmer gently for ${food.cook_time} minutes until thoroughly cooked and aromatic.`,
    `Serve fresh and hot as a traditional ${food.diet} ${food.course} originating from ${food.state}, ${food.region} India.`,
  ];

  let protein = 0;
  let carbs = 0;
  let fat = 0;
  
  if (isSweet) {
    carbs += 30; fat += 10; protein += 4;
  } else if (isStarter) {
    carbs += 20; fat += 12; protein += 6;
  } else {
    carbs += 40; fat += 15; protein += 12;
  }

  const ings = food.ingredients.map(i => i.toLowerCase());
  for (const ing of ings) {
    if (ing.includes("chicken") || ing.includes("mutton") || ing.includes("fish") || ing.includes("meat")) {
      protein += 20; fat += 5;
    } else if (ing.includes("paneer") || ing.includes("cheese")) {
      protein += 10; fat += 12;
    } else if (ing.includes("dal") || ing.includes("lentil") || ing.includes("chickpea") || ing.includes("gram") || ing.includes("besan") || ing.includes("urad")) {
      protein += 8; carbs += 15;
    } else if (ing.includes("rice") || ing.includes("flour") || ing.includes("wheat") || ing.includes("potato") || ing.includes("maida")) {
      carbs += 25;
    } else if (ing.includes("sugar") || ing.includes("jaggery") || ing.includes("syrup") || ing.includes("honey")) {
      carbs += 20;
    } else if (ing.includes("ghee") || ing.includes("butter") || ing.includes("oil") || ing.includes("cream")) {
      fat += 10;
    } else if (ing.includes("nuts") || ing.includes("almond") || ing.includes("cashew") || ing.includes("coconut") || ing.includes("pistachio")) {
      fat += 8; protein += 3;
    } else if (ing.includes("milk") || ing.includes("yogurt") || ing.includes("curd") || ing.includes("khoa") || ing.includes("khoya") || ing.includes("mawa")) {
      protein += 5; carbs += 5; fat += 4;
    }
  }

  const variance = food.name.length % 5;
  protein += variance;
  carbs += (variance * 2);
  fat += variance;

  const calories = Math.round((protein * 4) + (carbs * 4) + (fat * 9));

  return {
    name: food.name,
    emoji,
    prep_minutes: food.prep_time + food.cook_time,
    calories,
    protein,
    carbs,
    fat,
    why: `Authentic ${food.diet} ${food.course} from ${food.state} (${food.region} India) with a signature ${food.flavor_profile} flavor profile.`,
    ingredients: food.ingredients,
    steps,
  };
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

  // Lock body scroll when this modal is open
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);
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
  const modalContent = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md" onClick={onClose}>
      <motion.div initial={{ y: 20, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.95 }} transition={{ duration: 0.25, ease }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={r.name} className={`relative w-full overflow-y-auto bg-background p-6 shadow-lift border border-border ${cooking ? "h-full max-w-none sm:rounded-none" : "max-h-[85vh] max-w-2xl rounded-3xl"}`}>
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

  if (typeof document === "undefined") return null;
  return createPortal(modalContent, document.body);
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
      await streamChat(
        { mode: "food", ingredients: items, messages: next.slice(-12) },
        (txt) => setMsgs((prev) => [...prev.slice(0, -1), { role: "assistant", content: txt }])
      );
    } catch (err) {
      toast.error((err as Error).message);
      setMsgs(next);
    }
    setStreaming(false);
  }
  const isMarkdown = (text: string) => /[|#*`\n]/.test(text) && text.length > 60;

  /** Convert GFM pipe-table rows → bold key: value pairs (react-markdown v10 has no built-in GFM table support) */
  function formatAiReply(text: string): string {
    return text
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        // Skip separator rows like |---|---|
        if (/^\|[\s\-|:]+\|$/.test(trimmed)) return "";
        // Convert pipe-table data rows: | A | B | C | D | → **A:** B · **C:** D
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
          const cells = trimmed
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean);
          // Pair up cells as key: value
          const pairs: string[] = [];
          for (let ci = 0; ci < cells.length; ci += 2) {
            const key = cells[ci];
            const val = cells[ci + 1] ?? "";
            if (key) pairs.push(val ? `**${key}:** ${val}` : `**${key}**`);
          }
          return pairs.join(" · ");
        }
        return line;
      })
      .filter((l, idx, arr) => !(l === "" && arr[idx - 1] === ""))  // collapse double blank lines
      .join("\n");
  }

  return (
    <GlassCard hover={false} className="flex h-[36rem] flex-col overflow-hidden">
      <h2 className="flex items-center gap-2 font-bold"><Sparkles size={18} /> Food chat</h2>
      <p className="text-xs text-muted-foreground">Try "make something low calorie" or "I want to gain weight" — recipes update too.</p>
      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            {m.role === "user" ? (
              <div className={`break-words rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground ${isMarkdown(m.content) ? "w-full max-w-[92%] prose prose-sm prose-invert [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_td]:border [&_td]:border-primary-foreground/30 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-primary-foreground/30 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-primary-foreground/10 [&_*]:text-primary-foreground [&_*]:my-0" : "max-w-[80%]"}`}>
                {isMarkdown(m.content) ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
              </div>
            ) : (
              <div className="w-full max-w-[94%] break-words rounded-2xl rounded-bl-sm bg-secondary/60 px-4 py-3 text-sm border border-border/40">
                {m.content ? (
                  <div className="prose prose-sm max-w-none [&_*]:text-foreground [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:font-semibold">
                    <ReactMarkdown>{formatAiReply(m.content)}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="flex gap-1 py-1">{[0, 1, 2].map((j) => <motion.span key={j} className="h-2 w-2 rounded-full bg-primary" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: j * 0.12 }} />)}</span>
                )}
              </div>
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

function IndianFoodExplorer({
  activeIngredients,
  onAddIngredients,
  onSelectDish,
}: {
  activeIngredients: string[];
  onAddIngredients: (ings: string[]) => void;
  onSelectDish: (dish: IndianFoodItem) => void;
}) {
  const getFoods = useServerFn(fetchIndianFoods);
  const [foods, setFoods] = useState<IndianFoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [diet, setDiet] = useState("all");
  const [course, setCourse] = useState("all");
  const [region, setRegion] = useState("all");
  const [flavor, setFlavor] = useState("all");
  const [matchingMode, setMatchingMode] = useState(false);

  async function loadData(currentSearch = search) {
    setLoading(true);
    try {
      const res = await getFoods({
        data: {
          search: currentSearch.trim() || undefined,
          diet: diet !== "all" ? diet : undefined,
          course: course !== "all" ? course : undefined,
          region: region !== "all" ? region : undefined,
          flavor: flavor !== "all" ? flavor : undefined,
          ingredients: activeIngredients.length ? activeIngredients : undefined,
        },
      });
      setFoods(res || []);
    } catch {
      toast.error("Failed to load Indian dishes");
    }
    setLoading(false);
  }

  // Automatically load on mount, search change, or when fridge ingredients update
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData(search);
    }, 100);
    return () => clearTimeout(timer);
  }, [search, diet, course, region, flavor, activeIngredients]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadData(search);
  }

  function clearSearch() {
    setSearch("");
    loadData("");
  }

  const hasExactMatches = foods.some((f) => (f.match_score ?? 0) > 0);
  const showNotFoundIndicator = activeIngredients.length > 0 && !hasExactMatches && !search;

  return (
    <section className="mt-8 space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-indigo">
            <Utensils className="text-indigo" size={22} /> Authentic Indian Recipe Vault
          </h2>
          <p className="text-xs text-muted-foreground">
            Explore 250+ authentic Indian dishes automatically loaded from backend/indian_food.csv ({foods.length} items showing)
          </p>
        </div>

        {activeIngredients.length > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-indigo/40 bg-indigo/10 px-3 py-1 text-xs font-semibold text-indigo">
            <Sparkles size={14} /> Matching Fridge ({activeIngredients.length} ingredients)
          </div>
        )}
      </div>

      <GlassCard hover={false} className="space-y-4 p-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-muted-foreground" size={16} />
            <input
              className={`${inputCls} pl-9 pr-9`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Live search Indian dishes or ingredients (e.g. Biryani, Paneer, Cashews)..."
            />
            {search && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-2.5 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Clear search & reset"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <PrimaryButton type="submit" className="px-5">
            Search
          </PrimaryButton>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 font-semibold text-muted-foreground">
            <Filter size={14} /> Filter:
          </span>

          <select
            value={diet}
            onChange={(e) => setDiet(e.target.value)}
            className="rounded-lg border border-border/50 bg-secondary/80 px-2.5 py-1 font-medium text-foreground outline-none focus:border-cyan"
          >
            <option value="all">All Diets</option>
            <option value="vegetarian">Vegetarian</option>
            <option value="non vegetarian">Non Vegetarian</option>
          </select>

          <select
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            className="rounded-lg border border-border/50 bg-secondary/80 px-2.5 py-1 font-medium text-foreground outline-none focus:border-cyan"
          >
            <option value="all">All Courses</option>
            <option value="main course">Main Course</option>
            <option value="dessert">Dessert</option>
            <option value="starter">Starter</option>
            <option value="snack">Snack</option>
          </select>

          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-border/50 bg-secondary/80 px-2.5 py-1 font-medium text-foreground outline-none focus:border-cyan"
          >
            <option value="all">All Regions</option>
            <option value="North">North</option>
            <option value="South">South</option>
            <option value="East">East</option>
            <option value="West">West</option>
            <option value="North East">North East</option>
          </select>

          <select
            value={flavor}
            onChange={(e) => setFlavor(e.target.value)}
            className="rounded-lg border border-border/50 bg-secondary/80 px-2.5 py-1 font-medium text-foreground outline-none focus:border-cyan"
          >
            <option value="all">All Flavors</option>
            <option value="spicy">Spicy</option>
            <option value="sweet">Sweet</option>
            <option value="savory">Savory</option>
            <option value="bitter">Bitter</option>
            <option value="sour">Sour</option>
          </select>

          {(search || diet !== "all" || course !== "all" || region !== "all" || flavor !== "all") && (
            <button
              onClick={() => {
                setSearch("");
                setDiet("all");
                setCourse("all");
                setRegion("all");
                setFlavor("all");
              }}
              className="text-cyan underline underline-offset-2"
            >
              Reset Filters
            </button>
          )}
        </div>
      </GlassCard>

      {/* Dish Not Found Indicator Banner when no exact ingredient matches exist */}
      {showNotFoundIndicator && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-bold text-sm text-foreground">
                Dish Not Found for fridge ingredients: <span className="text-cyan font-mono">{activeIngredients.join(", ")}</span>
              </p>
              <p className="text-muted-foreground">
                No dish in the Indian Food Vault strictly contains these exact ingredients. Showing similar & popular authentic Indian recipes below that you can explore or try!
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : foods.length === 0 ? (
        <GlassCard hover={false} className="py-12 text-center">
          <BookOpen size={36} className="mx-auto text-muted-foreground opacity-50" />
          <p className="mt-2 font-medium">No matching Indian dishes found.</p>
          <p className="text-xs text-muted-foreground">Try clearing your filters or search terms.</p>
        </GlassCard>
      ) : (
        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {foods.map((food, i) => (
            <div
              key={food.name + i}
              onClick={() => onSelectDish(food)}
              className="glass p-5 group relative flex h-full cursor-pointer flex-col justify-between transition-all hover:-translate-y-1 hover:border-cyan/50 hover:shadow-lift rounded-2xl"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        food.diet === "vegetarian" ? "bg-emerald-500" : "bg-red-500"
                      }`}
                      title={food.diet}
                    />
                    <h3 className="font-bold text-foreground group-hover:text-indigo transition-colors">
                      {food.name}
                    </h3>
                  </div>
                  {food.match_score ? (
                    <span className="rounded-full bg-indigo/20 px-2 py-0.5 text-[10px] font-bold text-indigo">
                      {food.match_score}% Match
                    </span>
                  ) : (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                      {food.course}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Globe size={12} /> {food.state} ({food.region})
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {food.prep_time + food.cook_time}m
                  </span>
                  <span className="capitalize text-indigo/90 font-medium">
                    {food.flavor_profile}
                  </span>
                </div>

                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Ingredients: </span>
                  {food.ingredients.join(", ")}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                <span className="text-xs font-semibold text-indigo group-hover:underline flex items-center gap-1">
                  View Cooking Steps <ArrowRight size={12} />
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddIngredients(food.ingredients);
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-indigo hover:underline z-10"
                >
                  <Plus size={14} /> Add to Fridge
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </section>
  );
}


