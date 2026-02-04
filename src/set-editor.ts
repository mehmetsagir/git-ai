import chalk from "chalk";
import * as config from "./config";
import * as editorUtils from "./utils/editor";

/**
 * Set or change editor preference
 */
export async function setEditorPreference(): Promise<void> {
  console.log(chalk.blue.bold("\n⚙️  Editor Configuration\n"));

  const currentEditor = config.getEditor();
  if (currentEditor) {
    console.log(chalk.gray(`Current editor: ${currentEditor}\n`));
  }

  // Prompt for new editor
  const newEditor = await editorUtils.promptForEditor();

  // Save preference
  config.setEditor(newEditor);

  console.log(chalk.green(`\n✓ Editor preference updated: ${newEditor}\n`));
  console.log(
    chalk.gray("You can change this anytime with: git-ai set-editor\n")
  );
}
