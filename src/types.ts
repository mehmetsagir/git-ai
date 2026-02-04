export interface GitUserProfile {
  id: string;
  name: string;
  email: string;
  scope: "global" | "local" | "manual" | "current";
  label: string;
  shortcut?: string | null;
}

export interface Config {
  openaiKey?: string;
  gitUsers?: GitUserProfile[];
  defaultGitUser?: string | null;
  editor?: string | null;
}

export interface GitUserInfo {
  name: string | null;
  email: string | null;
}

export interface DiffData {
  staged: string;
  unstaged: string;
  all: string;
}

export interface FileInfo {
  file: string;
  status: "new" | "modified" | "deleted" | "renamed";
  isBinary: boolean;
  staged: boolean;
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
  files?: string[];  // Optional file list for backward compat
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
