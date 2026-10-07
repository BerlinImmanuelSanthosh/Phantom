import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  image: z.string(),
});

export const Route = createFileRoute("/api/vision/tablet")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Support either VITE_GROQ_API_KEY or GROQ_API_KEY
        const apiKey = import.meta.env["VITE_GROQ_API_KEY"] || process.env["VITE_GROQ_API_KEY"] || import.meta.env["GROQ_API_KEY"] || process.env["GROQ_API_KEY"];
        if (!apiKey) return new Response("Groq API key not configured. Please add VITE_GROQ_API_KEY to your .env file.", { status: 500 });
        
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        
        const { userClient } = await import("@/lib/ai/context.server");
        const supabase = userClient(token);
        const { data: u, error } = await supabase.auth.getUser(token);
        if (error || !u.user) return new Response("Unauthorized", { status: 401 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });
        
        let base64Image = parsed.data.image;
        if (!base64Image.startsWith("data:image")) {
          base64Image = `data:image/jpeg;base64,${base64Image}`;
        }

        const systemPrompt = `You are a medical data extraction assistant. Extract ALL medicines from the provided prescription image. Return ONLY a valid JSON array matching this exact schema, with NO markdown blocks (\`\`\`json) or other text:
[
  {
    "name": "string (name of the medicine)",
    "dosage": "string (e.g. 500mg, 10ml, etc)",
    "times": "string (suggested times like '09:00' for morning, '09:00, 21:00' for twice a day, default to '09:00' if unknown)",
    "meal": "string (either 'before' or 'after' food, default to 'after')",
    "stock": "string (total pills/doses in the box, e.g. '30', default to '30' if not visible)"
  }
]`;

        try {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "llama-3.2-90b-vision-preview",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: systemPrompt },
                    { type: "image_url", image_url: { url: base64Image } }
                  ]
                }
              ],
              temperature: 0,
            })
          });

          if (!res.ok) {
            const err = await res.text();
            console.error("Groq API error:", err);
            return new Response(`Groq API Error: ${res.statusText}`, { status: 500 });
          }

          const data = await res.json();
          const content = data.choices[0].message.content;
          
          let jsonStr = content;
          const match = content.match(/\[[\s\S]*\]/);
          if (match) {
            jsonStr = match[0];
          }
          
          const jsonArray = JSON.parse(jsonStr);
          return new Response(JSON.stringify(jsonArray), { headers: { "Content-Type": "application/json" } });
        } catch (e: any) {
          console.error("Vision extraction failed:", e);
          return new Response(e.message || "Vision extraction failed", { status: 500 });
        }
      },
    },
  },
});
