import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Droplet, HeartPulse, MessageCircle, Pill, Plus, RefreshCw, Scale, ScanLine, Siren, Sparkles, User, Flame } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMedicines, useProfile } from "@/hooks/useProfile";
import { CountUp, GlassCard, GhostButton, PrimaryButton, Ring, Skeleton, StatusChip, inputCls, Field } from "@/components/phantom/ui";
import { bmi, bmiCategory, bpStatus, calorieTarget, fallbackInsight, healthScore, sugarStatus } from "@/lib/health";
import { generateInsight } from "@/lib/insight.functions";
import { useCall } from "@/components/phantom/CallProvider";
import { stagger } from "@/lib/motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Phantom" },
      { name: "description", content: "Your health score, vitals, AI insight and today's snapshot." },
      { property: "og:title", content: "Dashboard — Phantom" },
      { property: "og:description", content: "Your health score, vitals, AI insight and today's snapshot." },
    ],
  }),
  component: Dashboard,
});

function useVitals() {
  return useQuery({
    queryKey: ["vitals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vitals").select("*").order("recorded_at").limit(60);
      if (error) throw error;
      return data;
    },
  });
}
function useMealsToday() {
  return useQuery({
    queryKey: ["meals-today"],
    queryFn: async () => {
      const s = new Date();
      s.setHours(0, 0, 0, 0);
      const { data } = await supabase.from("meals").select("calories").gte("eaten_at", s.toISOString());
      return (data ?? []).reduce((a, m) => a + m.calories, 0);
    },
  });
}

function Dashboard() {
  const qc = useQueryClient();
  const { data: p } = useProfile();
  const vitals = useVitals();
  const meds = useMedicines();
  const kcal = useMealsToday();
  const gen = useServerFn(generateInsight);
  const [refreshing, setRefreshing] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  if (!p) return null;

  const latest = vitals.data?.at(-1);
  const weight = Number(latest?.weight_kg ?? p.weight_kg);
  const sugar = Number(latest?.sugar ?? p.sugar_fasting);
  const sys = Number(latest?.bp_systolic ?? p.bp_systolic);
  const dia = Number(latest?.bp_diastolic ?? p.bp_diastolic);
  const cur = { ...p, weight_kg: weight, sugar_fasting: sugar, bp_systolic: sys, bp_diastolic: dia };
  const b = bmi(p.height_cm, weight);
  const cat = bmiCategory(b);
  const score = healthScore(cur);
  const insight = p.insight ?? fallbackInsight(cur);
  const target = insight.daily_calories || calorieTarget(cur);
  const today = new Date().toISOString().slice(0, 10);
  const water = p.water_date === today ? p.water_ml ?? 0 : 0;

  const nowHM = new Date().toTimeString().slice(0, 5);
  const upcoming = (meds.data ?? []).flatMap((m) => (m.specific_times ?? []).map((t) => ({ t, m }))).sort((a, b) => a.t.localeCompare(b.t));
  const nextDose = upcoming.find((u) => u.t >= nowHM) ?? upcoming[0];

  async function refresh() {
    setRefreshing(true);
    try {
      await gen();
      await qc.invalidateQueries({ queryKey: ["profile"] });
    } catch {
      toast.error("Couldn't refresh the insight right now");
    }
    setRefreshing(false);
  }
  async function addWater(ml: number) {
    const next = Math.max(0, water + ml);
    const updateCache = (old: any) => (old ? { ...old, water_ml: next, water_date: today } : old);
    qc.setQueryData(["profile", p!.id], updateCache);
    qc.setQueryData(["profile"], updateCache);
    await supabase.from("profiles").update({ water_ml: next, water_date: today }).eq("id", p!.id);
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  const chart = (vitals.data ?? []).map((v) => ({
    d: new Date(v.recorded_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    weight: Number(v.weight_kg),
    sugar: Number(v.sugar),
    sys: v.bp_systolic,
  }));

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5 pb-20">
      <header className="flex items-center gap-4">
        <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 3, repeat: Infinity }} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary glow-cyan">
          <User size={26} />
        </motion.div>
        <div>
          <p className="text-sm text-muted-foreground">{greet}</p>
          <h1 className="text-3xl font-bold">{p.full_name?.split(" ")[0]}</h1>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <GlassCard className="flex flex-col items-center justify-center lg:row-span-2">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Health Score</p>
          <Ring value={score} size={200} stroke={14}>
            <span className="font-display text-5xl font-bold"><CountUp value={score} /></span>
            <span className="text-xs text-muted-foreground">out of 100</span>
          </Ring>
          <p className="mt-4 text-center text-sm text-muted-foreground">From your BMI, blood sugar and blood pressure.</p>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2"><Sparkles size={20} /><h2 className="text-lg font-bold">AI Insight</h2></div>
            <button onClick={refresh} aria-label="Refresh insight" disabled={refreshing}><RefreshCw size={18} className={refreshing ? "animate-spin" : ""} /></button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-primary-foreground">{insight.recommendation} weight</span>
            <span className="font-display text-xl font-semibold">{insight.headline}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-secondary p-3"><p className="text-xs text-muted-foreground">Target range</p><p className="font-display text-xl font-bold">{insight.target_weight_min}–{insight.target_weight_max} kg</p></div>
            <div className="rounded-xl bg-secondary p-3"><p className="text-xs text-muted-foreground">Daily calories</p><p className="font-display text-xl font-bold"><CountUp value={target} /> kcal</p></div>
          </div>
          <ul className="mt-4 space-y-2">
            {insight.tips.map((t, i) => (
              <motion.li key={t} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan" />{t}
              </motion.li>
            ))}
          </ul>
        </GlassCard>

        <div className="grid grid-cols-2 gap-5 lg:col-span-2 lg:grid-cols-3">
          <Stat icon={Scale} label="BMI" value={b} decimals={1} sub={cat.label} status={cat.status} />
          <Stat icon={Droplet} label="Blood sugar" value={sugar} unit="mg/dL" status={sugarStatus(sugar)} />
          <Stat icon={HeartPulse} label="Blood pressure" value={sys} unit={`/${dia}`} status={bpStatus(sys, dia)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <Stat icon={Activity} label="Weight" value={weight} decimals={1} unit="kg" />
        <Stat icon={User} label="Age" value={p.age ?? 0} unit="yrs" />
        <GlassCard>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Pill size={18} /> Next tablet</div>
          {meds.isLoading ? <Skeleton className="mt-3 h-10" /> : nextDose ? (
            <><p className="mt-2 font-display text-xl font-bold">{nextDose.m.name}</p><p className="text-sm text-muted-foreground">{nextDose.t} · {nextDose.m.dosage}</p></>
          ) : <p className="mt-2 text-sm text-muted-foreground">No tablets added</p>}
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Flame size={18} /> Calories</div>
          <p className="mt-2 font-display text-xl font-bold"><CountUp value={kcal.data ?? 0} /> <span className="text-sm font-medium text-muted-foreground">/ {target}</span></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><motion.div className="h-full bg-phantom" initial={{ width: 0 }} animate={{ width: `${Math.min(100, ((kcal.data ?? 0) / target) * 100)}%` }} transition={{ duration: 1 }} /></div>
        </GlassCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold">Trends</h2>
          {vitals.isLoading ? <Skeleton className="h-56" /> : chart.length < 2 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Log your vitals on another day to see your trends here.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {([["weight", "Weight"], ["sugar", "Sugar"], ["sys", "Systolic BP"]] as const).map(([k, l]) => (
                <div key={k}>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{l}</p>
                  <div className="h-36">
                    <ResponsiveContainer>
                      <AreaChart data={chart}>
                        <defs><linearGradient id={`g-${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--cyan)" stopOpacity={0.6} /><stop offset="1" stopColor="var(--cyan)" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid stroke="var(--muted)" vertical={false} />
                        <XAxis dataKey="d" hide />
                        <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", color: "var(--indigo)" }} />
                        <Area type="monotone" dataKey={k} stroke="var(--indigo)" strokeWidth={2} fill={`url(#g-${k})`} animationDuration={1200} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="text-lg font-bold">Water</h2>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-32 w-20 overflow-hidden rounded-b-3xl rounded-t-lg border-2 border-cyan/60 bg-glass">
              <motion.div className="absolute inset-x-0 bottom-0 bg-cyan/60" animate={{ height: `${Math.min(100, (water / 2500) * 100)}%` }} transition={{ duration: 0.3, ease: "easeOut" }}>
                <motion.div className="absolute -top-2 left-0 h-4 w-[200%] rounded-[45%] bg-cyan/60" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} />
              </motion.div>
            </div>
            <div>
              <p className="font-display text-2xl font-bold"><CountUp value={water} duration={0.3} /> ml</p>
              <p className="text-xs text-muted-foreground">Goal 2500 ml</p>
              <div className="mt-3 flex gap-2">
                <GhostButton className="px-3 py-2 text-sm" onClick={() => addWater(250)}>+250</GhostButton>
                <GhostButton className="px-3 py-2 text-sm" onClick={() => addWater(-250)}>−</GhostButton>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard hover={false}>
        <h2 className="mb-3 text-lg font-bold">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Quick to="/chat" icon={MessageCircle} label="Chat" />
          <Quick to="/food" icon={ScanLine} label="Scan fridge" />
          <Quick to="/tablets" icon={Pill} label="Add tablet" />
          <EmergencyQuick />
        </div>
      </GlassCard>

      <motion.button whileTap={{ scale: 0.95 }} onClick={() => setLogOpen(true)} className="pulse-glow fixed bottom-24 right-5 z-20 flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 font-semibold text-primary-foreground shadow-lift md:bottom-8">
        <Plus size={20} /> Log vitals
      </motion.button>
      <LogVitals open={logOpen} onOpenChange={setLogOpen} defaults={{ weight, sugar, sys, dia }} />
    </motion.div>
  );
}

function Stat({ icon: Icon, label, value, unit, sub, status, decimals = 0 }: { icon: typeof Scale; label: string; value: number; unit?: string; sub?: string; status?: "normal" | "watch" | "high"; decimals?: number }) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Icon size={18} /> {label}</span>
        {status && <StatusChip status={status} />}
      </div>
      <p className="mt-3 font-display text-3xl font-bold"><CountUp value={value} decimals={decimals} />{unit && <span className="ml-1 text-base font-medium text-muted-foreground">{unit}</span>}</p>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </GlassCard>
  );
}

function Quick({ to, icon: Icon, label }: { to: "/chat" | "/food" | "/tablets"; icon: typeof Scale; label: string }) {
  return (
    <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}>
      <Link to={to} className="flex flex-col items-center gap-2 rounded-2xl border border-cyan/30 bg-secondary/60 p-4 font-medium">
        <Icon size={24} /> {label}
      </Link>
    </motion.div>
  );
}

function LogVitals({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; defaults: { weight: number; sugar: number; sys: number; dia: number } }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ weight: "", sugar: "", sys: "", dia: "" });
  async function save() {
    const row = {
      weight_kg: +v.weight || defaults.weight,
      sugar: +v.sugar || defaults.sugar,
      bp_systolic: +v.sys || defaults.sys,
      bp_diastolic: +v.dia || defaults.dia,
    };
    const { error } = await supabase.from("vitals").insert(row);
    if (error) return toast.error(error.message);
    toast.success("Vitals logged");
    setV({ weight: "", sugar: "", sys: "", dia: "" });
    qc.invalidateQueries({ queryKey: ["vitals"] });
    onOpenChange(false);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl">
        <SheetHeader><SheetTitle>Log today's vitals</SheetTitle></SheetHeader>
        <div className="grid grid-cols-2 gap-3 p-4">
          <Field label="Weight (kg)"><input className={inputCls} placeholder={String(defaults.weight)} value={v.weight} onChange={(e) => setV({ ...v, weight: e.target.value })} /></Field>
          <Field label="Sugar (mg/dL)"><input className={inputCls} placeholder={String(defaults.sugar)} value={v.sugar} onChange={(e) => setV({ ...v, sugar: e.target.value })} /></Field>
          <Field label="Systolic"><input className={inputCls} placeholder={String(defaults.sys)} value={v.sys} onChange={(e) => setV({ ...v, sys: e.target.value })} /></Field>
          <Field label="Diastolic"><input className={inputCls} placeholder={String(defaults.dia)} value={v.dia} onChange={(e) => setV({ ...v, dia: e.target.value })} /></Field>
          <PrimaryButton className="col-span-2" onClick={save}>Save reading</PrimaryButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EmergencyQuick() {
  const { openSheet } = useCall();
  return (
    <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={openSheet} className="flex flex-col items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 font-medium">
      <Siren size={24} /> Emergency
    </motion.button>
  );
}
