import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pill, Trash2, Sun, Sunrise, Sunset, Moon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMedicines, useTodayDoses, type Medicine } from "@/hooks/useProfile";
import { Field, GlassCard, PrimaryButton, Ring, CountUp, Skeleton, inputCls } from "@/components/phantom/ui";
import { stagger } from "@/lib/motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/tablets")({
  head: () => ({
    meta: [
      { title: "Tablets — Phantom" },
      { name: "description", content: "Your medicine timetable, dose check-offs and stock." },
      { property: "og:title", content: "Tablets — Phantom" },
      { property: "og:description", content: "Your medicine timetable, dose check-offs and stock." },
    ],
  }),
  component: Tablets,
});

const SLOTS = [
  { key: "Morning", icon: Sunrise, test: (h: number) => h >= 5 && h < 12 },
  { key: "Afternoon", icon: Sun, test: (h: number) => h >= 12 && h < 17 },
  { key: "Evening", icon: Sunset, test: (h: number) => h >= 17 && h < 21 },
  { key: "Night", icon: Moon, test: (h: number) => h >= 21 || h < 5 },
];

function daysLeft(m: Medicine) {
  if (!m.end_date) return "—";
  return Math.max(0, Math.ceil((new Date(m.end_date).getTime() - Date.now()) / 86400000)) + " d";
}

function Tablets() {
  const qc = useQueryClient();
  const meds = useMedicines();
  const doses = useTodayDoses();
  const [open, setOpen] = useState(false);

  const all = (meds.data ?? []).flatMap((m) => (m.specific_times ?? []).map((t) => ({ t, m })));
  const isTaken = (id: string, t: string) => (doses.data ?? []).some((d) => d.medicine_id === id && new Date(d.scheduled_at).toTimeString().slice(0, 5) === t);
  const takenCount = all.filter((a) => isTaken(a.m.id, a.t)).length;
  const pct = all.length ? Math.round((takenCount / all.length) * 100) : 0;

  async function take(m: Medicine, t: string) {
    if (isTaken(m.id, t)) return;
    const d = new Date();
    const [h, mi] = t.split(":").map(Number);
    d.setHours(h, mi, 0, 0);
    const { error } = await supabase.from("dose_logs").insert({ medicine_id: m.id, scheduled_at: d.toISOString(), taken_at: new Date().toISOString(), status: "taken" });
    if (error) return toast.error(error.message);
    if (m.total_stock != null) await supabase.from("medicines").update({ total_stock: Math.max(0, m.total_stock - 1) }).eq("id", m.id);
    qc.invalidateQueries({ queryKey: ["doses-today"] });
    qc.invalidateQueries({ queryKey: ["medicines"] });
  }
  async function remove(id: string) {
    await supabase.from("medicines").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["medicines"] });
  }

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-bold">My Tablets</h1><p className="text-sm text-muted-foreground">Tap a dose to mark it taken.</p></div>
        <PrimaryButton onClick={() => setOpen(true)} className="pulse-glow"><Plus size={18} /> Add tablet</PrimaryButton>
      </header>

      <GlassCard className="flex items-center gap-6">
        <Ring value={pct} size={110} stroke={10}><span className="font-display text-2xl font-bold"><CountUp value={pct} />%</span></Ring>
        <div><p className="text-lg font-bold">Today's adherence</p><p className="text-sm text-muted-foreground">{takenCount} of {all.length} doses taken</p></div>
      </GlassCard>

      {meds.isLoading ? <Skeleton className="h-64" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SLOTS.map((s) => {
            const items = all.filter((a) => s.test(+a.t.split(":")[0])).sort((a, b) => a.t.localeCompare(b.t));
            return (
              <GlassCard key={s.key} hover={false}>
                <h2 className="mb-3 flex items-center gap-2 font-bold"><s.icon size={18} /> {s.key}</h2>
                {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled</p>}
                <div className="space-y-2">
                  {items.map(({ m, t }) => {
                    const done = isTaken(m.id, t);
                    return (
                      <motion.button key={m.id + t} whileTap={{ scale: 0.97 }} onClick={() => take(m, t)} className={`relative flex w-full items-center gap-3 rounded-xl border p-3 text-left ${done ? "border-cyan bg-secondary" : "border-indigo/10 bg-glass"}`} aria-pressed={done}>
                        <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-cyan">
                          {done && <svg viewBox="0 0 24 24" className="h-4 w-4"><motion.path d="M5 12l5 5 9-10" fill="none" stroke="var(--indigo)" strokeWidth={3} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} /></svg>}
                          <AnimatePresence>{done && [0, 1, 2, 3, 4, 5].map((i) => (
                            <motion.span key={i} className="absolute h-1.5 w-1.5 rounded-full bg-cyan" initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(i) * 22, y: Math.sin(i) * 22, opacity: 0 }} transition={{ duration: 0.6 }} />
                          ))}</AnimatePresence>
                        </span>
                        <span className="flex-1"><span className="block font-semibold">{m.name}</span><span className="text-xs text-muted-foreground">{t} · {m.dosage} · {m.meal_relation} food</span></span>
                      </motion.button>
                    );
                  })}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <GlassCard hover={false} className="overflow-x-auto">
        <h2 className="mb-3 text-lg font-bold">All tablets</h2>
        {(meds.data ?? []).length === 0 ? (
          <div className="py-8 text-center"><Pill size={36} className="mx-auto" /><p className="mt-2 text-sm text-muted-foreground">No tablets yet. Add one to start your schedule.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-2">Name</th><th>Dose</th><th>Timing</th><th>Days left</th><th>Stock</th><th /></tr></thead>
            <tbody>
              {meds.data!.map((m) => (
                <tr key={m.id} className="border-t border-indigo/10">
                  <td className="py-2.5 font-semibold">{m.name}</td><td>{m.dosage}</td><td>{(m.specific_times ?? []).join(", ")}</td><td>{daysLeft(m)}</td>
                  <td className={m.total_stock != null && m.total_stock <= 3 ? "font-bold text-destructive" : ""}>{m.total_stock ?? "—"}</td>
                  <td><button aria-label={`Delete ${m.name}`} onClick={() => remove(m.id)}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
      <AddTablet open={open} onOpenChange={setOpen} />
    </motion.div>
  );
}

function AddTablet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", dosage: "", times: "09:00", meal: "after", end: "", stock: "30" });
  async function save() {
    if (!f.name.trim()) return toast.error("Enter the tablet name");
    const times = f.times.split(",").map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, "0"));
    if (!times.length) return toast.error("Enter times like 08:00, 20:00");
    const { error } = await supabase.from("medicines").insert({ name: f.name.trim(), dosage: f.dosage, specific_times: times, times_per_day: times.length, meal_relation: f.meal, end_date: f.end || null, total_stock: +f.stock || null });
    if (error) return toast.error(error.message);
    toast.success("Tablet added");
    qc.invalidateQueries({ queryKey: ["medicines"] });
    setF({ name: "", dosage: "", times: "09:00", meal: "after", end: "", stock: "30" });
    onOpenChange(false);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl">
        <SheetHeader><SheetTitle>Add a tablet</SheetTitle></SheetHeader>
        <div className="grid grid-cols-2 gap-3 p-4">
          <div className="col-span-2"><Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Metformin" /></Field></div>
          <Field label="Dose"><input className={inputCls} value={f.dosage} onChange={(e) => setF({ ...f, dosage: e.target.value })} placeholder="500mg" /></Field>
          <Field label="Times"><input className={inputCls} value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} placeholder="08:00, 20:00" /></Field>
          <Field label="With food">
            <select className={inputCls} value={f.meal} onChange={(e) => setF({ ...f, meal: e.target.value })}><option value="before">Before food</option><option value="after">After food</option></select>
          </Field>
          <Field label="Stock (doses)"><input className={inputCls} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Course ends (optional)"><input type="date" className={inputCls} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field></div>
          <PrimaryButton className="col-span-2" onClick={save}>Save tablet</PrimaryButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
