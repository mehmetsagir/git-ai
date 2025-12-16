import chalk from "chalk";
import ora from "ora";
import * as git from "./git";
import { CommitGroup, CommitResult, GitUserInfo } from "./types";
import { getErrorMessage } from "./utils/errors";

interface ProcessResult {
  success: boolean;
  filesProcessed: string[];
  message?: string;
  error?: string;
}

/**
 * Process and commit a single group
 */
async function processCommitGroup(
  group: CommitGroup,
  selectedUser: GitUserInfo | null,
  filesToUse: string[],
  processedFiles: Set<string>,
  stagedOnlyMode: boolean
): Promise<ProcessResult> {
  if (filesToUse.length === 0) {
    console.log(
      chalk.yellow(`⚠ Group ${group.number}: No files to process, skipping.\n`)
    );
    return { success: false, filesProcessed: [] };
  }

  // Mark files as processed
  filesToUse.forEach((file) => processedFiles.add(file));

  if (!stagedOnlyMode) {
    // Check if files are already staged
    const currentlyStaged = await git.getStagedFiles();
    const filesAlreadyStaged = filesToUse.filter((file) =>
      currentlyStaged.includes(file)
    );

    const filesToStage =
      filesAlreadyStaged.length === filesToUse.length
        ? [] // All files already staged
        : filesToUse.filter((file) => !currentlyStaged.includes(file));

    // Stage files if needed
    if (filesToStage.length > 0) {
      const stageSpinner = ora(
        `Group ${group.number}: Staging ${filesToStage.length} file(s)...`
      ).start();
      try {
        await git.stageFiles(filesToStage);
        stageSpinner.succeed(`Group ${group.number}: Files staged`);
      } catch (error) {
        stageSpinner.fail(
          `Group ${group.number}: Error staging files: ${getErrorMessage(
            error
          )}`
        );
        return { success: false, filesProcessed: filesToUse };
      }
    }
  }

  // Set git user before committing (local scope to not affect global config)
  if (selectedUser?.name && selectedUser?.email) {
    try {
      const currentUser = await git.getGitUserInfo();
      const needsChange =
        currentUser.name !== selectedUser.name ||
        currentUser.email !== selectedUser.email;

      if (needsChange) {
        await git.setGitUser(selectedUser.name, selectedUser.email, "local");
        console.log(
          chalk.green(
            `✓ Group ${group.number}: Git user changed to ${selectedUser.name} <${selectedUser.email}>\n`
          )
        );
      }
    } catch (error) {
      console.log(
        chalk.yellow(
          `⚠ Group ${group.number}: Failed to set git user: ${getErrorMessage(
            error
          )}\n`
        )
      );
    }
  }

  const fullMessage = group.commitBody
    ? `${group.commitMessage}\n\n${group.commitBody}`
    : group.commitMessage;

  if (!stagedOnlyMode) {
    // Verify only the intended files are staged before committing
    const stagedBeforeCommit = await git.getStagedFiles();
    const unexpectedStaged = stagedBeforeCommit.filter(
      (file) => !filesToUse.includes(file)
    );

    if (unexpectedStaged.length > 0) {
      console.log(
        chalk.yellow(
          `⚠ Group ${group.number}: Fixing staging (unexpected files detected)\n`
        )
      );
      try {
        await git.unstageAll();
        if (filesToUse.length > 0) {
          await git.stageFiles(filesToUse);
        }
      } catch (error) {
        console.log(
          chalk.yellow(
            `⚠ Group ${group.number}: Staging fix failed: ${getErrorMessage(
              error
            )}\n`
          )
        );
      }
    }
  }

  // Final check - ensure we have files to commit
  const finalStaged = await git.getStagedFiles();
  if (finalStaged.length === 0) {
    console.log(
      chalk.yellow(
        `⚠ Group ${group.number}: No files staged, skipping commit.\n`
      )
    );
    return { success: false, filesProcessed: filesToUse };
  }

  const commitSpinner = ora(
    `Group ${group.number}: Creating commit "${group.commitMessage}"...`
  ).start();
  try {
    await git.createCommit(
      fullMessage,
      selectedUser?.name || null,
      selectedUser?.email || null
    );

    // Verify the commit was made with the correct user
    if (selectedUser) {
      const currentUser = await git.getGitUserInfo();
      if (
        currentUser.name !== selectedUser.name ||
        currentUser.email !== selectedUser.email
      ) {
        console.log(
          chalk.yellow(
            `⚠ Group ${group.number}: User mismatch (expected: ${selectedUser.name}, got: ${currentUser.name})\n`
          )
        );
      }
    }

    commitSpinner.succeed(
      `Group ${group.number}: Committed - ${group.commitMessage}`
    );
    return {
      success: true,
      filesProcessed: filesToUse,
      message: group.commitMessage,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    commitSpinner.fail(`Group ${group.number}: Commit error - ${errorMessage}`);
    return {
      success: false,
      filesProcessed: filesToUse,
      message: group.commitMessage,
      error: errorMessage,
    };
  }
}

/**
 * Process all commit groups
 */
export async function processAllCommitGroups(
  groups: CommitGroup[],
  selectedUser: GitUserInfo | null,
  stagedOnlyMode: boolean
): Promise<CommitResult[]> {
  const prepareSpinner = ora("Preparing files...").start();

  // Check if there are already staged files
  const initialStaged = await git.getStagedFiles();
  const hasStagedFiles = initialStaged.length > 0;

  if (!hasStagedFiles) {
    try {
      await git.unstageAll();
      prepareSpinner.succeed("Ready");
    } catch (error) {
      prepareSpinner.fail(`Error: ${getErrorMessage(error)}`);
    }
  } else {
    prepareSpinner.succeed(
      stagedOnlyMode
        ? `${initialStaged.length} staged file(s) will be used (unstaged ignored)`
        : `${initialStaged.length} staged file(s) ready`
    );
  }

  const commitResults: CommitResult[] = [];
  const processedFiles = new Set<string>();

  console.log(chalk.blue(`\n📦 Creating ${groups.length} commits...\n`));

  for (const group of groups) {
    // Decide which files to use
    let filesToUse: string[] = [];

    if (stagedOnlyMode) {
      filesToUse = initialStaged.filter((file) => !processedFiles.has(file));
      // Only run once; remaining groups will be skipped below if no files
    } else {
      const currentChanged = await git.getAllChangedFiles();

      // Get remaining files (exclude already processed ones)
      const remainingFiles = currentChanged.filter(
        (file) => !processedFiles.has(file)
      );

      // Match group files with remaining files
      const groupFiles = group.files
        .map((file) => {
          const normalizedFile = file.replace(/^\.\//, "").replace(/^\//, "");
          return remainingFiles.find((changed) => {
            const normalizedChanged = changed
              .replace(/^\.\//, "")
              .replace(/^\//, "");
            return (
              normalizedChanged === normalizedFile ||
              normalizedChanged.endsWith(normalizedFile) ||
              normalizedFile.endsWith(normalizedChanged)
            );
          });
        })
        .filter((file): file is string => Boolean(file));

      filesToUse =
        groupFiles.length > 0 ? groupFiles : remainingFiles.slice(0, 1);
    }

    if (filesToUse.length === 0) {
      console.log(
        chalk.yellow(`⚠ Group ${group.number}: No files available, skipping.\n`)
      );
      commitResults.push({
        group: group.number,
        message: group.commitMessage,
        files: 0,
        success: false,
        error: "No files available",
      });
      continue;
    }

    const result = await processCommitGroup(
      group,
      selectedUser,
      filesToUse,
      processedFiles,
      stagedOnlyMode
    );

    commitResults.push({
      group: group.number,
      message: result.message || group.commitMessage,
      files: result.filesProcessed?.length || 0,
      success: result.success,
      error: result.error,
    });

    // After each commit, unstage any remaining staged files
    // Skip in stagedOnlyMode to avoid touching unstaged changes
    if (!stagedOnlyMode) {
      try {
        await git.unstageAll();
      } catch {
        // Continue even if error
      }
    } else {
      // In staged-only mode we only process once
      break;
    }
  }

  return commitResults;
}
