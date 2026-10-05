import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function userClient(token: string) {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
  });
}

type SB = ReturnType<typeof userClient>;

export async function profileContext(supabase: SB, userId: string) {
  const [{ data: p }, { data: meds }, { data: v }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("medicines").select("name,dosage,specific_times,meal_relation"),
    supabase.from("vitals").select("*").order("recorded_at", { ascending: false }).limit(1),
  ]);
  const last = v?.[0];
  return `User profile: ${p?.full_name}, age ${p?.age}, ${p?.gender}, ${p?.height_cm}cm, ${last?.weight_kg ?? p?.weight_kg}kg.
Fasting sugar ${last?.sugar ?? p?.sugar_fasting} mg/dL, BP ${last?.bp_systolic ?? p?.bp_systolic}/${last?.bp_diastolic ?? p?.bp_diastolic}.
Goal: ${p?.goal}. Diet: ${p?.diet}. Allergies: ${(p?.allergies ?? []).join(", ") || "none"}. Conditions: ${(p?.conditions ?? []).join(", ") || "none"}.
Tablets: ${(meds ?? []).map((m) => `${m.name} ${m.dosage ?? ""} at ${(m.specific_times ?? []).join("/")} ${m.meal_relation} food`).join("; ") || "none"}.`;
}
