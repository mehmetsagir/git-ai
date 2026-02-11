import OpenAI from "openai";
import * as prompts from "../prompts";
import { AnalysisResult } from "../types";
import { IAIProvider } from "./types";

export class ZaiProvider implements IAIProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    // z.ai uses OpenAI-compatible API with GLM models
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.z.ai/api/paas/v4",
    });
  }

  async analyzeAndGroup(
    formattedDiff: string,
    stats: string
  ): Promise<AnalysisResult> {
    try {
      const systemPrompt = prompts.getSystemPrompt();
      const userPrompt = prompts.getUserPrompt(formattedDiff, stats);

      const response = await this.client.chat.completions.create({
        model: "GLM-4.7", // z.ai GLM-4.7 model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from z.ai");
      }

      return JSON.parse(content) as AnalysisResult;
    } catch (error: any) {
      console.error("z.ai Error Details:", error);
      throw new Error(`z.ai Error: ${error.message || error.toString()}`);
    }
  }

  async generateChangesSummary(
    diff: string
  ): Promise<{ summary: string | null }> {
    try {
      const systemPrompt = prompts.getChangesSummarySystemPrompt();
      const userPrompt = prompts.getChangesSummaryUserPrompt(diff);

      const response = await this.client.chat.completions.create({
        model: "GLM-4.7",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { summary: null };
      }

      return JSON.parse(content) as { summary: string | null };
    } catch (error: any) {
      console.error("z.ai Summary Error:", error);
      return { summary: null };
    }
  }
}

export function createZaiProvider(apiKey: string): IAIProvider {
  return new ZaiProvider(apiKey);
}
