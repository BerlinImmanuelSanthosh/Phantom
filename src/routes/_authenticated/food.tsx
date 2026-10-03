import { createFileRoute } from "@tanstack/react-router";
import { ChefHat } from "lucide-react";
import { ComingNext } from "@/components/phantom/ComingNext";

export const Route = createFileRoute("/_authenticated/food")({
  head: () => ({
    meta: [
      { title: "Food Maker — Phantom" },
      { name: "description", content: "Turn your fridge into recipes that fit your health goal." },
      { property: "og:title", content: "Food Maker — Phantom" },
      { property: "og:description", content: "Turn your fridge into recipes that fit your health goal." },
    ],
  }),
  component: () => (
    <ComingNext icon={ChefHat} title="Food Maker" text="Snap your fridge and Phantom will suggest recipes that match your goal and diet."
      points={["Ingredient detection from a photo", "3–4 personalised recipes", "Step-by-step cooking mode", "Log meals to your calorie ring"]} />
  ),
});
