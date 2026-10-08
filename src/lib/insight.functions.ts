import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { bmi, calorieTarget, fallbackInsight, healthyWeightRange, type Insight, type Profile } from "./health";

export const generateInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: p, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error || !p) throw new Error("Profile not found");
    const profile = p as unknown as Profile;
    const [min, max] = healthyWeightRange(profile.height_cm);
    let insight: Insight = fallbackInsight(profile);
    try {
      let fetchedBackend = false;
      const backendUrls = [
        process.env["BACKEND_URL"],
        "http://127.0.0.1:8000",
        "http://localhost:8000",
      ].filter(Boolean) as string[];

      for (const baseUrl of backendUrls) {
        try {
          const res = await fetch(`${baseUrl}/api/dashboard/insight`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              age: profile.age,
              gender: profile.gender,
              height_cm: profile.height_cm,
              weight_kg: profile.weight_kg,
              sugar_fasting: profile.sugar_fasting,
              bp_systolic: profile.bp_systolic,
              bp_diastolic: profile.bp_diastolic,
              goal: profile.goal,
              diet: profile.diet,
              conditions: profile.conditions || [],
              allergies: profile.allergies || []
            }),
          });
          if (res.ok) {
            const parsed = (await res.json()) as Insight;
            if (parsed.recommendation && Array.isArray(parsed.tips)) {
               insight = { ...parsed, tips: parsed.tips.slice(0, 3) };
               fetchedBackend = true;
               break;
            }
          }
        } catch(e) {}
      }

      if (!fetchedBackend) {
        const { generateTextStreamed } = await import("./ai/gateway.server");
        const text = await generateTextStreamed(
          [
            {
              role: "user",
              content: `Profile: age ${profile.age}, ${profile.gender}, height ${profile.height_cm}cm, weight ${profile.weight_kg}kg, BMI ${bmi(profile.height_cm, profile.weight_kg)}, fasting sugar ${profile.sugar_fasting} mg/dL, BP ${profile.bp_systolic}/${profile.bp_diastolic}, stated goal ${profile.goal}, diet ${profile.diet}, conditions ${(profile.conditions ?? []).join(", ") || "none"}. Healthy weight range ${min}-${max}kg. Estimated calorie need for goal ≈ ${calorieTarget(profile)}.
Return ONLY a JSON object, no markdown: {"recommendation":"gain"|"lose"|"maintain","headline":string (max 8 words),"target_weight_min":number,"target_weight_max":number,"daily_calories":number,"tips":[3 short actionable tips, max 12 words each]}`,
            },
          ],
          "You are Phantom, a careful health assistant. Base the recommendation on BMI and vitals, not only the stated goal. Be practical and kind.",
        );
        const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
        const parsed = JSON.parse(json) as Insight;
        if (parsed.recommendation && Array.isArray(parsed.tips)) insight = { ...parsed, tips: parsed.tips.slice(0, 3) };
      }
    } catch (e) {
      console.error("insight generation failed, using fallback", e);
    }
    await supabase.from("profiles").update({ insight: insight as never, insight_at: new Date().toISOString() }).eq("id", userId);
    return insight;
  });
