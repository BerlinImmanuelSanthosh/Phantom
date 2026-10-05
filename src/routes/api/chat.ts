import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  mode: z.enum(["health", "food"]).default("health"),
  ingredients: z.array(z.string().max(60)).max(60).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(60),
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { userClient, profileContext } = await import("@/lib/ai/context.server");
        const supabase = userClient(token);
        const { data: u, error } = await supabase.auth.getUser(token);
        if (error || !u.user) return new Response("Unauthorized", { status: 401 });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });
        const { mode, messages, ingredients } = parsed.data;
        const ctx = await profileContext(supabase, u.user.id);
        const system =
          mode === "food"
            ? `You are Phantom's kitchen assistant. ${ctx}\nAvailable ingredients: ${(ingredients ?? []).join(", ") || "unknown"}.\nGive short, practical cooking advice that respects the diet, allergies, conditions (e.g. high sugar → low glycemic) and goal. Use markdown, keep it under 150 words.`
            : `You are Phantom, a warm, careful personal AI health assistant. ${ctx}\nUse this context to personalise every answer. Be concise, use markdown lists when helpful. You are not a doctor: for anything serious recommend a professional. If the user describes an emergency (chest pain, breathlessness, stroke signs, severe bleeding, fainting, suicidal thoughts) tell them to call emergency services or their emergency contact immediately.`;
        const { streamTextResponse } = await import("@/lib/ai/gateway.server");
        try {
          return streamTextResponse(messages, system, request.signal);
        } catch (e) {
          console.error(e);
          return new Response("AI unavailable", { status: 500 });
        }
      },
    },
  },
});
