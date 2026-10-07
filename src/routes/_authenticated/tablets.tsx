import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import Tesseract from "tesseract.js";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pill, Trash2, Sun, Sunrise, Sunset, Moon, Camera, ImageIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  const [scanOpen, setScanOpen] = useState(false);
  const [scannedData, setScannedData] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (ev.target?.result) await processImage(ev.target.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const processImage = async (base64: string) => {
    setIsScanning(true);
    toast.loading("Step 1/2: Reading text from image...", { id: "scan" });
    try {
      // Step 1: OCR with Tesseract.js (client-side)
      const { data: { text } } = await Tesseract.recognize(base64, 'eng');
      console.log("OCR Result:", text);
      
      if (!text.trim()) {
        toast.error("Could not read any text from the image", { id: "scan" });
        return;
      }

      // Step 2: Send OCR text to backend for qwen parsing
      toast.loading("Step 2/2: Parsing medicines with AI...", { id: "scan" });
      const res = await fetch("http://localhost:8000/api/tablets/scan-prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocr_text: text }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || "Failed to parse prescription");
      }
      const data = await res.json();
      
      const meds = data.medicines || [];
      if (meds.length === 0) {
        toast.error("No medicines found on prescription", { id: "scan" });
        return;
      }

      setScannedData(meds.map((d: any) => ({
        name: d.name || "",
        dosage: d.dosage || "",
        times: (d.times || ["09:00"]).join(", "),
        meal: d.meal_relation || "after",
        stock: (d.duration_days || 30).toString(),
        end: "",
      })));
      toast.success(`Found ${meds.length} medicine(s)! Please review the details.`, { id: "scan" });
      setOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to process image", { id: "scan" });
    } finally {
      setIsScanning(false);
    }
  };

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
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button disabled={isScanning} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-indigo/20 bg-glass px-4 text-sm font-medium text-foreground hover:bg-white/5 shadow-sm disabled:opacity-50">
                <Camera size={18} /> {isScanning ? "Scanning..." : "Scan"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-background">
              <DropdownMenuItem onClick={() => setScanOpen(true)} className="cursor-pointer py-2">
                <Camera className="mr-2 h-4 w-4" /> Take Photo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="cursor-pointer py-2">
                <ImageIcon className="mr-2 h-4 w-4" /> Upload Image
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
          <PrimaryButton onClick={() => setOpen(true)} className="pulse-glow"><Plus size={18} /> Add tablet</PrimaryButton>
        </div>
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
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
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
      <AddTablet open={open} onOpenChange={setOpen} initialData={scannedData} />
      <ScanTablet open={scanOpen} onOpenChange={setScanOpen} onCapture={processImage} />
    </motion.div>
  );
}

function AddTablet({ open, onOpenChange, initialData = [] }: { open: boolean; onOpenChange: (o: boolean) => void; initialData?: any[] }) {
  const qc = useQueryClient();
  const defaultF = { name: "", dosage: "", times: "09:00", meal: "after", end: "", stock: "30" };
  const [forms, setForms] = useState([defaultF]);
  
  useEffect(() => {
    if (open && initialData.length > 0) {
      setForms(initialData);
    } else if (!open) {
      setForms([defaultF]);
    }
  }, [open, initialData]);

  const updateForm = (index: number, field: string, value: any) => {
    const newForms = [...forms];
    newForms[index] = { ...newForms[index], [field]: value };
    setForms(newForms);
  };

  async function save() {
    for (const f of forms) {
      if (!f.name.trim()) return toast.error("Enter the tablet name");
      const times = f.times.split(",").map((t: string) => t.trim()).filter((t: string) => /^\d{1,2}:\d{2}$/.test(t)).map((t: string) => t.padStart(5, "0"));
      if (!times.length) return toast.error("Enter times like 08:00, 20:00 for " + f.name);
      const { error } = await supabase.from("medicines").insert({ name: f.name.trim(), dosage: f.dosage, specific_times: times, times_per_day: times.length, meal_relation: f.meal, end_date: f.end || null, total_stock: +f.stock || null });
      if (error) return toast.error(error.message);
    }
    toast.success("Tablet(s) added");
    qc.invalidateQueries({ queryKey: ["medicines"] });
    setForms([defaultF]);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader><SheetTitle>{forms.length > 1 ? `Review ${forms.length} tablets` : 'Add a tablet'}</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-8 p-4">
          {forms.map((f, i) => (
            <div key={i} className="grid grid-cols-2 gap-3 border-b border-indigo/10 pb-6 last:border-0 last:pb-0">
              <div className="col-span-2"><Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => updateForm(i, 'name', e.target.value)} placeholder="Metformin" /></Field></div>
              <Field label="Dose"><input className={inputCls} value={f.dosage} onChange={(e) => updateForm(i, 'dosage', e.target.value)} placeholder="500mg" /></Field>
              <Field label="Times"><input className={inputCls} value={f.times} onChange={(e) => updateForm(i, 'times', e.target.value)} placeholder="08:00, 20:00" /></Field>
              <Field label="With food">
                <select className={inputCls} value={f.meal} onChange={(e) => updateForm(i, 'meal', e.target.value)}><option value="before">Before food</option><option value="after">After food</option></select>
              </Field>
              <Field label="Stock (doses)"><input className={inputCls} value={f.stock} onChange={(e) => updateForm(i, 'stock', e.target.value)} /></Field>
              <div className="col-span-2"><Field label="Course ends (optional)"><input type="date" className={inputCls} value={f.end} onChange={(e) => updateForm(i, 'end', e.target.value)} /></Field></div>
            </div>
          ))}
          <PrimaryButton className="w-full mt-4" onClick={save}>Save {forms.length > 1 ? "all tablets" : "tablet"}</PrimaryButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ScanTablet({ open, onOpenChange, onCapture }: { open: boolean; onOpenChange: (o: boolean) => void; onCapture: (base64: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.error("Camera access error:", err);
          if (err.name === "NotAllowedError") {
            setError("Camera permission denied. Please allow camera access in your browser settings.");
          } else if (err.name === "NotFoundError") {
            setError("No camera found on this device.");
          } else {
            setError("Could not access camera: " + err.message);
          }
        });
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  const handleCapture = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.8);
    onCapture(base64);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl h-[80vh] flex flex-col">
        <SheetHeader><SheetTitle>Scan a tablet</SheetTitle></SheetHeader>
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          {error ? (
            <div className="flex-1 flex items-center justify-center text-center p-4">
              <p className="text-destructive font-medium">{error}</p>
            </div>
          ) : (
            <div className="relative flex-1 rounded-2xl overflow-hidden bg-black/5 border border-border flex items-center justify-center">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-[3px] border-primary/40 m-8 rounded-xl pointer-events-none" />
            </div>
          )}
          <PrimaryButton onClick={handleCapture} disabled={!!error} className="w-full h-14 text-lg">
            <Camera className="mr-2" size={24} /> Capture
          </PrimaryButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
