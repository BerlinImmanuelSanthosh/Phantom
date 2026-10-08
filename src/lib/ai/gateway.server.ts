import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

export const PHANTOM_MODEL = "openai/gpt-6-astra";

// ─────────────────────────────────────────────────────────────────────────────
// Offline fallback: local Ollama, reached through its OpenAI-compatible API.
// Optional overrides in the root .env:
//   OLLAMA_URL           default http://localhost:11434
//   OLLAMA_MODEL         default medical-bot:latest
//   OLLAMA_VISION_MODEL  a local model that can read images (no default)
// ─────────────────────────────────────────────────────────────────────────────
function localConfig() {
  return {
    url: (process.env["OLLAMA_URL"] ?? "http://localhost:11434").replace(/\/+$/, ""),
    model: process.env["OLLAMA_MODEL"] ?? "medical-bot:latest",
    visionModel: process.env["OLLAMA_VISION_MODEL"] || undefined,
  };
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

type AnyPart = { type: string; mediaType?: string };

function mediaKinds(messages: ModelMessage[]) {
  const parts = messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as AnyPart[]) : []));
  return {
    hasPdf: parts.some((p) => p.type === "file" && p.mediaType === "application/pdf"),
    hasMedia: parts.some((p) => p.type === "image" || p.type === "file"),
  };
}

/** Cloud (Lovable AI Gateway) call. */
function runCloud(messages: ModelMessage[], system?: string, signal?: AbortSignal, overrideModel?: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured");
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  return streamText({
    model: provider.responses(overrideModel || PHANTOM_MODEL),
    ...(system ? { system } : {}),
    messages,
    ...(signal ? { abortSignal: signal } : {}),
    maxRetries: 1,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });
}

/** Local Ollama call (chat completions API, no cloud-only options). */
function runLocal(messages: ModelMessage[], model: string, system?: string) {
  const provider = createOpenAI({ baseURL: `${localConfig().url}/v1`, apiKey: "ollama" });
  return streamText({
    model: provider.chat(model),
    ...(system ? { system } : {}),
    messages,
    maxRetries: 0,
  });
}

/**
 * Returns the final text. Tries the cloud first; if that fails for any reason
 * (offline, key missing, service error) it falls back to the local Ollama model.
 * If both fail, throws one clear error.
 */
export async function generateTextStreamed(messages: ModelMessage[], system?: string, overrideModel?: string) {
  try {
    return await runCloud(messages, system, undefined, overrideModel).text;
  } catch (cloudError) {
    console.warn("[ai-gateway] Cloud AI failed, trying local Ollama:", errorText(cloudError));
  }

  const { model, visionModel } = localConfig();
  const { hasPdf, hasMedia } = mediaKinds(messages);

  // Never let a text-only local model "read" a prescription or fridge photo: it would invent an answer.
  if (hasPdf) {
    throw new Error("AI is unavailable. PDFs can only be read with an internet connection.");
  }
  if (hasMedia && !visionModel) {
    throw new Error(
      "AI is unavailable. Reading images needs an internet connection (or a local vision model set as OLLAMA_VISION_MODEL).",
    );
  }

  const localModel = hasMedia && visionModel ? visionModel : model;
  try {
    return await runLocal(messages, localModel, system).text;
  } catch (localError) {
    console.error(`[ai-gateway] Local Ollama (${localModel}) failed:`, errorText(localError));
    throw new Error(
      `AI is unavailable. The cloud AI could not be reached and the local model (${localModel}) did not respond. Check your internet connection or start Ollama.`,
    );
  }
}

/** Returns a plain-text streaming Response (cloud only; streams cannot be retried once started). */
export function streamTextResponse(messages: ModelMessage[], system: string, signal?: AbortSignal) {
  return runCloud(messages, system, signal).toTextStreamResponse();
}

export function extractJson<T>(text: string): T {
  const s = text.search(/[[{]/);
  const e = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return JSON.parse(text.slice(s, e + 1)) as T;
}
