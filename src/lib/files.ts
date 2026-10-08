/** Reads a file as a data URL; images are downscaled to keep uploads small. */
export async function fileToPayload(file: File): Promise<{ dataUrl: string; mediaType: string }> {
  if (file.type === "application/pdf") {
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    return { dataUrl, mediaType: "application/pdf" };
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL("image/jpeg", 0.85), mediaType: "image/jpeg" };
}

export type Language = "en" | "ta";

/** The user's language preference (English or Tamil), kept in this browser so it also works offline. */
export function getLanguage(): Language {
  try {
    return localStorage.getItem("phantom-language") === "ta" ? "ta" : "en";
  } catch {
    return "en";
  }
}

export function setLanguage(lang: Language) {
  try {
    localStorage.setItem("phantom-language", lang);
  } catch {
    // storage unavailable: the preference just won't persist
  }
}

/** Reads a plain-text streaming body, reporting the full text so far after every chunk. */
async function readTextStream(stream: ReadableStream<Uint8Array>, onChunk: (full: string) => void) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    onChunk(full);
  }
  return full;
}

export async function streamChat(body: Record<string, unknown>, onChunk: (full: string) => void, signal?: AbortSignal) {
  const { supabase } = await import("@/integrations/supabase/client");
  const language = getLanguage();

  // For food mode, try the dedicated foodmaker backend chat endpoint first
  if (body["mode"] === "food") {
    const backendUrls = ["http://127.0.0.1:8000", "http://localhost:8000"];
    const foodBody = {
      messages: body["messages"] ?? [],
      ingredients: body["ingredients"] ?? [],
      profile_context: body["profile_context"] ?? "",
      language,
    };
    for (const baseUrl of backendUrls) {
      try {
        const res = await fetch(`${baseUrl}/api/foodmaker/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(foodBody),
          ...(signal ? { signal } : {}),
        });
        if (res.ok && res.body) {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let full = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            full += dec.decode(value, { stream: true });
            onChunk(full);
          }
          return full;
        }
      } catch {
        // backend not available, fall through to TanStack route
      }
    }
  }

  // Default: all modes go through TanStack /api/chat (adds your saved profile; needs the login check).
  // Skipped when the browser is offline. If it fails, talk to the local backend directly, as food mode does.
  let stop: Error | null = null;
  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ ...body, language }),
        ...(signal ? { signal } : {}),
      });
      if (res.ok && res.body) return await readTextStream(res.body, onChunk);
      if (res.status === 402 || res.status === 429) {
        stop = new Error(res.status === 402 ? "AI credits have run out for this workspace." : "Too many requests — please wait a moment.");
      }
    } catch (e) {
      if (signal?.aborted) throw e;
    }
    if (stop) throw stop;
  }

  for (const baseUrl of ["http://127.0.0.1:8000", "http://localhost:8000"]) {
    try {
      const res = await fetch(`${baseUrl}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: body["mode"] ?? "health",
          messages: body["messages"] ?? [],
          ingredients: body["ingredients"] ?? [],
          profile_context: body["profile_context"] ?? "",
          prescription_context: body["prescription_context"] ?? "",
          language,
        }),
        ...(signal ? { signal } : {}),
      });
      if (res.ok && res.body) return await readTextStream(res.body, onChunk);
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  throw new Error("Phantom couldn't reply right now.");
}


export const EMERGENCY_RE = /(chest pain|can'?t breathe|cannot breathe|breathless|shortness of breath|heart attack|stroke|fainted|unconscious|severe bleeding|suicid|kill myself|seizure)/i;
