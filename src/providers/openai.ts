import OpenAI from "openai";
import * as prompts from "../prompts";
import { AnalysisResult } from "../types";
import { IAIProvider } from "./types";

export class OpenAIProvider implements IAIProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async analyzeAndGroup(
    formattedDiff: string,
    stats: string
  ): Promise<AnalysisResult> {
    const response = await this.client.chat.completions.create({
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

  async generateChangesSummary(
    diff: string
  ): Promise<{ summary: string | null }> {
    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompts.getChangesSummarySystemPrompt() },
        { role: "user", content: prompts.getChangesSummaryUserPrompt(diff) },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { summary: null };
    }

    return JSON.parse(content) as { summary: string | null };
  }
}

export function createOpenAIProvider(apiKey: string): IAIProvider {
  return new OpenAIProvider(apiKey);
}
