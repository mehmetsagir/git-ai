import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import inquirer from "inquirer";
import chalk from "chalk";
import * as config from "../config";
import { getErrorMessage } from "./errors";

/**
 * Detect system editor from environment variables
 */
export function detectSystemEditor(): string | null {
  // Check common editor environment variables
  const editorVars = [
    process.env.GIT_EDITOR,
    process.env.EDITOR,
    process.env.VISUAL,
  ];

  for (const editor of editorVars) {
    if (editor && editor.trim()) {
      return editor.trim();
    }
  }

  // Platform-specific defaults
  if (process.platform === "win32") {
    return "notepad";
  }

  return "vi"; // Unix default
}

/**
 * Check if an editor command is available
 */
export function isEditorAvailable(editorCommand: string): boolean {
  try {
    const command =
      process.platform === "win32" ? "where" : "which";
    const editorBinary = editorCommand.split(" ")[0];

    childProcess.execSync(`${command} ${editorBinary}`, {
      stdio: "ignore",
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get editor command with proper flags
 */
function getEditorCommand(editor: string): string {
  const normalizedEditor = editor.toLowerCase();

  // Add wait flags for GUI editors
  if (normalizedEditor.includes("code")) {
    return `${editor} --wait`;
  }
  if (normalizedEditor.includes("subl")) {
    return `${editor} --wait`;
  }
  if (normalizedEditor.includes("atom")) {
    return `${editor} --wait`;
  }

  return editor;
}

/**
 * Prompt user to select an editor
 */
export async function promptForEditor(): Promise<string> {
  const systemEditor = detectSystemEditor();
  const choices: Array<{ name: string; value: string }> = [];

  // Common editors to check
  const commonEditors = [
    { name: "VS Code", command: "code" },
    { name: "Vim", command: "vim" },
    { name: "Nano", command: "nano" },
    { name: "Emacs", command: "emacs" },
    { name: "Sublime Text", command: "subl" },
    { name: "Atom", command: "atom" },
  ];

  // Add available editors
  for (const editor of commonEditors) {
    if (isEditorAvailable(editor.command)) {
      const displayName =
        editor.command === systemEditor
          ? `${editor.name} (System Default)`
          : editor.name;
      choices.push({
        name: displayName,
        value: editor.command,
      });
    }
  }

  // Add system editor if not in common list
  if (systemEditor && !choices.find((c) => c.value === systemEditor)) {
    choices.unshift({
      name: `System Default (${systemEditor})`,
      value: systemEditor,
    });
  }

  // Add custom option
  choices.push({
    name: "Other (enter custom command)",
    value: "custom",
  });

  const { editorChoice } = await inquirer.prompt<{ editorChoice: string }>([
    {
      type: "list",
      name: "editorChoice",
      message: "Select your preferred editor for commit messages:",
      choices,
      default: systemEditor || "vim",
    },
  ]);

  if (editorChoice === "custom") {
    const { customEditor } = await inquirer.prompt<{ customEditor: string }>([
      {
        type: "input",
        name: "customEditor",
        message: "Enter editor command:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Editor command cannot be empty";
          }
          return true;
        },
      },
    ]);
    return customEditor.trim();
  }

  return editorChoice;
}

/**
 * Get or prompt for editor preference
 */
export async function getOrPromptEditor(): Promise<string> {
  // Check if editor is already configured
  let editor = config.getEditor();

  if (editor) {
    return editor;
  }

  // Prompt user for editor preference
  console.log(chalk.blue("\n⚙️  Editor preference not set.\n"));
  editor = await promptForEditor();

  // Save preference
  config.setEditor(editor);
  console.log(chalk.green(`\n✓ Editor preference saved: ${editor}\n`));

  return editor;
}

/**
 * Open a file in the configured editor
 */
export async function openEditor(filePath: string): Promise<boolean> {
  try {
    const editor = await getOrPromptEditor();
    const editorCommand = getEditorCommand(editor);

    // Spawn editor process
    const editorProcess = childProcess.spawn(editorCommand, [filePath], {
      stdio: "inherit",
      shell: true,
    });

    // Wait for editor to close
    return new Promise((resolve, reject) => {
      editorProcess.on("exit", (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`Editor exited with code ${code}`));
        }
      });

      editorProcess.on("error", (error) => {
        reject(error);
      });
    });
  } catch (error) {
    throw new Error(`Failed to open editor: ${getErrorMessage(error)}`);
  }
}

/**
 * Create a temporary file for editing
 */
export function createTempFile(prefix: string = "git-ai"): string {
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const filename = `${prefix}-${timestamp}-${random}.txt`;
  return path.join(tmpDir, filename);
}

/**
 * Clean up temporary file
 */
export function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    // Silently ignore cleanup errors
  }
}
