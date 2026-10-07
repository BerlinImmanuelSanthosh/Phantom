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

export async function streamChat(body: Record<string, unknown>, onChunk: (full: string) => void, signal?: AbortSignal) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();

  // For food mode, try the dedicated foodmaker backend chat endpoint first
  if (body["mode"] === "food") {
    const backendUrls = ["http://127.0.0.1:8000", "http://localhost:8000"];
    const foodBody = {
      messages: body["messages"] ?? [],
      ingredients: body["ingredients"] ?? [],
      profile_context: body["profile_context"] ?? "",
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

  // Default: all modes (including food fallback) go through TanStack /api/chat
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok || !res.body) {
    throw new Error(res.status === 402 ? "AI credits have run out for this workspace." : res.status === 429 ? "Too many requests — please wait a moment." : "Phantom couldn't reply right now.");
  }
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


export const EMERGENCY_RE = /(chest pain|can'?t breathe|cannot breathe|breathless|shortness of breath|heart attack|stroke|fainted|unconscious|severe bleeding|suicid|kill myself|seizure)/i;
