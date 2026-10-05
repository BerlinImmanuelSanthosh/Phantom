import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

export const PHANTOM_MODEL = "openai/gpt-6-astra";

function run(messages: ModelMessage[], system?: string, signal?: AbortSignal) {
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
    model: provider.responses(PHANTOM_MODEL),
    ...(system ? { system } : {}),
    messages,
    ...(signal ? { abortSignal: signal } : {}),
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

/** Streams a Responses call server-side and returns the final text. */
export async function generateTextStreamed(messages: ModelMessage[], system?: string) {
  return await run(messages, system).text;
}

/** Returns a plain-text streaming Response. */
export function streamTextResponse(messages: ModelMessage[], system: string, signal?: AbortSignal) {
  return run(messages, system, signal).toTextStreamResponse();
}

export function extractJson<T>(text: string): T {
  const s = text.search(/[[{]/);
  const e = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return JSON.parse(text.slice(s, e + 1)) as T;
}
