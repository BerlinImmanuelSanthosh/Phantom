import { createServerFn } from "@tanstack/react-start";

export type CardInsightParams = {
  card_type: string;
  metric_label: string;
  current_value: string;
  status?: string;
  age?: number;
  gender?: string;
  height_cm?: number;
  weight_kg?: number;
  bmi?: number;
  bmi_category?: string;
  sugar?: number;
  bp_systolic?: number;
  bp_diastolic?: number;
  goal?: string;
  diet?: string;
  conditions?: string[];
};

export type CardInsightData = {
  card_type: string;
  metric_label: string;
  headline: string;
  tips: string[];
};

export const fetchCardInsight = createServerFn({ method: "POST" })
  .validator((data: CardInsightParams) => data)
  .handler(async (ctx) => {
    let d: any = ctx;
    if (d && typeof d === "object") {
      if (d.data && typeof d.data === "object") d = d.data;
      if (d.data && typeof d.data === "object") d = d.data;
    }
    const data: CardInsightParams = d || {};

    const metric_label = data?.metric_label || "Metric";
    const card_type = data?.card_type || "vital";

    const fallback: CardInsightData = {
      card_type,
      metric_label,
      headline: `Optimizing your ${metric_label}`,
      tips: [
        `Keep tracking your ${metric_label} regularly.`,
        "Maintain balanced daily sleep and hydration habits.",
        "Consult your doctor if you notice unusual variations.",
      ],
    };

    const backendUrls = [
      process.env["BACKEND_URL"],
      "http://127.0.0.1:8000",
      "http://localhost:8000",
    ].filter((u): u is string => Boolean(u));

    const payload: CardInsightParams = {
      card_type,
      metric_label,
      current_value: data?.current_value || "",
      status: data?.status,
      age: data?.age ?? 30,
      gender: data?.gender ?? "unspecified",
      height_cm: data?.height_cm,
      weight_kg: data?.weight_kg,
      bmi: data?.bmi,
      bmi_category: data?.bmi_category,
      sugar: data?.sugar,
      bp_systolic: data?.bp_systolic,
      bp_diastolic: data?.bp_diastolic,
      goal: data?.goal,
      diet: data?.diet,
      conditions: data?.conditions ?? [],
    };

    for (const baseUrl of backendUrls) {
      const endpoint = `${baseUrl}/api/dashboard/card-insight`;
      try {
        console.log(`[card-insight] Requesting Python backend: ${endpoint}`);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const json = await res.json();
          console.log(`[card-insight] Received response from Python backend:`, json);
          return {
            card_type: json.card_type ?? card_type,
            metric_label: json.metric_label ?? metric_label,
            headline: json.headline ?? `Betterment for ${metric_label}`,
            tips: (json.tips ?? []).slice(0, 3),
          };
        }
      } catch (err) {
        console.warn(`[card-insight] Backend ${baseUrl} error:`, err);
      }
    }

    return fallback;
  });
