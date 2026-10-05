import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useInvalidateProfile, useProfile } from "@/hooks/useProfile";
import { Field, GhostButton, Logo, MeshBackground, PrimaryButton, inputCls, CountUp } from "@/components/phantom/ui";
import { bmi, bmiCategory } from "@/lib/health";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your profile — Phantom" },
      { name: "description", content: "Tell Phantom about you so every module is personalised." },
      { property: "og:title", content: "Set up your profile — Phantom" },
      { property: "og:description", content: "Tell Phantom about you so every module is personalised." },
    ],
  }),
  component: Onboarding,
});

type Contact = { name: string; phone: string; relation: string };
type Med = { name: string; dosage: string; times: string };
type Form = {
  full_name: string; age: string; gender: string;
  height_cm: string; weight_kg: string;
  sugar_fasting: string; bp_systolic: string; bp_diastolic: string;
  goal: string; diet: string; allergies: string; conditions: string[];
  contacts: Contact[]; hospital_number: string;
  meds: Med[];
};

const num = (min: number, max: number, label: string) =>
  z.coerce.number({ invalid_type_error: `${label} is required` }).min(min, `${label} looks too low`).max(max, `${label} looks too high`);
const phone = z.string().regex(/^[+\d][\d\s-]{5,}$/, "Enter a valid phone number");

const schemas = [
  z.object({ full_name: z.string().trim().min(2, "Enter your name"), age: num(1, 120, "Age"), gender: z.string().min(1, "Choose one") }),
  z.object({ height_cm: num(80, 250, "Height"), weight_kg: num(20, 300, "Weight") }),
  z.object({ sugar_fasting: num(40, 500, "Sugar"), bp_systolic: num(70, 250, "Systolic"), bp_diastolic: num(40, 150, "Diastolic") }),
  z.object({ goal: z.string().min(1, "Choose a goal"), diet: z.string().min(1, "Choose a diet") }),
  z.object({
    contacts: z.array(z.object({ name: z.string().trim().min(1, "Name required"), phone, relation: z.string().trim().min(1, "Relation required") })).min(1).max(3),
    hospital_number: phone,
  }),
  z.object({}),
];

const titles = ["About you", "Your body", "Your vitals", "Your goals", "Emergency contacts", "Current tablets"];
const CONDITIONS = ["Diabetes", "Hypertension", "Thyroid", "Asthma", "PCOS", "Heart condition", "Cholesterol"];

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={onClick} className={cn("relative rounded-full border px-4 py-2 text-sm font-medium transition-colors", active ? "border-cyan bg-secondary glow-cyan" : "border-indigo/15 bg-glass")}>
      {children}
    </motion.button>
  );
}

function Onboarding() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const profile = useProfile();
  const invalidate = useInvalidateProfile();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<Form>({
    full_name: "", age: "", gender: "", height_cm: "", weight_kg: "", sugar_fasting: "", bp_systolic: "", bp_diastolic: "",
    goal: "", diet: "", allergies: "", conditions: [], contacts: [{ name: "", phone: "", relation: "" }], hospital_number: "108", meds: [],
  });

  useEffect(() => {
    if (!loading && !session) nav({ to: "/", replace: true });
    if (profile.data?.onboarding_complete) nav({ to: "/dashboard", replace: true });
    if (profile.data?.full_name && !f.full_name) setF((s) => ({ ...s, full_name: profile.data!.full_name! }));
  }, [loading, session, profile.data, nav, f.full_name]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  function validate() {
    const r = schemas[step].safeParse(f);
    if (r.success) return setErrors({}), true;
    const e: Record<string, string> = {};
    r.error.issues.forEach((i) => (e[i.path.join(".")] ??= i.message));
    setErrors(e);
    return false;
  }
  const next = () => validate() && (setDir(1), step < 5 ? setStep(step + 1) : finish());
  const back = () => (setDir(-1), setStep(Math.max(0, step - 1)));

  async function finish() {
    if (!session) return;
    setSaving(true);
    const uid = session.user.id;
    const { error } = await supabase.from("profiles").upsert({
      id: uid, full_name: f.full_name.trim(), age: +f.age, gender: f.gender,
      height_cm: +f.height_cm, weight_kg: +f.weight_kg, sugar_fasting: +f.sugar_fasting, bp_systolic: +f.bp_systolic, bp_diastolic: +f.bp_diastolic,
      goal: f.goal, diet: f.diet, allergies: f.allergies.split(",").map((a) => a.trim()).filter(Boolean), conditions: f.conditions,
      emergency_contacts: f.contacts, hospital_number: f.hospital_number, onboarding_complete: true,
    });
    if (error) return setSaving(false), toast.error(error.message);
    await supabase.from("vitals").insert({ weight_kg: +f.weight_kg, sugar: +f.sugar_fasting, bp_systolic: +f.bp_systolic, bp_diastolic: +f.bp_diastolic });
    const meds = f.meds.filter((m) => m.name.trim());
    if (meds.length)
      await supabase.from("medicines").insert(
        meds.map((m) => {
          const times = m.times.split(",").map((t) => t.trim()).filter(Boolean);
          return { name: m.name.trim(), dosage: m.dosage, specific_times: times.length ? times : ["09:00"], times_per_day: Math.max(1, times.length), total_stock: 30 };
        }),
      );
    await invalidate();
    nav({ to: "/setup" });
  }

  const b = bmi(+f.height_cm, +f.weight_kg);
  const cat = bmiCategory(b);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <MeshBackground />
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={36} />
          <div className="flex-1">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Step {step + 1} of 6</span>
              <span>{titles[step]}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-phantom" animate={{ width: `${((step + 1) / 6) * 100}%` }} transition={{ duration: 0.5, ease }} />
            </div>
          </div>
        </div>

        <div className="glass relative overflow-hidden p-6 sm:p-8">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 40, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: dir * -40, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease }}
              className="space-y-5"
            >
              <h1 className="text-2xl font-bold">{titles[step]}</h1>

              {step === 0 && (
                <>
                  <Field label="Full name" error={errors.full_name}><input className={inputCls} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Aarav Sharma" /></Field>
                  <Field label="Age" error={errors.age}><input inputMode="numeric" className={inputCls} value={f.age} onChange={(e) => set("age", e.target.value)} placeholder="32" /></Field>
                  <Field label="Gender" error={errors.gender}>
                    <div className="flex flex-wrap gap-2">
                      {["male", "female", "other"].map((g) => <Chip key={g} active={f.gender === g} onClick={() => set("gender", g)}>{g[0].toUpperCase() + g.slice(1)}</Chip>)}
                    </div>
                  </Field>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Height (cm)" error={errors.height_cm}><input inputMode="decimal" className={inputCls} value={f.height_cm} onChange={(e) => set("height_cm", e.target.value)} placeholder="172" /></Field>
                    <Field label="Weight (kg)" error={errors.weight_kg}><input inputMode="decimal" className={inputCls} value={f.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} placeholder="68" /></Field>
                  </div>
                  <motion.div layout className="rounded-2xl border border-cyan/40 bg-secondary p-5 text-center">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Live BMI</p>
                    <p className="mt-1 font-display text-5xl font-bold"><CountUp value={b} decimals={1} /></p>
                    <p className="mt-1 text-sm font-medium">{cat.label}</p>
                    <div className="relative mt-4 h-2 rounded-full bg-muted">
                      <motion.div className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-background bg-primary glow-cyan" animate={{ left: `${Math.min(96, Math.max(0, ((b - 14) / 26) * 100))}%` }} transition={{ type: "spring", stiffness: 120, damping: 18 }} />
                    </div>
                  </motion.div>
                </>
              )}

              {step === 2 && (
                <>
                  <Field label="Fasting blood sugar (mg/dL)" error={errors.sugar_fasting}><input inputMode="decimal" className={inputCls} value={f.sugar_fasting} onChange={(e) => set("sugar_fasting", e.target.value)} placeholder="95" /></Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Systolic (mmHg)" error={errors.bp_systolic}><input inputMode="numeric" className={inputCls} value={f.bp_systolic} onChange={(e) => set("bp_systolic", e.target.value)} placeholder="120" /></Field>
                    <Field label="Diastolic (mmHg)" error={errors.bp_diastolic}><input inputMode="numeric" className={inputCls} value={f.bp_diastolic} onChange={(e) => set("bp_diastolic", e.target.value)} placeholder="80" /></Field>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <Field label="Goal" error={errors.goal}>
                    <div className="flex flex-wrap gap-2">{[["lose", "Lose weight"], ["gain", "Gain weight"], ["maintain", "Maintain"]].map(([v, l]) => <Chip key={v} active={f.goal === v} onClick={() => set("goal", v)}>{l}</Chip>)}</div>
                  </Field>
                  <Field label="Diet preference" error={errors.diet}>
                    <div className="flex flex-wrap gap-2">{[["veg", "Vegetarian"], ["non-veg", "Non-veg"], ["vegan", "Vegan"]].map(([v, l]) => <Chip key={v} active={f.diet === v} onClick={() => set("diet", v)}>{l}</Chip>)}</div>
                  </Field>
                  <Field label="Allergies (comma separated)"><input className={inputCls} value={f.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="Peanuts, shellfish" /></Field>
                  <Field label="Existing conditions (optional)">
                    <div className="flex flex-wrap gap-2">
                      {CONDITIONS.map((c) => <Chip key={c} active={f.conditions.includes(c)} onClick={() => set("conditions", f.conditions.includes(c) ? f.conditions.filter((x) => x !== c) : [...f.conditions, c])}>{c}</Chip>)}
                    </div>
                  </Field>
                </>
              )}

              {step === 4 && (
                <>
                  {f.contacts.map((c, i) => (
                    <motion.div key={i} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl border border-indigo/10 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Contact {i + 1}{i === 0 && " (primary)"}</span>
                        {i > 0 && <button type="button" aria-label="Remove contact" onClick={() => set("contacts", f.contacts.filter((_, j) => j !== i))}><Trash2 size={18} /></button>}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {(["name", "phone", "relation"] as const).map((k) => (
                          <div key={k}>
                            <input className={inputCls} placeholder={k[0].toUpperCase() + k.slice(1)} value={c[k]} onChange={(e) => set("contacts", f.contacts.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                            {errors[`contacts.${i}.${k}`] && <span className="text-xs text-destructive">{errors[`contacts.${i}.${k}`]}</span>}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                  {f.contacts.length < 3 && <GhostButton type="button" onClick={() => set("contacts", [...f.contacts, { name: "", phone: "", relation: "" }])}><Plus size={18} /> Add contact</GhostButton>}
                  <Field label="Hospital / ambulance number" error={errors.hospital_number}><input className={inputCls} value={f.hospital_number} onChange={(e) => set("hospital_number", e.target.value)} /></Field>
                </>
              )}

              {step === 5 && (
                <>
                  <p className="text-sm text-muted-foreground">Add any tablets you take now, or skip — you can scan a prescription later.</p>
                  {f.meds.map((m, i) => (
                    <motion.div key={i} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-3 rounded-2xl border border-indigo/10 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
                      <input className={inputCls} placeholder="Name" value={m.name} onChange={(e) => set("meds", f.meds.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <input className={inputCls} placeholder="Dose (500mg)" value={m.dosage} onChange={(e) => set("meds", f.meds.map((x, j) => (j === i ? { ...x, dosage: e.target.value } : x)))} />
                      <input className={inputCls} placeholder="Times (08:00, 20:00)" value={m.times} onChange={(e) => set("meds", f.meds.map((x, j) => (j === i ? { ...x, times: e.target.value } : x)))} />
                      <button type="button" aria-label="Remove tablet" onClick={() => set("meds", f.meds.filter((_, j) => j !== i))} className="justify-self-end"><Trash2 size={18} /></button>
                    </motion.div>
                  ))}
                  <GhostButton type="button" onClick={() => set("meds", [...f.meds, { name: "", dosage: "", times: "09:00" }])}><Plus size={18} /> Add tablet</GhostButton>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex justify-between gap-3">
            <GhostButton type="button" onClick={back} disabled={step === 0}><ArrowLeft size={18} /> Back</GhostButton>
            <div className="flex items-center gap-2">
              {step === 2 && (
                <GhostButton
                  type="button"
                  onClick={() => {
                    setErrors({});
                    setF((s) => ({
                      ...s,
                      sugar_fasting: s.sugar_fasting || "95",
                      bp_systolic: s.bp_systolic || "120",
                      bp_diastolic: s.bp_diastolic || "80",
                    }));
                    setDir(1);
                    setStep(step + 1);
                  }}
                >
                  Skip
                </GhostButton>
              )}
              <PrimaryButton type="button" onClick={next} disabled={saving} className="pulse-glow">
                {step === 5 ? (saving ? "Saving…" : f.meds.length ? "Finish" : "Skip & finish") : "Next"} <ArrowRight size={18} />
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
