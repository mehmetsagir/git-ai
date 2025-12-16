import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import * as config from "./config";
import * as git from "./git";
import * as openai from "./openai";
import * as hunkCommitProcessor from "./hunk-commit-processor";
import { GitUserInfo, GitUserProfile, HunkCommitGroup } from "./types";
import { getErrorMessage } from "./utils/errors";
import * as editor from "./utils/editor";
import * as commitFile from "./utils/commit-file";
import * as hunkParser from "./utils/hunk-parser";

/**
 * Run commit command
 */
export async function runCommit(userFlag: string | null = null): Promise<void> {
  console.log(chalk.blue.bold("\n🤖 Git Commit AI\n"));

  if (!config.configExists()) {
    console.log(
      chalk.yellow("⚠ Configuration not found. Please run setup first.\n")
    );
    console.log(chalk.blue("Run: git-ai setup\n"));
    return;
  }

  const openaiKey = config.getOpenAIKey();
  if (!openaiKey) {
    console.log(
      chalk.yellow("⚠ OpenAI API key not found. Please run setup first.\n")
    );
    console.log(chalk.blue("Run: git-ai setup\n"));
    return;
  }

  const isRepo = await git.isGitRepository();
  if (!isRepo) {
    console.log(chalk.red("❌ This directory is not a git repository!\n"));
    return;
  }

  const hasChanges = await git.hasChanges();
  if (!hasChanges) {
    console.log(chalk.yellow("⚠ No changes found to commit.\n"));
    return;
  }

  const gitUsers = config.getGitUsers();
  let selectedUser: GitUserInfo | null = null;

  if (gitUsers.length === 0) {
    console.log(
      chalk.yellow("⚠ No git user profile found. Setup is recommended.\n")
    );
    try {
      const currentUser = await git.getGitUserInfo();
      if (currentUser.name && currentUser.email) {
        selectedUser = {
          name: currentUser.name,
          email: currentUser.email,
        };
        console.log(
          chalk.blue(`Git user: ${currentUser.name} <${currentUser.email}>\n`)
        );
      } else {
        console.log(chalk.red("❌ Could not get git user info!\n"));
        return;
      }
    } catch (error) {
      console.log(
        chalk.red(`❌ Could not get git user info: ${getErrorMessage(error)}\n`)
      );
      return;
    }
  } else {
    if (userFlag) {
      const userFlagLower = userFlag.toLowerCase().trim();

      let foundUser: GitUserProfile | undefined = gitUsers.find(
        (u) => u.shortcut === userFlagLower
      );

      if (!foundUser) {
        foundUser = gitUsers.find(
          (u) =>
            u.id === userFlag ||
            u.id === userFlagLower ||
            u.email === userFlag ||
            u.email.toLowerCase() === userFlagLower
        );
      }

      if (!foundUser) {
        console.log(chalk.red(`❌ Git user not found: ${userFlag}\n`));
        console.log(chalk.blue("Available user profiles:\n"));
        gitUsers.forEach((u) => {
          const shortcutInfo = u.shortcut
            ? chalk.yellow(` [shortcut: ${u.shortcut}]`)
            : "";
          console.log(chalk.cyan(`  - ${u.label}${shortcutInfo}`));
        });
        console.log(
          chalk.blue("\nUsage: git-ai commit --user <shortcut|email|id>\n")
        );
        return;
      }

      selectedUser = {
        name: foundUser.name,
        email: foundUser.email,
      };

      const shortcutInfo = foundUser.shortcut
        ? chalk.yellow(` (shortcut: ${foundUser.shortcut})`)
        : "";
      console.log(
        chalk.blue(
          `Git user: ${foundUser.name} <${foundUser.email}>${shortcutInfo}\n`
        )
      );
    } else {
      const defaultUserId = config.getDefaultGitUser();
      if (defaultUserId) {
        const defaultUser = gitUsers.find((u) => u.id === defaultUserId);
        if (defaultUser) {
          selectedUser = {
            name: defaultUser.name,
            email: defaultUser.email,
          };
        }
      }

      if (gitUsers.length > 1 && !selectedUser) {
        const { userId } = await inquirer.prompt<{ userId: string }>([
          {
            type: "list",
            name: "userId",
            message: "Select git user:",
            choices: gitUsers.map((u) => ({
              name: u.label,
              value: u.id,
            })),
          },
        ]);
        const chosenUser = gitUsers.find((u) => u.id === userId);
        if (chosenUser) {
          selectedUser = {
            name: chosenUser.name,
            email: chosenUser.email,
          };
        }
      } else if (!selectedUser && gitUsers.length > 0) {
        selectedUser = {
          name: gitUsers[0].name,
          email: gitUsers[0].email,
        };
      }

      if (selectedUser) {
        console.log(
          chalk.blue(`Git user: ${selectedUser.name} <${selectedUser.email}>\n`)
        );
      }
    }
  }

  // Verify current git config matches selected user
  if (selectedUser) {
    try {
      const currentGitUser = await git.getGitUserInfo();
      if (
        currentGitUser.name !== selectedUser.name ||
        currentGitUser.email !== selectedUser.email
      ) {
        console.log(
          chalk.yellow(
            `⚠ Git user will be changed to: ${selectedUser.name} <${selectedUser.email}>\n`
          )
        );
      }
    } catch (error) {
      // Continue even if we can't verify
    }
  }

  // Check git status and inform user
  const stagedFiles = await git.getStagedFiles();
  const allChangedFiles = await git.getAllChangedFiles();
  const unstagedFiles = allChangedFiles.filter(
    (file) => !stagedFiles.includes(file)
  );
  const stagedOnlyMode = stagedFiles.length > 0;

  if (stagedFiles.length > 0) {
    console.log(
      chalk.blue(
        `📦 Found ${stagedFiles.length} staged file(s). These will be analyzed and committed.\n`
      )
    );
    if (unstagedFiles.length > 0) {
      console.log(
        chalk.blue(
          `ℹ Ignoring ${unstagedFiles.length} unstaged file(s) because staged files exist.\n`
        )
      );
    }
  } else if (unstagedFiles.length > 0) {
    console.log(
      chalk.blue(
        `📝 No staged files. Found ${unstagedFiles.length} unstaged file(s). These will be analyzed and committed.\n`
      )
    );
  } else {
    console.log(chalk.yellow("⚠ No changes found to commit.\n"));
    return;
  }

  const diffSpinner = ora("Analyzing changes...").start();
  let diffData;
  try {
    if (stagedOnlyMode) {
      const staged = await git.getStagedDiff();
      diffData = {
        staged,
        unstaged: "",
        all: staged,
      };
    } else {
      diffData = await git.getAllDiff();

      // Check if we have actual diff content
      const hasStaged = diffData.staged && diffData.staged.trim().length > 0;
      const hasUnstaged =
        diffData.unstaged && diffData.unstaged.trim().length > 0;

      if (!hasStaged && !hasUnstaged) {
        diffSpinner.fail("No diff content found");
        console.log(
          chalk.yellow(
            `ℹ Found ${allChangedFiles.length} file(s) but no diff content (may be renames/permissions only).\n`
          )
        );
        return;
      }

      // Combine staged and unstaged diffs
      if (!hasStaged && hasUnstaged) {
        diffData.all = diffData.unstaged;
      } else if (hasStaged && !hasUnstaged) {
        diffData.all = diffData.staged;
      } else {
        diffData.all = `${diffData.staged}\n${diffData.unstaged}`.trim();
      }
    }

    diffSpinner.succeed(
      stagedOnlyMode ? "Staged changes analyzed" : "Changes analyzed"
    );
  } catch (error) {
    diffSpinner.fail(`Error: ${getErrorMessage(error)}`);
    return;
  }

  if (!diffData.all || diffData.all.trim().length === 0) {
    diffSpinner.fail("No diff content found to analyze");
    return;
  }

  const aiSpinner = ora(
    "🤖 Analyzing changes with smart commit splitting..."
  ).start();

  // Parse diff into hunks for smart commit splitting
  const hunkParseSpinner = ora("Parsing diff into change blocks...").start();
  let fileHunks: hunkParser.FileHunks[];
  try {
    // Pass stagedOnlyMode to ensure we only get staged files when needed
    const diffForParsing = await git.getDiffForHunkParsing(stagedOnlyMode);
    fileHunks = hunkParser.parseDiffIntoHunks(diffForParsing);
    const summary = hunkParser.getHunksSummary(fileHunks);
    hunkParseSpinner.succeed(
      `Parsed diff: ${summary}${stagedOnlyMode ? " (staged only)" : ""}`
    );
  } catch (error) {
    hunkParseSpinner.fail(`Error parsing diff: ${getErrorMessage(error)}`);
    return;
  }

  if (fileHunks.length === 0) {
    console.log(chalk.yellow("⚠ No hunks found to analyze.\n"));
    return;
  }

  // Analyze hunks with AI
  aiSpinner.text =
    "🤖 Analyzing change blocks and grouping by feature...";
  let hunkAnalysisResult: Awaited<ReturnType<typeof openai.analyzeHunksAndGroup>>;
  try {
    const hunksFormatted = hunkParser.formatHunksForAI(fileHunks);
    hunkAnalysisResult = await openai.analyzeHunksAndGroup(
      hunksFormatted,
      openaiKey
    );

    // Note: In staged-only mode, we already got only staged changes in getDiffForHunkParsing
    // So hunks are already filtered to staged files only

    aiSpinner.succeed(
      `Analysis complete: ${hunkAnalysisResult.groups?.length || 0} groups created`
    );
  } catch (error) {
    aiSpinner.fail(`OpenAI analysis error: ${getErrorMessage(error)}`);
    return;
  }

  if (!hunkAnalysisResult.groups || hunkAnalysisResult.groups.length === 0) {
    console.log(chalk.yellow("⚠ Could not create groups.\n"));
    return;
  }

  console.log(
    chalk.green.bold(
      `\n✓ ${hunkAnalysisResult.groups.length} commit groups created (smart splitting enabled)\n`
    )
  );
  console.log(chalk.blue("📋 Commit Plan:\n"));

  hunkAnalysisResult.groups.forEach((group: HunkCommitGroup) => {
    console.log(chalk.cyan(`\nGroup ${group.number}: ${group.description}`));

    // Get unique files from hunks
    const filesInGroup = Array.from(
      new Set(group.hunks.map((h) => h.file))
    );
    const hunkCount = group.hunks.length;

    console.log(
      chalk.gray(
        `Files: ${filesInGroup.join(", ")} (${hunkCount} change block${
          hunkCount > 1 ? "s" : ""
        })`
      )
    );
    console.log(chalk.yellow(`Commit: ${group.commitMessage}`));
    if (group.commitBody) {
      const bodyLines = group.commitBody.split("\n");
      bodyLines.forEach((line) => {
        console.log(chalk.gray(`  ${line}`));
      });
    }
  });

  console.log("\n");

  // Single question with 3 options: Y (approve), n (reject), e (edit first)
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: "input",
      name: "action",
      message: "Do you approve this commit plan? (Y/n/e=edit first)",
      default: "Y",
      validate: (input: string) => {
        const normalized = input.toLowerCase().trim();
        if (normalized === "" || normalized === "y" || normalized === "n" || normalized === "e" || normalized === "edit") {
          return true;
        }
        return "Please enter Y (approve), n (cancel), or e (edit first)";
      },
    },
  ]);

  const normalized = action.toLowerCase().trim();

  // Handle cancel
  if (normalized === "n" || normalized === "no") {
    console.log(chalk.yellow("\n❌ Operation cancelled.\n"));
    return;
  }

  // Handle edit
  const wantEdit = normalized === "e" || normalized === "edit";

  if (wantEdit) {
    let tempFile: string | null = null;
    try {
      // Create temp file with commit messages
      // Convert HunkCommitGroup to CommitGroup format for editing
      const groupsForEditing = hunkAnalysisResult.groups.map((g) => ({
        number: g.number,
        description: g.description,
        files: Array.from(new Set(g.hunks.map((h) => h.file))),
        commitMessage: g.commitMessage,
        commitBody: g.commitBody,
      }));

      tempFile = editor.createTempFile("git-ai-commits");
      commitFile.writeCommitFile(tempFile, groupsForEditing);

      console.log(chalk.blue("\n✏️  Opening editor...\n"));

      // Open editor
      await editor.openEditor(tempFile);

      // Parse edited file
      const editedCommits = commitFile.parseCommitFile(tempFile);

      // Validate commits (show warnings but continue)
      const validation = commitFile.validateCommits(editedCommits);
      if (!validation.valid) {
        console.log(chalk.yellow("\n⚠️  Validation warnings:\n"));
        validation.errors.forEach((error) => {
          console.log(chalk.yellow(`  - ${error}`));
        });
        console.log(chalk.gray("\nContinuing with edited commits...\n"));
      }

      // Merge edited commits back
      const mergedGroups = commitFile.mergeEditedCommits(
        groupsForEditing,
        editedCommits
      );

      // Update hunkAnalysisResult.groups with edited messages
      const updatedGroups: HunkCommitGroup[] = [];
      for (const hunkGroup of hunkAnalysisResult.groups) {
        const merged = mergedGroups.find((g) => g.number === hunkGroup.number);
        if (merged) {
          updatedGroups.push({
            ...hunkGroup,
            commitMessage: merged.commitMessage,
            commitBody: merged.commitBody,
          });
        }
        // If not found in merged, the group was deleted - skip it
      }
      hunkAnalysisResult.groups = updatedGroups;

      if (hunkAnalysisResult.groups.length === 0) {
        console.log(
          chalk.yellow("\n⚠️  No commits remaining after editing.\n")
        );
        return;
      }

      console.log(
        chalk.green(
          `\n✓ Commit messages updated. ${hunkAnalysisResult.groups.length} commit(s) ready.\n`
        )
      );
    } catch (error) {
      console.log(
        chalk.red(`\n❌ Editor error: ${getErrorMessage(error)}\n`)
      );
      console.log(chalk.yellow("Proceeding with original commit messages...\n"));
    } finally {
      if (tempFile) {
        editor.cleanupTempFile(tempFile);
      }
    }
  }

  const commitResults = await hunkCommitProcessor.processAllHunkCommitGroups(
    hunkAnalysisResult.groups,
    fileHunks,
    selectedUser
  );

  console.log(chalk.blue.bold("\n📊 Summary Report\n"));
  console.log(
    chalk.cyan(
      `Total commits: ${commitResults.filter((r) => r.success).length}`
    )
  );
  console.log(
    chalk.cyan(`Successful: ${commitResults.filter((r) => r.success).length}`)
  );
  console.log(
    chalk.cyan(`Failed: ${commitResults.filter((r) => !r.success).length}\n`)
  );

  if (commitResults.length > 0) {
    console.log(chalk.blue("Commit Details:\n"));
    commitResults.forEach((result) => {
      if (result.success) {
        console.log(
          chalk.green(`  ✓ ${result.message} - ${result.files} files`)
        );
      } else {
        console.log(
          chalk.red(`  ❌ ${result.message} - Error: ${result.error}`)
        );
      }
    });
  }

  console.log(
    chalk.yellow("\n⚠ Note: Commits were not pushed. You can push manually.\n")
  );
  console.log(
    chalk.blue("Example: git push origin $(git symbolic-ref --short HEAD)\n")
  );
}
