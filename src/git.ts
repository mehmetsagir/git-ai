import simpleGit from "simple-git";
import * as path from "path";
import { FileInfo } from "./types";

const git = simpleGit(process.cwd());

export async function isGitRepository(): Promise<boolean> {
  try {
    await git.status();
    return true;
  } catch {
    return false;
  }
}

export async function hasChanges(): Promise<boolean> {
  const status = await git.status();
  return status.files.length > 0;
}

export async function getChangedFiles(): Promise<FileInfo[]> {
  const status = await git.status();
  const files: FileInfo[] = [];
  const seen = new Set<string>();

  for (const f of status.files) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);

    let fileStatus: FileInfo["status"] = "modified";

    if (f.index === "?" || f.index === "A" || f.working_dir === "?") {
      fileStatus = "new";
    } else if (f.index === "D" || f.working_dir === "D") {
      fileStatus = "deleted";
    } else if (f.index === "R") {
      fileStatus = "renamed";
    }

    files.push({
      file: f.path,
      status: fileStatus,
      isBinary: isBinaryFile(f.path),
    });
  }

  return files;
}

function isBinaryFile(filePath: string): boolean {
  const binaryExtensions = [
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg", ".tiff",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".webm", ".ogg",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".dat",
  ];
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.includes(ext);
}

export async function stageFiles(files: string[]): Promise<void> {
  if (files.length === 0) return;
  await git.add(files);
}

export async function unstageAll(): Promise<void> {
  try {
    await git.reset(["HEAD"]);
  } catch {
    // Ignore if nothing staged
  }
}

export async function createCommit(message: string): Promise<void> {
  await git.commit(message);
}

export async function getStagedFiles(): Promise<string[]> {
  const status = await git.status();
  return status.staged;
}

export async function getFullDiff(): Promise<string> {
  let diff = "";

  try {
    const unstaged = await git.diff();
    if (unstaged) diff = unstaged;
  } catch {
    // Ignore
  }

  try {
    const staged = await git.diff(["--cached"]);
    if (staged) {
      diff = diff ? diff + "\n" + staged : staged;
    }
  } catch {
    // Ignore
  }

  return diff;
}
