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
  .validator((d) => File.parse(d))
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

export type DetectionResult = {
  is_fridge_or_food: boolean;
  confidence: number;
  detected_scene: string;
  ingredients: string[];
};

export const detectIngredients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => File.parse(d))
  .handler(async ({ data }) => {
    const { generateTextStreamed, extractJson } = await import("./ai/gateway.server");
    const prompt = `You are a precision AI computer vision model specialized in refrigerator, pantry, and food ingredient detection (like Google Lens / Gemini Vision).

Analyze this image carefully and determine:
1. Is this a refrigerator interior, open pantry, food storage, kitchen counter with food, or raw/cooked cooking ingredients?
2. If YES (is_fridge_or_food = true), identify all specific visible food ingredients (vegetables, fruits, dairy, meats, condiments, beverages, spices).
3. If NO (e.g. human face, room wall, laptop/screen, floor, empty space, clothing, non-food object), set is_fridge_or_food = false and ingredients = [].

Return ONLY a JSON object matching this exact structure:
{
  "is_fridge_or_food": boolean,
  "confidence": number (between 0.0 and 1.0),
  "detected_scene": string (e.g. "refrigerator_interior", "kitchen_counter", "pantry", or "non_food_scene"),
  "ingredients": string[] (array of short lowercase ingredient names, max 25)
}`;

    const text = await generateTextStreamed([
      { role: "user", content: [{ type: "text", text: prompt }, filePart(data)] },
    ]);

    try {
      const parsed = extractJson<DetectionResult>(text);
      return {
        is_fridge_or_food: Boolean(parsed.is_fridge_or_food),
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
        detected_scene: parsed.detected_scene || "food_scene",
        ingredients: Array.isArray(parsed.ingredients)
          ? parsed.ingredients.slice(0, 25).map((i) => i.toLowerCase().trim()).filter(Boolean)
          : [],
      };
    } catch {
      try {
        const rawList = extractJson<string[]>(text);
        if (Array.isArray(rawList) && rawList.length > 0) {
          return {
            is_fridge_or_food: true,
            confidence: 0.85,
            detected_scene: "food_ingredients",
            ingredients: rawList.slice(0, 25).map((i) => i.toLowerCase().trim()).filter(Boolean),
          };
        }
      } catch {}
      return { is_fridge_or_food: false, confidence: 0, detected_scene: "non_food_scene", ingredients: [] };
    }
  });

export const generateRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ ingredients: z.array(z.string().max(60)).min(1).max(60), request: z.string().max(500).default("") }).parse(d))
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

export type IndianFoodItem = {
  name: string;
  ingredients: string[];
  diet: string;
  prep_time: number;
  cook_time: number;
  flavor_profile: string;
  course: string;
  state: string;
  region: string;
  match_score?: number;
};

export const fetchIndianFoods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        search: z.string().optional(),
        diet: z.string().optional(),
        course: z.string().optional(),
        region: z.string().optional(),
        flavor: z.string().optional(),
        ingredients: z.array(z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const backendUrls = [
      process.env["BACKEND_URL"],
      "http://127.0.0.1:8000",
      "http://localhost:8000",
    ].filter((u): u is string => Boolean(u));

    const params = new URLSearchParams();
    if (data.search) params.append("search", data.search);
    if (data.diet) params.append("diet", data.diet);
    if (data.course) params.append("course", data.course);
    if (data.region) params.append("region", data.region);
    if (data.flavor) params.append("flavor", data.flavor);
    // Always use limit=500 so we can client-score the full filtered set
    params.append("limit", "500");

    // Helper: score and sort a list of foods by fridge ingredient match
    function scoreByIngredients(foods: IndianFoodItem[], ings: string[]): IndianFoodItem[] {
      const userIngs = ings.map((x) => x.toLowerCase().trim());
      return foods
        .map((f) => {
          const dishIngs = f.ingredients.map((x) => x.toLowerCase());
          let matches = 0;
          for (const uIng of userIngs) {
            if (dishIngs.some((dIng) => dIng.includes(uIng) || uIng.includes(dIng))) matches++;
          }
          const score = matches > 0 ? Math.round((matches / Math.max(userIngs.length, 1)) * 100) : 0;
          return { ...f, match_score: score };
        })
        .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
    }

    const hasIngredients = data.ingredients && data.ingredients.length > 0;
    const hasSearch = Boolean(data.search && data.search.trim());

    if (hasIngredients && !hasSearch) {
      // Only ingredients — use match endpoint for best scored results
      for (const baseUrl of backendUrls) {
        try {
          const res = await fetch(`${baseUrl}/api/foodmaker/match-indian-foods`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ingredients: data.ingredients }),
          });
          if (res.ok) {
            return (await res.json()) as IndianFoodItem[];
          }
        } catch {
          // continue to fallback
        }
      }
    } else if (hasIngredients && hasSearch) {
      // Both search + ingredients — post to match endpoint with all fields for combined result
      for (const baseUrl of backendUrls) {
        try {
          const res = await fetch(`${baseUrl}/api/foodmaker/match-indian-foods`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ingredients: data.ingredients,
              search: data.search,
              diet: data.diet,
              course: data.course,
              region: data.region,
              flavor: data.flavor,
            }),
          });
          if (res.ok) {
            return (await res.json()) as IndianFoodItem[];
          }
        } catch {
          // continue to fallback
        }
      }
      // fallback: use GET search then score locally
      for (const baseUrl of backendUrls) {
        try {
          const res = await fetch(`${baseUrl}/api/foodmaker/indian-foods?${params.toString()}`);
          if (res.ok) {
            return scoreByIngredients((await res.json()) as IndianFoodItem[], data.ingredients!);
          }
        } catch {
          // continue to csv fallback
        }
      }
    } else {
      // Search only — use GET with search params
      for (const baseUrl of backendUrls) {
        try {
          const res = await fetch(`${baseUrl}/api/foodmaker/indian-foods?${params.toString()}`);
          if (res.ok) {
            return (await res.json()) as IndianFoodItem[];
          }
        } catch {
          // continue to fallback
        }
      }
    }

    // Node/Bun Server-side Fallback reading backend/indian_food.csv directly
    try {
      const fs = await import("fs");
      const path = await import("path");
      const csvPath = path.resolve(process.cwd(), "backend", "indian_food.csv");
      if (fs.existsSync(csvPath)) {
        const raw = fs.readFileSync(csvPath, "utf-8");
        const lines = raw.split(/\r?\n/).filter(Boolean);
        if (lines.length > 1) {
          const items: IndianFoodItem[] = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const cols: string[] = [];
            let current = "";
            let inQuotes = false;
            for (let c = 0; c < line.length; c++) {
              const char = line[c];
              if (char === '"') inQuotes = !inQuotes;
              else if (char === "," && !inQuotes) {
                cols.push(current.trim());
                current = "";
              } else {
                current += char;
              }
            }
            cols.push(current.trim());
            if (cols.length >= 9) {
              const name = cols[0].replace(/^"|"$/g, "").trim();
              const ingRaw = cols[1].replace(/^"|"$/g, "").trim();
              const diet = cols[2].replace(/^"|"$/g, "").trim().toLowerCase();
              const prep = parseInt(cols[3]) || 15;
              const cook = parseInt(cols[4]) || 25;
              const flavor = cols[5].replace(/^"|"$/g, "").trim().toLowerCase();
              const course = cols[6].replace(/^"|"$/g, "").trim().toLowerCase();
              const state = cols[7].replace(/^"|"$/g, "").trim();
              const region = cols[8].replace(/^"|"$/g, "").trim();

              const ingList = ingRaw.split(",").map((x) => x.trim()).filter(Boolean);
              if (name) {
                items.push({
                  name,
                  ingredients: ingList,
                  diet: diet && diet !== "-1" ? diet : "vegetarian",
                  prep_time: prep > 0 ? prep : 15,
                  cook_time: cook > 0 ? cook : 25,
                  flavor_profile: flavor && flavor !== "-1" ? flavor : "savory",
                  course: course && course !== "-1" ? course : "main course",
                  state: state && state !== "-1" ? state : "India",
                  region: region && region !== "-1" ? region : "Pan-India",
                  match_score: 0,
                });
              }
            }
          }

          let filtered = items;
          if (data.search) {
            const s = data.search.toLowerCase();
            filtered = filtered.filter(
              (f) =>
                f.name.toLowerCase().includes(s) ||
                f.ingredients.some((ing) => ing.toLowerCase().includes(s)),
            );
          }
          if (data.diet && data.diet !== "all") {
            filtered = filtered.filter((f) => f.diet === data.diet?.toLowerCase());
          }
          if (data.course && data.course !== "all") {
            filtered = filtered.filter((f) => f.course === data.course?.toLowerCase());
          }
          if (data.region && data.region !== "all") {
            filtered = filtered.filter((f) =>
              f.region.toLowerCase().includes(data.region!.toLowerCase()),
            );
          }
          if (data.flavor && data.flavor !== "all") {
            filtered = filtered.filter((f) => f.flavor_profile === data.flavor?.toLowerCase());
          }

          if (data.ingredients && data.ingredients.length > 0) {
            const userIngs = data.ingredients.map((x) => x.toLowerCase().trim());
            const scored = filtered.map((f) => {
              const dishIngs = f.ingredients.map((x) => x.toLowerCase());
              let matches = 0;
              for (const uIng of userIngs) {
                if (dishIngs.some((dIng) => dIng.includes(uIng) || uIng.includes(dIng))) {
                  matches++;
                }
              }
              const score = matches > 0 ? Math.round((matches / Math.max(userIngs.length, 1)) * 100) : 0;
              return { ...f, match_score: score };
            });
            // When searching + ingredients: show ALL filtered results sorted by match score
            // (0-score dishes appear at bottom so user sees everything matching the search)
            if (data.search && data.search.trim()) {
              return scored
                .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
                .slice(0, 250);
            }
            // Ingredients only (no search): show matched dishes first, then popular dishes
            const matchedOnly = scored.filter((x) => (x.match_score ?? 0) > 0);
            if (matchedOnly.length > 0) {
              return matchedOnly
                .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
                .slice(0, 40);
            }
          }

          return filtered.slice(0, 250);
        }
      }
    } catch (e) {
      console.warn("Local fallback error:", e);
    }

    return [] as IndianFoodItem[];
  });
