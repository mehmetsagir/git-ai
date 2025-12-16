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

export interface DiffData {
  staged: string;
  unstaged: string;
  all: string;
}

export interface CommitGroup {
  number: number;
  description: string;
  files: string[];
  commitMessage: string;
  commitBody?: string;
}

/**
 * Hunk-based commit group for smart commit splitting
 * Allows splitting changes within a single file into multiple commits
 */
export interface HunkIdentifier {
  file: string;
  hunkIndex: number; // Index of hunk within file's hunks array
}

export interface HunkCommitGroup {
  number: number;
  description: string;
  hunks: HunkIdentifier[]; // References to specific hunks
  commitMessage: string;
  commitBody?: string;
}

export interface AnalysisResult {
  groups: CommitGroup[];
  summary?: string;
}

export interface HunkAnalysisResult {
  groups: HunkCommitGroup[];
  summary?: string;
}

export interface CommitResult {
  group: number;
  message: string;
  files: number;
  success: boolean;
  error?: string;
}

export interface GitUserInfo {
  name: string | null;
  email: string | null;
}
