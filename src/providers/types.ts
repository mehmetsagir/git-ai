import { AnalysisResult } from "../types";

export interface IAIProvider {
  analyzeAndGroup(
    formattedDiff: string,
    stats: string
  ): Promise<AnalysisResult>;

  generateChangesSummary(
    diff: string
  ): Promise<{ summary: string | null }>;
}
