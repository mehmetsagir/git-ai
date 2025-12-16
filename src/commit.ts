import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import * as config from "./config";
import * as git from "./git";
import * as openai from "./openai";
import * as commitProcessor from "./commit-processor";
import { GitUserInfo, GitUserProfile } from "./types";
import { getErrorMessage } from "./utils/errors";

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
    "🤖 Analyzing diff with OpenAI and creating commit groups..."
  ).start();
  let analysisResult: Awaited<ReturnType<typeof openai.analyzeDiffAndGroup>>;
  try {
    analysisResult = await openai.analyzeDiffAndGroup(diffData.all, openaiKey);

    // In staged-only mode, prune group files to only staged files
    if (stagedOnlyMode) {
      // Refresh staged list to be safe
      const stagedNow = await git.getStagedFiles();
      const stagedSource = stagedNow.length > 0 ? stagedNow : stagedFiles;

      const normalize = (file: string) => file.replace(/^[./]+/, "");
      const stagedNormalized = stagedSource.map(normalize);

      const filterGroupFiles = (groupFiles: string[]): string[] => {
        const matched: string[] = [];
        for (const file of groupFiles) {
          const norm = normalize(file);
          // Exact match
          const exactIdx = stagedNormalized.findIndex((sf) => sf === norm);
          if (exactIdx >= 0) {
            matched.push(stagedSource[exactIdx]);
            continue;
          }
          // Suffix/prefix match to handle path differences
          const fuzzyIdx = stagedNormalized.findIndex(
            (sf) => norm.endsWith(sf) || sf.endsWith(norm)
          );
          if (fuzzyIdx >= 0) {
            matched.push(stagedSource[fuzzyIdx]);
          }
        }
        // Return only matched files (groups with no matches will be filtered out)
        return Array.from(new Set(matched));
      };

      analysisResult.groups = (analysisResult.groups || [])
        .map((group) => {
          const filteredFiles = filterGroupFiles(group.files);
          return filteredFiles.length > 0
            ? { ...group, files: filteredFiles }
            : null;
        })
        .filter((g): g is (typeof analysisResult.groups)[number] => g !== null);
    }

    aiSpinner.succeed(
      `Analysis complete: ${analysisResult.groups?.length || 0} groups created`
    );
  } catch (error) {
    aiSpinner.fail(`OpenAI analysis error: ${getErrorMessage(error)}`);
    return;
  }

  if (!analysisResult.groups || analysisResult.groups.length === 0) {
    console.log(chalk.yellow("⚠ Could not create groups.\n"));
    return;
  }

  console.log(
    chalk.green.bold(`\n✓ ${analysisResult.groups.length} groups created\n`)
  );
  console.log(chalk.blue("📋 Commit Plan:\n"));

  analysisResult.groups.forEach((group) => {
    console.log(chalk.cyan(`\nGroup ${group.number}: ${group.description}`));
    console.log(chalk.gray(`Files: ${group.files.join(", ")}`));
    console.log(chalk.yellow(`Commit: ${group.commitMessage}`));
    if (group.commitBody) {
      const bodyLines = group.commitBody.split("\n");
      bodyLines.forEach((line) => {
        console.log(chalk.gray(`  ${line}`));
      });
    }
  });

  console.log("\n");

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: "confirm",
      name: "confirm",
      message: "Do you approve this commit plan?",
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow("\n❌ Operation cancelled.\n"));
    return;
  }

  const commitResults = await commitProcessor.processAllCommitGroups(
    analysisResult.groups,
    selectedUser,
    stagedOnlyMode
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
