/**
 * @deprecated This module is deprecated. Use src/providers/openai.ts instead.
 * Kept for backward compatibility only.
 */

import { AnalysisResult } from "./types";
import { createOpenAIProvider } from "./providers/openai";

/**
 * @deprecated Use createOpenAIProvider from ./providers/openai instead
 */
export async function analyzeAndGroup(
  formattedDiff: string,
  stats: string,
  apiKey: string
): Promise<AnalysisResult> {
  const provider = createOpenAIProvider(apiKey);
  return provider.analyzeAndGroup(formattedDiff, stats);
}

/**
 * @deprecated Use createOpenAIProvider from ./providers/openai instead
 */
export async function generateChangesSummary(
  diff: string,
  apiKey: string
): Promise<{ summary: string | null }> {
  const provider = createOpenAIProvider(apiKey);
  return provider.generateChangesSummary(diff);
}
