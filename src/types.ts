export interface FileInfo {
  file: string;
  status: "new" | "modified" | "deleted" | "renamed";
  isBinary: boolean;
}

// Hunk identifier for grouping
export interface HunkRef {
  file: string;
  hunkIndex: number;
}

// Commit group with hunk-level granularity
export interface CommitGroup {
  number: number;
  description: string;
  hunks: HunkRef[];  // Which hunks to include
  commitMessage: string;
  commitBody?: string;
}

export interface AnalysisResult {
  groups: CommitGroup[];
}

export interface CommitResult {
  group: number;
  message: string;
  hunks: HunkRef[];
  success: boolean;
  error?: string;
}
