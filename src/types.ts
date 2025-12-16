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

export interface AnalysisResult {
  groups: CommitGroup[];
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
