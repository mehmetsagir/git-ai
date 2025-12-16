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
 * Get staged changes (including deleted files)
 */
export async function getStagedDiff(): Promise<string> {
  try {
    const git = getGitInstance();
    const status = await git.status();
    
    // Get standard staged diff (should include deletions, but ensure with --diff-filter)
    const diff = await git.diff([
      "--cached",
      "--no-renames",
      "--diff-filter=ACDMRT", // Include Added, Copied, Deleted, Modified, Renamed, Type-changed
    ]);
    
    // Also explicitly get staged deleted files and ensure they're in the diff
    const stagedDeleted = (status.deleted || []).filter((file) => {
      // Check if file is in staged files
      return status.staged.includes(file);
    });
    
    // If git.diff didn't include deleted files, add them manually
    let deletedDiffs = "";
    if (stagedDeleted.length > 0) {
      // Check if deleted files are already in the diff
      const deletedInDiff = stagedDeleted.some((file) =>
        diff.includes(`--- a/${file}`)
      );
      
      if (!deletedInDiff) {
        // Add deleted files that weren't in the diff
        const deletedDiffsArray = await Promise.all(
          stagedDeleted.map((file) => getDeletedFileDiff(file))
        );
        deletedDiffs = deletedDiffsArray
          .filter((d) => d.length > 0)
          .join("\n\n");
      }
    }
    
    if (diff && deletedDiffs) {
      return `${diff}\n\n${deletedDiffs}`;
    }
    return diff || deletedDiffs;
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
    return `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/${filePath}\n${diffLines.join(
      "\n"
    )}`;
  } catch (error) {
    return "";
  }
}

/**
 * Get diff for a deleted file
 */
async function getDeletedFileDiff(filePath: string): Promise<string> {
  try {
    const git = getGitInstance();
    // Try to get the file content from HEAD (last commit) using raw command
    try {
      const content = await git.raw(["show", `HEAD:${filePath}`]);
      const lines = content.split("\n");
      // Remove trailing newline if exists
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }
      const diffLines = lines.map((line) => `-${line}`);
      return `diff --git a/${filePath} b/${filePath}\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/${filePath}\n+++ /dev/null\n${diffLines.join(
        "\n"
      )}`;
    } catch (error) {
      // If file doesn't exist in HEAD, create a simple deletion diff
      return `diff --git a/${filePath} b/${filePath}\ndeleted file mode 100644\n--- a/${filePath}\n+++ /dev/null\n`;
    }
  } catch (error) {
    return "";
  }
}

/**
 * Get unstaged changes (including new files and deleted files)
 */
export async function getUnstagedDiff(): Promise<string> {
  try {
    const git = getGitInstance();
    const status = await git.status();

    // Get diff for tracked modified files (ensure deletions are included)
    const trackedDiff = await git.diff([
      "--no-renames",
      "--diff-filter=ACDMRT", // Include Added, Copied, Deleted, Modified, Renamed, Type-changed
    ]);

    // Get diff for new (untracked) files
    const newFiles = status.not_added || [];
    const newFilesDiff = newFiles
      .map((file) => getNewFileDiff(file))
      .filter((diff) => diff.length > 0)
      .join("\n\n");

    // Get unstaged deleted files
    const unstagedDeleted = (status.deleted || []).filter((file) => {
      // Check if file is NOT in staged files (unstaged deletion)
      return !status.staged.includes(file);
    });

    // If git.diff didn't include deleted files, add them manually
    let deletedDiffs = "";
    if (unstagedDeleted.length > 0) {
      // Check if deleted files are already in the diff
      const deletedInDiff = unstagedDeleted.some((file) =>
        trackedDiff.includes(`--- a/${file}`)
      );
      
      if (!deletedInDiff) {
        // Add deleted files that weren't in the diff
        const deletedDiffsArray = await Promise.all(
          unstagedDeleted.map((file) => getDeletedFileDiff(file))
        );
        deletedDiffs = deletedDiffsArray
          .filter((d) => d.length > 0)
          .join("\n\n");
      }
    }

    // Combine all diffs
    const parts = [trackedDiff, newFilesDiff, deletedDiffs].filter(
      (part) => part && part.length > 0
    );
    return parts.join("\n\n");
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

    const stagedNewFiles: string[] = [];
    const allNewFiles = status.not_added || [];
    const stagedFiles = status.staged || [];
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
        stagedWithNew = staged
          ? `${staged}\n\n${stagedNewFilesDiff}`
          : stagedNewFilesDiff;
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
 * Get diff with unified context for hunk parsing
 * Returns diff with explicit hunk headers for parsing
 */
export async function getDiffForHunkParsing(
  stagedOnlyMode: boolean = false
): Promise<string> {
  try {
    const git = getGitInstance();
    const status = await git.status();

    let diff = "";

    // In staged-only mode, ONLY get staged changes
    if (stagedOnlyMode) {
      // Get staged changes only
      if (status.staged.length > 0 || status.deleted.length > 0) {
        const stagedDiff = await git.diff([
          "--cached",
          "--unified=3", // 3 lines of context
          "--no-renames",
          "--diff-filter=ACDMRT",
        ]);
        diff += stagedDiff;
      }

      // Handle staged deleted files
      const stagedDeleted = (status.deleted || []).filter((file) => {
        return status.staged.includes(file);
      });

      if (stagedDeleted.length > 0) {
        const deletedInDiff = stagedDeleted.some((file) =>
          diff.includes(`--- a/${file}`)
        );

        if (!deletedInDiff) {
          const deletedDiffs = await Promise.all(
            stagedDeleted.map((file) => getDeletedFileDiff(file))
          );
          const validDeleted = deletedDiffs.filter((d) => d.length > 0);
          if (validDeleted.length > 0) {
            if (diff) {
              diff += "\n\n";
            }
            diff += validDeleted.join("\n\n");
          }
        }
      }

      return diff;
    }

    // Normal mode: Get both staged and unstaged changes
    // Get staged changes if any
    if (status.staged.length > 0 || status.deleted.length > 0) {
      const stagedDiff = await git.diff([
        "--cached",
        "--unified=3", // 3 lines of context
        "--no-renames",
        "--diff-filter=ACDMRT",
      ]);
      diff += stagedDiff;
    }

    // Get unstaged changes if any
    const unstagedFiles = status.files.filter((f) => f.working_dir !== " ");
    if (unstagedFiles.length > 0) {
      const unstagedDiff = await git.diff([
        "--unified=3",
        "--no-renames",
        "--diff-filter=ACDMRT",
      ]);
      if (diff) {
        diff += "\n\n";
      }
      diff += unstagedDiff;
    }

    // Handle new files
    const newFiles = status.not_added || [];
    if (newFiles.length > 0) {
      const newDiffs = newFiles.map((file) => getNewFileDiff(file));
      if (diff) {
        diff += "\n\n";
      }
      diff += newDiffs.join("\n\n");
    }

    // Handle deleted files (if not already in diff)
    const deletedFiles = status.deleted || [];
    if (deletedFiles.length > 0) {
      const deletedInDiff = deletedFiles.some((file) =>
        diff.includes(`--- a/${file}`)
      );

      if (!deletedInDiff) {
        const deletedDiffs = await Promise.all(
          deletedFiles.map((file) => getDeletedFileDiff(file))
        );
        const validDeleted = deletedDiffs.filter((d) => d.length > 0);
        if (validDeleted.length > 0) {
          if (diff) {
            diff += "\n\n";
          }
          diff += validDeleted.join("\n\n");
        }
      }
    }

    return diff;
  } catch (error) {
    throw new Error(
      `Error getting diff for hunk parsing: ${getErrorMessage(error)}`
    );
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
 * List all changed files (including deleted files)
 */
export async function getAllChangedFiles(): Promise<string[]> {
  try {
    const git = getGitInstance();
    const status = await git.status();
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
