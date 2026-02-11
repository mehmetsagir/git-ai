import { AIProvider } from "../types";
import { IAIProvider } from "./types";
import { createOpenAIProvider } from "./openai";
import { createGeminiProvider } from "./gemini";
import { createZaiProvider } from "./zai";

export function createAIProvider(
  provider: AIProvider,
  apiKey: string
): IAIProvider {
  switch (provider) {
    case "openai":
      return createOpenAIProvider(apiKey);
    case "gemini":
      return createGeminiProvider(apiKey);
    case "zai":
      return createZaiProvider(apiKey);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export * from "./types";
