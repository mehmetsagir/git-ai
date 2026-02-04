import simpleGit, { SimpleGit } from "simple-git";
import * as path from "path";
import { DiffData, FileInfo, GitUserInfo, GitUserProfile } from "./types";
import { getErrorMessage } from "./utils/errors";

function getGit(): SimpleGit {
  return simpleGit(process.cwd());
}

export async function isGitRepository(): Promise<boolean> {
  try {
    await getGit().status();
    return true;
  } catch {
    return false;
  }
}

export async function hasChanges(): Promise<boolean> {
  const status = await getGit().status();
  return status.files.length > 0;
}

export async function getChangedFiles(): Promise<FileInfo[]> {
  const status = await getGit().status();
  const files: FileInfo[] = [];
  const seen = new Set<string>();

  for (const f of status.files) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);

    let fileStatus: FileInfo["status"] = "modified";
    // Check if file has staged changes (index is not empty, not "?" untracked)
    const isStaged = f.index !== " " && f.index !== "?" && f.index !== "";
    // Check if file has unstaged changes
    const isUnstaged = f.working_dir !== " " && f.working_dir !== "";

    if (f.index === "?" || f.working_dir === "?") {
      fileStatus = "new";
    } else if (f.index === "A" && f.working_dir === " ") {
      fileStatus = "new";
    } else if (f.index === "D" || f.working_dir === "D") {
      fileStatus = "deleted";
    } else if (f.index === "R") {
      fileStatus = "renamed";
    }

    // If file has both staged and unstaged changes, create two entries
    if (isStaged && isUnstaged && f.index !== "?" && f.working_dir !== "?") {
      files.push({
        file: f.path,
        status: fileStatus,
        isBinary: isBinaryFile(f.path),
        staged: true,
      });
      files.push({
        file: f.path,
        status: fileStatus,
        isBinary: isBinaryFile(f.path),
        staged: false,
      });
    } else {
      files.push({
        file: f.path,
        status: fileStatus,
        isBinary: isBinaryFile(f.path),
        staged: isStaged,
      });
    }
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
  await getGit().add(files);
}

export async function stageFile(file: string): Promise<void> {
  await getGit().add([file]);
}

export async function unstageFile(file: string): Promise<void> {
  try {
    await getGit().reset(["HEAD", "--", file]);
  } catch {
    // Ignore if file not staged
  }
}

export async function unstageAll(): Promise<void> {
  try {
    await getGit().reset(["HEAD"]);
  } catch {
    // Ignore if nothing staged
  }
}

export async function createCommit(
  message: string,
  authorName?: string | null,
  authorEmail?: string | null
): Promise<void> {
  const options: Record<string, string> = {};
  if (authorName && authorEmail) {
    options["--author"] = `${authorName} <${authorEmail}>`;
  }
  await getGit().commit(message, options);
}

export async function getStagedFiles(): Promise<string[]> {
  const status = await getGit().status();
  return status.staged;
}

export async function getFullDiff(): Promise<string> {
  let diff = "";

  try {
    const unstaged = await getGit().diff();
    if (unstaged) diff = unstaged;
  } catch {
    // Ignore
  }

  try {
    const staged = await getGit().diff(["--cached"]);
    if (staged) {
      diff = diff ? diff + "\n" + staged : staged;
    }
  } catch {
    // Ignore
  }

  return diff;
}

export async function getStagedDiff(): Promise<string> {
  try {
    return await getGit().diff(["--cached"]);
  } catch {
    return "";
  }
}

export async function getUnstagedDiff(): Promise<string> {
  try {
    return await getGit().diff();
  } catch {
    return "";
  }
}

export interface StashEntry {
  index: number;
  hash: string;
  message: string;
  date: string;
  branch: string;
}

export async function getStashList(): Promise<StashEntry[]> {
  try {
    // Use git.raw for better compatibility
    const result = await getGit().raw(["stash", "list", "--format=%H|%s|%ci"]);
    if (!result || !result.trim()) return [];

    const lines = result.trim().split("\n");
    return lines.map((line, index) => {
      const [hash, message, date] = line.split("|");
      const branchMatch = message?.match(/^WIP on (.+?):|^On (.+?):/);
      const branch = branchMatch ? (branchMatch[1] || branchMatch[2]) : "unknown";

      return {
        index,
        hash: hash || "",
        message: message || "",
        date: date || "",
        branch
      };
    });
  } catch (err) {
    // Fallback: try without format
    try {
      const result = await getGit().raw(["stash", "list"]);
      if (!result || !result.trim()) return [];

      const lines = result.trim().split("\n");
      return lines.map((line, index) => {
        // Format: stash@{0}: WIP on branch: message
        const match = line.match(/^stash@\{\d+\}:\s*(.+)$/);
        const message = match ? match[1] : line;
        const branchMatch = message.match(/^WIP on (.+?):|^On (.+?):/);
        const branch = branchMatch ? (branchMatch[1] || branchMatch[2]) : "unknown";

        return {
          index,
          hash: "",
          message,
          date: "",
          branch
        };
      });
    } catch {
      return [];
    }
  }
}

export async function getStashDiff(index: number): Promise<string> {
  try {
    const result = await getGit().raw(["stash", "show", "-p", `stash@{${index}}`]);
    return result || "";
  } catch {
    return "";
  }
}

export async function getStashFiles(index: number): Promise<string[]> {
  try {
    const result = await getGit().raw(["stash", "show", "--name-only", `stash@{${index}}`]);
    if (!result) return [];
    return result.trim().split("\n").filter(f => f.trim());
  } catch {
    return [];
  }
}

export async function applyStash(index: number): Promise<void> {
  await getGit().raw(["stash", "apply", `stash@{${index}}`]);
}

export async function dropStash(index: number): Promise<void> {
  await getGit().raw(["stash", "drop", `stash@{${index}}`]);
}

export async function getGitUserInfo(): Promise<GitUserInfo> {
  try {
    const git = getGit();
    const [name, email] = await Promise.all([
      git
        .getConfig("user.name")
        .then((config) => config.value || null)
        .catch(() => null),
      git
        .getConfig("user.email")
        .then((config) => config.value || null)
        .catch(() => null),
    ]);

    return { name, email };
  } catch (error) {
    throw new Error(`Error getting git user info: ${getErrorMessage(error)}`);
  }
}

export async function getAllGitUserProfiles(): Promise<GitUserProfile[]> {
  try {
    const git = getGit();
    const profiles: GitUserProfile[] = [];

    // Global config
    try {
      const globalName = await git
        .getConfig("user.name", "global")
        .then((c) => c.value)
        .catch(() => null);
      const globalEmail = await git
        .getConfig("user.email", "global")
        .then((c) => c.value)
        .catch(() => null);
      if (globalName && globalEmail) {
        profiles.push({
          id: `global-${globalEmail}`,
          name: globalName,
          email: globalEmail,
          scope: "global",
          label: `${globalName} <${globalEmail}> (Global)`,
        });
      }
    } catch {
      // Continue if global config doesn't exist
    }

    // Local config
    try {
      const localName = await git
        .getConfig("user.name", "local")
        .then((c) => c.value)
        .catch(() => null);
      const localEmail = await git
        .getConfig("user.email", "local")
        .then((c) => c.value)
        .catch(() => null);
      if (localName && localEmail) {
        const isDuplicate = profiles.some(
          (p) => p.email === localEmail && p.name === localName
        );
        if (!isDuplicate) {
          profiles.push({
            id: `local-${localEmail}`,
            name: localName,
            email: localEmail,
            scope: "local",
            label: `${localName} <${localEmail}> (Local)`,
          });
        }
      }
    } catch {
      // Continue if local config doesn't exist
    }

    return profiles;
  } catch (error) {
    throw new Error(
      `Error getting git user profiles: ${getErrorMessage(error)}`
    );
  }
}

export async function setGitUser(
  name: string,
  email: string,
  scope: "global" | "local" = "local"
): Promise<boolean> {
  try {
    const git = getGit();
    await git.addConfig("user.name", name, scope === "global");
    await git.addConfig("user.email", email, scope === "global");
    return true;
  } catch (error) {
    throw new Error(`Error setting git user: ${getErrorMessage(error)}`);
  }
}

export async function getAllDiff(): Promise<DiffData> {
  try {
    const staged = await getStagedDiff();
    const unstaged = await getUnstagedDiff();

    return {
      staged,
      unstaged,
      all: `${staged}\n${unstaged}`.trim(),
    };
  } catch (error) {
    throw new Error(`Error getting diff: ${getErrorMessage(error)}`);
  }
}

export async function getAllChangedFiles(): Promise<string[]> {
  try {
    const status = await getGit().status();
    return [
      ...status.staged,
      ...status.not_added,
      ...status.modified,
      ...(status.deleted || []),
    ];
  } catch (error) {
    throw new Error(`Error getting changed files: ${getErrorMessage(error)}`);
  }
}

export async function resetFilesToHead(files: string[]): Promise<void> {
  try {
    await getGit().raw(["checkout", "HEAD", "--", ...files]);
  } catch (error) {
    throw new Error(`Error resetting files to HEAD: ${getErrorMessage(error)}`);
  }
}
