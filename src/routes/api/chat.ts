import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  mode: z.enum(["health", "food"]).default("health"),
  ingredients: z.array(z.string().max(60)).max(60).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(60),
  language: z.enum(["en", "ta"]).default("en"),
  prescription_context: z.string().optional(),
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
        const { mode, messages, ingredients, language, prescription_context } = parsed.data;
        const ctx = await profileContext(supabase, u.user.id);
        const system =
          mode === "food"
            ? `You are Phantom's kitchen assistant. ${ctx}\nAvailable ingredients: ${(ingredients ?? []).join(", ") || "unknown"}.\nGive short, practical cooking advice that respects the diet, allergies, conditions (e.g. high sugar → low glycemic) and goal. Use markdown, keep it under 150 words. Do NOT output any markdown tables or use the '|' character.`
            : `You are Phantom, a warm, careful personal AI health assistant. ${ctx}\nUse this context to personalise every answer. Be concise, use markdown lists when helpful. You are not a doctor: for anything serious recommend a professional. If the user describes an emergency (chest pain, breathlessness, stroke signs, severe bleeding, fainting, suicidal thoughts) tell them to call emergency services or their emergency contact immediately. Do NOT output any markdown tables or use the '|' character.`;
        try {
          const backendUrls = [
            process.env["BACKEND_URL"],
            "http://127.0.0.1:8000",
            "http://localhost:8000",
          ].filter(Boolean) as string[];

<<<<<<< HEAD
        for (const baseUrl of backendUrls) {
          try {
            const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/chat/stream`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode,
                messages,
                ingredients: ingredients ?? [],
                profile_context: ctx,
                language,
                prescription_context,
              }),
              signal: request.signal,
            });
            if (response.ok && response.body) return response;
            console.error(
              `[/api/chat] Groq backend returned ${response.status} from ${baseUrl}`,
            );
          } catch (error) {
            if (request.signal.aborted) throw error;
            console.warn(`[/api/chat] Groq backend unavailable at ${baseUrl}:`, error);
=======
          for (const baseUrl of backendUrls) {
            try {
              const res = await fetch(`${baseUrl}/api/chat/stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode, messages, ingredients: ingredients || [], profile_context: ctx }),
                signal: request.signal,
              });
              if (res.ok && res.body) {
                return new Response(res.body, {
                  headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "X-Accel-Buffering": "no",
                    "Cache-Control": "no-cache",
                    "Transfer-Encoding": "chunked",
                  },
                });
              }
            } catch (err) {}
>>>>>>> 785dbb53d5bafaea1b96034275774c46c2404c57
          }
          
          const { streamTextResponse } = await import("@/lib/ai/gateway.server");
          return streamTextResponse(messages, system, request.signal);
        } catch (e) {
          console.error("[/api/chat] AI stream error:", e);
          const fallbackText =
            mode === "food"
              ? `I am your kitchen assistant! You currently have ingredients: ${(ingredients ?? []).join(", ") || "none specified"}. Add ingredients to your fridge list above to generate custom authentic Indian recipes!`
              : `Hello! I am Phantom, your personal AI health assistant. Please configure your LOVABLE_API_KEY or Groq API keys in backend/.env for AI response generation.`;
          return new Response(fallbackText, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }

        return new Response("The AI service is unavailable. Check the backend and its Groq configuration.", {
          status: 502,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
