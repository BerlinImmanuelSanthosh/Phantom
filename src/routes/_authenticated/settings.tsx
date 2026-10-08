import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { LogOut, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateProfile, useProfile } from "@/hooks/useProfile";
import { Field, GhostButton, GlassCard, PrimaryButton, inputCls } from "@/components/phantom/ui";
import { stagger } from "@/lib/motion";
import { getLanguage, setLanguage, type Language } from "@/lib/files";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Phantom" },
      { name: "description", content: "Edit your Phantom health profile." },
      { property: "og:title", content: "Settings — Phantom" },
      { property: "og:description", content: "Edit your Phantom health profile." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const nav = useNavigate();
  const { data: p } = useProfile();
  const invalidate = useInvalidateProfile();
  const [lang, setLang] = useState<Language>("en");
  useEffect(() => setLang(getLanguage()), []);
  const [f, setF] = useState(() => ({
    full_name: p?.full_name ?? "", age: String(p?.age ?? ""), height_cm: String(p?.height_cm ?? ""), weight_kg: String(p?.weight_kg ?? ""),
    goal: p?.goal ?? "maintain", diet: p?.diet ?? "veg", hospital_number: p?.hospital_number ?? "",
  }));
  if (!p) return null;

  async function save() {
    const { error } = await supabase.from("profiles").update({ full_name: f.full_name, age: +f.age, height_cm: +f.height_cm, weight_kg: +f.weight_kg, goal: f.goal, diet: f.diet, hospital_number: f.hospital_number }).eq("id", p!.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    invalidate();
  }

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      <h1 className="text-3xl font-bold">Settings</h1>
      <GlassCard hover={false} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><input className={inputCls} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Age"><input className={inputCls} value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} /></Field>
        <Field label="Height (cm)"><input className={inputCls} value={f.height_cm} onChange={(e) => setF({ ...f, height_cm: e.target.value })} /></Field>
        <Field label="Weight (kg)"><input className={inputCls} value={f.weight_kg} onChange={(e) => setF({ ...f, weight_kg: e.target.value })} /></Field>
        <Field label="Goal"><select className={inputCls} value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })}><option value="lose">Lose weight</option><option value="gain">Gain weight</option><option value="maintain">Maintain</option></select></Field>
        <Field label="Diet"><select className={inputCls} value={f.diet} onChange={(e) => setF({ ...f, diet: e.target.value })}><option value="veg">Vegetarian</option><option value="non-veg">Non-veg</option><option value="vegan">Vegan</option></select></Field>
        <Field label="Hospital / ambulance number"><input className={inputCls} value={f.hospital_number} onChange={(e) => setF({ ...f, hospital_number: e.target.value })} /></Field>
        <Field label="Language preference">
          <select
            className={inputCls}
            value={lang}
            onChange={(e) => {
              const next = e.target.value as Language;
              setLang(next);
              setLanguage(next);
              toast.success(next === "ta" ? "மொழி தமிழாக மாற்றப்பட்டது" : "Language set to English");
            }}
          >
            <option value="en">English</option>
            <option value="ta">தமிழ் (Tamil)</option>
          </select>
        </Field>
        <div className="flex items-end gap-3">
          <PrimaryButton onClick={save}><Save size={18} /> Save</PrimaryButton>
          <GhostButton onClick={async () => { await supabase.auth.signOut(); nav({ to: "/" }); }}><LogOut size={18} /> Start over</GhostButton>
        </div>
      </GlassCard>
    </motion.div>
  );
}
