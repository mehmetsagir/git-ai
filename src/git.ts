import simpleGit, { SimpleGit } from "simple-git";
import * as fs from "fs";
import * as path from "path";
import { DiffData, GitUserInfo, GitUserProfile } from "./types";
import { getErrorMessage } from "./utils/errors";

/**
 * Create git repository instance
 */
function getGitInstance(repoPath: string = process.cwd()): SimpleGit {
  return simpleGit(repoPath);
}

/**
 * Get staged changes
 */
export async function getStagedDiff(): Promise<string> {
  try {
    const git = getGitInstance();
    const diff = await git.diff(["--cached"]);
    return diff;
  } catch (error) {
    throw new Error(`Error getting staged diff: ${getErrorMessage(error)}`);
  }
}

/**
 * Get diff for a new (untracked) file
 */
function getNewFileDiff(filePath: string): string {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      return "";
    }
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split("\n");
    const diffLines = lines.map((line) => `+${line}`);
    return `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/${filePath}\n${diffLines.join("\n")}`;
  } catch (error) {
    return "";
  }
}

/**
 * Get unstaged changes (including new files)
 */
export async function getUnstagedDiff(): Promise<string> {
  try {
    const git = getGitInstance();
    const status = await git.status();
    
    // Get diff for tracked modified files
    const trackedDiff = await git.diff();
    
    // Get diff for new (untracked) files
    const newFiles = status.not_added || [];
    const newFilesDiff = newFiles
      .map((file) => getNewFileDiff(file))
      .filter((diff) => diff.length > 0)
      .join("\n\n");
    
    if (trackedDiff && newFilesDiff) {
      return `${trackedDiff}\n\n${newFilesDiff}`;
    }
    return trackedDiff || newFilesDiff;
  } catch (error) {
    throw new Error(`Error getting unstaged diff: ${getErrorMessage(error)}`);
  }
}

/**
 * Get all changes (staged + unstaged, including new files)
 */
export async function getAllDiff(): Promise<DiffData> {
  try {
    const git = getGitInstance();
    const status = await git.status();
    
    // Get staged diff
    const staged = await getStagedDiff();
    
    // Get unstaged diff (includes new files)
    const unstaged = await getUnstagedDiff();
    
    // Also check for new files in staged area
    // New files are those in not_added that might have been staged
    const stagedNewFiles: string[] = [];
    const allNewFiles = status.not_added || [];
    const stagedFiles = status.staged || [];
    
    // Check if any new files are also in staged (shouldn't happen, but check anyway)
    for (const file of stagedFiles) {
      if (allNewFiles.includes(file)) {
        stagedNewFiles.push(file);
      }
    }
    
    let stagedWithNew = staged;
    if (stagedNewFiles.length > 0) {
      const stagedNewFilesDiff = stagedNewFiles
        .map((file) => getNewFileDiff(file))
        .filter((diff) => diff.length > 0)
        .join("\n\n");
      if (stagedNewFilesDiff) {
        stagedWithNew = staged ? `${staged}\n\n${stagedNewFilesDiff}` : stagedNewFilesDiff;
      }
    }
    
    return {
      staged: stagedWithNew,
      unstaged,
      all: `${stagedWithNew}\n${unstaged}`.trim(),
    };
  } catch (error) {
    throw new Error(`Error getting diff: ${getErrorMessage(error)}`);
  }
}

/**
 * Check if there are changes
 */
export async function hasChanges(): Promise<boolean> {
  try {
    const git = getGitInstance();
    const status = await git.status();
    return status.files.length > 0;
  } catch (error) {
    throw new Error(`Error checking for changes: ${getErrorMessage(error)}`);
  }
}

/**
 * Get git user info (global and local)
 */
export async function getGitUserInfo(): Promise<GitUserInfo> {
  try {
    const git = getGitInstance();
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

/**
 * Collect user profiles from all git configs
 */
export async function getAllGitUserProfiles(): Promise<GitUserProfile[]> {
  try {
    const git = getGitInstance();
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
    } catch (e) {
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
    } catch (e) {
      // Continue if local config doesn't exist
    }

    return profiles;
  } catch (error) {
    throw new Error(
      `Error getting git user profiles: ${getErrorMessage(error)}`
    );
  }
}

/**
 * Set git user
 */
export async function setGitUser(
  name: string,
  email: string,
  scope: "global" | "local" = "local"
): Promise<boolean> {
  try {
    const git = getGitInstance();
    await git.addConfig("user.name", name, scope === "global");
    await git.addConfig("user.email", email, scope === "global");
    return true;
  } catch (error) {
    throw new Error(`Error setting git user: ${getErrorMessage(error)}`);
  }
}

/**
 * Stage files
 */
export async function stageFiles(files: string[]): Promise<boolean> {
  try {
    const git = getGitInstance();
    await git.add(files);
    return true;
  } catch (error) {
    throw new Error(`Error staging files: ${getErrorMessage(error)}`);
  }
}

/**
 * Unstage all staged files
 */
export async function unstageAll(): Promise<boolean> {
  try {
    const git = getGitInstance();
    await git.reset();
    return true;
  } catch (error) {
    throw new Error(`Error unstaging: ${getErrorMessage(error)}`);
  }
}

/**
 * Create commit
 */
export async function createCommit(
  message: string,
  authorName: string | null = null,
  authorEmail: string | null = null
): Promise<boolean> {
  try {
    const git = getGitInstance();
    const options: Record<string, string> = {};
    if (authorName && authorEmail) {
      options["--author"] = `${authorName} <${authorEmail}>`;
    }
    await git.commit(message, options);
    return true;
  } catch (error) {
    throw new Error(`Error creating commit: ${getErrorMessage(error)}`);
  }
}

/**
 * List staged files
 */
export async function getStagedFiles(): Promise<string[]> {
  try {
    const git = getGitInstance();
    const status = await git.status();
    return status.staged;
  } catch (error) {
    throw new Error(`Error getting staged files: ${getErrorMessage(error)}`);
  }
}

/**
 * List all changed files
 */
export async function getAllChangedFiles(): Promise<string[]> {
  try {
    const git = getGitInstance();
    const status = await git.status();
    return [...status.staged, ...status.not_added, ...status.modified];
  } catch (error) {
    throw new Error(`Error getting changed files: ${getErrorMessage(error)}`);
  }
}

/**
 * Check if git repository
 */
export async function isGitRepository(): Promise<boolean> {
  try {
    const git = getGitInstance();
    await git.status();
    return true;
  } catch (error) {
    return false;
  }
}
