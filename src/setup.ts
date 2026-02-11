import inquirer from "inquirer";
import chalk from "chalk";
import * as config from "./config";

export async function runSetup(): Promise<void> {
  console.log(chalk.blue.bold("\n🔧 Git AI Setup\n"));

  // Check for existing configuration
  const existingProvider = config.getProvider();
  const existingOpenAIKey = config.getOpenAIKey();
  const existingGeminiKey = config.getGeminiKey();
  const existingZaiKey = config.getZaiKey();
  const hasExistingConfig = existingOpenAIKey || existingGeminiKey || existingZaiKey;

  if (hasExistingConfig) {
    const currentProvider = existingProvider === "openai" ? "OpenAI" :
                           existingProvider === "gemini" ? "Gemini" :
                           existingProvider === "zai" ? "z.ai" :
                           existingOpenAIKey ? "OpenAI" :
                           existingGeminiKey ? "Gemini" : "z.ai";

    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: "confirm",
        name: "overwrite",
        message: `AI provider (${currentProvider}) already configured. Reconfigure?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow("Setup cancelled.\n"));
      return;
    }
  }

  // Provider selection
  const { provider } = await inquirer.prompt<{ provider: "openai" | "gemini" | "zai" }>([
    {
      type: "list",
      name: "provider",
      message: "Select AI provider:",
      choices: [
        { name: "OpenAI (GPT-4o-mini)", value: "openai" },
        { name: "Google Gemini (Gemini 3 Flash Preview)", value: "gemini" },
        { name: "z.ai (GLM-4.7)", value: "zai" },
      ],
      default: existingProvider,
    },
  ]);

  // API key input based on provider
  if (provider === "openai") {
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
            return "Invalid OpenAI API key format (should start with sk-)";
          }
          return true;
        },
      },
    ]);

    config.setProvider("openai");
    config.setOpenAIKey(openaiKey);
    console.log(chalk.green("\n✓ OpenAI provider configured\n"));
  } else if (provider === "gemini") {
    const { geminiKey } = await inquirer.prompt<{ geminiKey: string }>([
      {
        type: "password",
        name: "geminiKey",
        message: "Enter Google Gemini API Key:",
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return "API key is required";
          }
          // Gemini keys typically start with "AI" but be lenient
          if (input.length < 20) {
            return "API key seems too short";
          }
          return true;
        },
      },
    ]);

    config.setProvider("gemini");
    config.setGeminiKey(geminiKey);
    console.log(chalk.green("\n✓ Gemini provider configured\n"));
  } else {
    const { zaiKey } = await inquirer.prompt<{ zaiKey: string }>([
      {
        type: "password",
        name: "zaiKey",
        message: "Enter z.ai API Key:",
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return "API key is required";
          }
          if (input.length < 10) {
            return "API key seems too short";
          }
          return true;
        },
      },
    ]);

    config.setProvider("zai");
    config.setZaiKey(zaiKey);
    console.log(chalk.green("\n✓ z.ai provider configured\n"));
  }

  console.log(chalk.blue("Usage: git-ai commit\n"));
}
