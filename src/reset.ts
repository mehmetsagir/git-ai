import chalk from "chalk";
import inquirer from "inquirer";
import * as config from "./config";

export async function resetConfig(): Promise<void> {
  if (!config.configExists()) {
    console.log(chalk.yellow("⚠ No configuration found.\n"));
    return;
  }

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: "confirm",
      name: "confirm",
      message: "Delete all configuration (API key)?",
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow("Cancelled.\n"));
    return;
  }

  if (config.resetConfig()) {
    console.log(chalk.green("✓ Configuration reset.\n"));
  } else {
    console.log(chalk.red("❌ Failed to reset.\n"));
  }
}
