import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  mode: z.enum(["health", "food"]).default("health"),
  ingredients: z.array(z.string().max(60)).max(60).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(60),
  language: z.enum(["en", "ta"]).default("en"),
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
        const { mode, messages, ingredients, language } = parsed.data;
        const ctx = await profileContext(supabase, u.user.id);
        const backendUrls = [
          process.env["BACKEND_URL"],
          "http://127.0.0.1:8000",
          "http://localhost:8000",
        ].filter((url): url is string => Boolean(url));

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
          }
        }

        return new Response("The AI service is unavailable. Check the backend and its Groq configuration.", {
          status: 502,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
