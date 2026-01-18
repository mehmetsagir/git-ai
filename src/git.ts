import simpleGit from "simple-git";
import * as fs from "fs";
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

// Get all changed files with their status
export async function getChangedFiles(): Promise<FileInfo[]> {
  const status = await git.status();
  const files: FileInfo[] = [];
  const seen = new Set<string>();

  // Process all files from status
  for (const f of status.files) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);

    let fileStatus: FileInfo["status"] = "modified";

    // Determine status
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

// Get diff for AI analysis (read-only, no file modifications)
export async function getDiffForAnalysis(): Promise<string> {
  const status = await git.status();
  let diff = "";

  // Get tracked file changes
  try {
    const trackedDiff = await git.diff(["--no-renames"]);
    if (trackedDiff) diff = trackedDiff;
  } catch {
    // Ignore diff errors
  }

  // Get staged changes
  try {
    const stagedDiff = await git.diff(["--cached", "--no-renames"]);
    if (stagedDiff) {
      diff = diff ? diff + "\n\n" + stagedDiff : stagedDiff;
    }
  } catch {
    // Ignore diff errors
  }

  // Add info for untracked files
  for (const file of status.not_added || []) {
    const binary = isBinaryFile(file);
    if (binary) {
      diff += `\n\n[NEW BINARY FILE] ${file}`;
    } else {
      diff += `\n\n[NEW FILE] ${file}`;
      // Add file content preview (first 50 lines)
      try {
        const content = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
        const lines = content.split("\n").slice(0, 50);
        diff += "\n" + lines.map((l) => `+${l}`).join("\n");
        if (content.split("\n").length > 50) {
          diff += "\n+... (truncated)";
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  // Add info for deleted files
  for (const file of status.deleted || []) {
    diff += `\n\n[DELETED FILE] ${file}`;
  }

  return diff;
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

// Stage specific files
export async function stageFiles(files: string[]): Promise<void> {
  if (files.length === 0) return;
  await git.add(files);
}

// Unstage all files
export async function unstageAll(): Promise<void> {
  try {
    await git.reset(["HEAD"]);
  } catch {
    // Ignore if nothing staged
  }
}

// Create commit with staged files
export async function createCommit(message: string): Promise<void> {
  await git.commit(message);
}

// Check if files are staged
export async function hasStagedFiles(): Promise<boolean> {
  const status = await git.status();
  return status.staged.length > 0;
}

// Get list of staged files
export async function getStagedFiles(): Promise<string[]> {
  const status = await git.status();
  return status.staged;
}

// Get full diff output for hunk parsing
export async function getFullDiff(): Promise<string> {
  let diff = "";

  // Get unstaged changes
  try {
    const unstaged = await git.diff();
    if (unstaged) diff = unstaged;
  } catch {
    // Ignore
  }

  // Get staged changes
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

// Apply a patch using git apply
export async function applyPatch(patchContent: string): Promise<void> {
  const tmpFile = path.join(process.cwd(), ".git", "tmp-patch.patch");

  try {
    // Write patch to temp file
    fs.writeFileSync(tmpFile, patchContent);

    // Apply the patch
    await git.raw(["apply", "--cached", tmpFile]);
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Stash all changes
export async function stashChanges(): Promise<boolean> {
  try {
    const result = await git.stash(["push", "-u", "-m", "git-ai-temp"]);
    return !result.includes("No local changes");
  } catch {
    return false;
  }
}

// Pop stashed changes
export async function popStash(): Promise<void> {
  try {
    await git.stash(["pop"]);
  } catch {
    // Ignore if no stash
  }
}

// Reset staged changes (keep working directory)
export async function resetStaged(): Promise<void> {
  try {
    await git.reset(["HEAD"]);
  } catch {
    // Ignore
  }
}

// Checkout file to discard changes
export async function checkoutFile(file: string): Promise<void> {
  try {
    await git.checkout([file]);
  } catch {
    // Ignore
  }
}
