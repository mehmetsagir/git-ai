import { GoogleGenerativeAI } from "@google/generative-ai";
import * as prompts from "../prompts";
import { AnalysisResult } from "../types";
import { IAIProvider } from "./types";

export class GeminiProvider implements IAIProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async analyzeAndGroup(
    formattedDiff: string,
    stats: string
  ): Promise<AnalysisResult> {
    const model = this.client.getGenerativeModel({
      model: "gemini-3-flash-preview",
    });

    const systemPrompt = prompts.getSystemPrompt();
    const userPrompt = prompts.getUserPrompt(formattedDiff, stats);

    // Combine system and user prompts for Gemini
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}\n\nRespond ONLY with valid JSON, no markdown formatting.`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: combinedPrompt }] }],
      generationConfig: {
        temperature: 0.3,
      },
    });

    const response = result.response;
    const content = response.text();

    if (!content) {
      throw new Error("No response from Gemini");
    }

    // Clean up response (remove markdown code blocks if present)
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.replace(/^```json\n/, "").replace(/\n```$/, "");
    } else if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent.replace(/^```\n/, "").replace(/\n```$/, "");
    }

    return JSON.parse(cleanContent) as AnalysisResult;
  }

  async generateChangesSummary(
    diff: string
  ): Promise<{ summary: string | null }> {
    const model = this.client.getGenerativeModel({
      model: "gemini-3-flash-preview",
    });

    const systemPrompt = prompts.getChangesSummarySystemPrompt();
    const userPrompt = prompts.getChangesSummaryUserPrompt(diff);

    // Combine system and user prompts for Gemini
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}\n\nRespond ONLY with valid JSON, no markdown formatting.`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: combinedPrompt }] }],
      generationConfig: {
        temperature: 0.3,
      },
    });

    const response = result.response;
    const content = response.text();

    if (!content) {
      return { summary: null };
    }

    // Clean up response (remove markdown code blocks if present)
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.replace(/^```json\n/, "").replace(/\n```$/, "");
    } else if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent.replace(/^```\n/, "").replace(/\n```$/, "");
    }

    return JSON.parse(cleanContent) as { summary: string | null };
  }
}

export function createGeminiProvider(apiKey: string): IAIProvider {
  return new GeminiProvider(apiKey);
}
