import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ScannedMed = { name: string; dosage: string; frequency: string; times: string[]; duration_days: number | null; meal_relation: "before" | "after"; notes: string };
export type Prescription = { doctor: string; notes: string; medicines: ScannedMed[] };
export type Recipe = {
  name: string; emoji: string; prep_minutes: number; calories: number;
  protein: number; carbs: number; fat: number; why: string;
  ingredients: string[]; steps: string[];
};

const File = z.object({ dataUrl: z.string().startsWith("data:").max(12_000_000), mediaType: z.string().max(60) });

function filePart(f: z.infer<typeof File>) {
  return f.mediaType === "application/pdf"
    ? ({ type: "file", data: f.dataUrl, mediaType: "application/pdf" } as const)
    : ({ type: "image", image: f.dataUrl } as const);
}

export const scanPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => File.parse(d))
  .handler(async ({ data }) => {
    const { generateTextStreamed, extractJson } = await import("./ai/gateway.server");
    const text = await generateTextStreamed([
      {
        role: "user",
        content: [
          { type: "text", text: `Read this prescription. Return ONLY JSON: {"doctor":string,"notes":string,"medicines":[{"name":string,"dosage":string,"frequency":string,"times":["HH:MM"],"duration_days":number|null,"meal_relation":"before"|"after","notes":string}]}. Map frequency to 24h times (OD→09:00, BD→09:00,21:00, TDS→08:00,14:00,20:00, HS→22:00). If unreadable return empty medicines.` },
          filePart(data),
        ],
      },
    ]);
    try {
      return extractJson<Prescription>(text);
    } catch {
      return { doctor: "", notes: "Couldn't read this prescription clearly.", medicines: [] } as Prescription;
    }
  });

export const detectIngredients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => File.parse(d))
  .handler(async ({ data }) => {
    const { generateTextStreamed, extractJson } = await import("./ai/gateway.server");
    const text = await generateTextStreamed([
      { role: "user", content: [{ type: "text", text: 'List the food ingredients visible in this photo. Return ONLY a JSON array of short lowercase names, e.g. ["tomato","eggs"]. Max 25.' }, filePart(data)] },
    ]);
    try {
      return extractJson<string[]>(text).slice(0, 25);
    } catch {
      return [] as string[];
    }
  });

export const generateRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ingredients: z.array(z.string().max(60)).min(1).max(60), request: z.string().max(500).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const { generateTextStreamed, extractJson } = await import("./ai/gateway.server");
    const { data: p } = await context.supabase.from("profiles").select("*").eq("id", context.userId).single();
    const text = await generateTextStreamed([
      {
        role: "user",
        content: `Ingredients: ${data.ingredients.join(", ")}.
User: goal ${p?.goal}, diet ${p?.diet}, allergies ${(p?.allergies ?? []).join(", ") || "none"}, conditions ${(p?.conditions ?? []).join(", ") || "none"}, fasting sugar ${p?.sugar_fasting}, BP ${p?.bp_systolic}/${p?.bp_diastolic}.
Extra request: ${data.request || "none"}.
Create 4 recipes mostly from these ingredients (pantry staples allowed). Strictly respect diet and allergies; use low glycemic options if sugar is high; low salt if BP high.
Return ONLY JSON array: [{"name":string,"emoji":string,"prep_minutes":number,"calories":number,"protein":number,"carbs":number,"fat":number,"why":string (1 sentence, why it fits them),"ingredients":[string with quantity],"steps":[string]}].`,
      },
    ]);
    try {
      return extractJson<Recipe[]>(text).slice(0, 4);
    } catch {
      throw new Error("Couldn't create recipes, please try again");
    }
  });
