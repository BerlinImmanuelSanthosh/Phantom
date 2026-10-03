export type Profile = {
  id: string;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  sugar_fasting: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  goal: string | null;
  diet: string | null;
  allergies: string[] | null;
  conditions: string[] | null;
  emergency_contacts: { name: string; phone: string; relation: string }[] | null;
  hospital_number: string | null;
  water_ml: number | null;
  water_date: string | null;
  insight: Insight | null;
  onboarding_complete: boolean;
};

export type Insight = {
  recommendation: "gain" | "lose" | "maintain";
  headline: string;
  target_weight_min: number;
  target_weight_max: number;
  daily_calories: number;
  tips: string[];
};

export type Status = "normal" | "watch" | "high";

export function bmi(h?: number | null, w?: number | null) {
  if (!h || !w) return 0;
  const m = Number(h) / 100;
  return Math.round((Number(w) / (m * m)) * 10) / 10;
}

export function bmiCategory(b: number): { label: string; status: Status } {
  if (!b) return { label: "—", status: "watch" };
  if (b < 18.5) return { label: "Underweight", status: "watch" };
  if (b < 25) return { label: "Healthy", status: "normal" };
  if (b < 30) return { label: "Overweight", status: "watch" };
  return { label: "Obese", status: "high" };
}

export function sugarStatus(s?: number | null): Status {
  if (!s) return "watch";
  if (s < 100) return "normal";
  if (s < 126) return "watch";
  return "high";
}

export function bpStatus(sys?: number | null, dia?: number | null): Status {
  if (!sys || !dia) return "watch";
  if (sys < 120 && dia < 80) return "normal";
  if (sys < 140 && dia < 90) return "watch";
  return "high";
}

export function healthScore(p: Pick<Profile, "height_cm" | "weight_kg" | "sugar_fasting" | "bp_systolic" | "bp_diastolic">) {
  const b = bmi(p.height_cm, p.weight_kg);
  const bmiPts = b ? Math.max(0, 40 - Math.abs(b - 22) * 4) : 20;
  const s = Number(p.sugar_fasting) || 100;
  const sugarPts = Math.max(0, 30 - Math.max(0, s - 90) * 0.6);
  const sys = Number(p.bp_systolic) || 120;
  const dia = Number(p.bp_diastolic) || 80;
  const bpPts = Math.max(0, 30 - Math.max(0, sys - 115) * 0.5 - Math.max(0, dia - 75) * 0.6);
  return Math.round(Math.min(100, bmiPts + sugarPts + bpPts));
}

/** Mifflin–St Jeor with light activity, adjusted by goal. */
export function calorieTarget(p: Pick<Profile, "age" | "gender" | "height_cm" | "weight_kg" | "goal">) {
  const w = Number(p.weight_kg) || 70;
  const h = Number(p.height_cm) || 170;
  const a = Number(p.age) || 30;
  const base = 10 * w + 6.25 * h - 5 * a + (p.gender === "female" ? -161 : 5);
  const tdee = base * 1.375;
  const adj = p.goal === "lose" ? -450 : p.goal === "gain" ? 350 : 0;
  return Math.round((tdee + adj) / 10) * 10;
}

export function healthyWeightRange(h?: number | null) {
  const m = (Number(h) || 170) / 100;
  return [Math.round(18.5 * m * m), Math.round(24.9 * m * m)] as const;
}

export function fallbackInsight(p: Profile): Insight {
  const b = bmi(p.height_cm, p.weight_kg);
  const [min, max] = healthyWeightRange(p.height_cm);
  const rec: Insight["recommendation"] = b && b < 18.5 ? "gain" : b >= 25 ? "lose" : "maintain";
  return {
    recommendation: rec,
    headline: rec === "gain" ? "Build up gently" : rec === "lose" ? "Ease weight down steadily" : "You're in a good range — hold it",
    target_weight_min: min,
    target_weight_max: max,
    daily_calories: calorieTarget({ ...p, goal: rec }),
    tips: ["Walk 30 minutes a day", "Fill half your plate with vegetables", "Sleep 7–8 hours"],
  };
}

export const statusLabel: Record<Status, string> = { normal: "Normal", watch: "Watch", high: "High" };
