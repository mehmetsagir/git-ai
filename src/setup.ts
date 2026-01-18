import inquirer from "inquirer";
import chalk from "chalk";
import * as config from "./config";

export async function runSetup(): Promise<void> {
  console.log(chalk.blue.bold("\n🔧 Git AI Setup\n"));

  const existingKey = config.getOpenAIKey();
  if (existingKey) {
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: "confirm",
        name: "overwrite",
        message: "OpenAI API key already exists. Overwrite?",
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow("Setup cancelled.\n"));
      return;
    }
  }

  const { openaiKey } = await inquirer.prompt<{ openaiKey: string }>([
    {
      type: "password",
      name: "openaiKey",
      message: "Enter OpenAI API Key:",
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return "API key is required";
        }
        if (!input.startsWith("sk-")) {
          return "Invalid API key format (should start with sk-)";
        }
        return true;
      },
    },
  ]);

  config.setOpenAIKey(openaiKey);
  console.log(chalk.green("\n✓ OpenAI API Key saved\n"));
  console.log(chalk.blue("Usage: git-ai commit\n"));
}
