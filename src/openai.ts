import OpenAI from "openai";
import * as prompts from "./prompts";
import { AnalysisResult } from "./types";

export async function analyzeAndGroup(
  formattedDiff: string,
  stats: string,
  apiKey: string
): Promise<AnalysisResult> {
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: prompts.getSystemPrompt() },
      { role: "user", content: prompts.getUserPrompt(formattedDiff, stats) },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  return JSON.parse(content) as AnalysisResult;
}
