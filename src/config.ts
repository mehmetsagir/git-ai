import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Config, GitUserProfile, AIProvider } from "./types";

const CONFIG_DIR = path.join(os.homedir(), ".git-ai");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function readConfig(): Config | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = fs.readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(content) as Config;
  } catch {
    return null;
  }
}

function writeConfig(config: Config): boolean {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

export function getOpenAIKey(): string | null {
  const config = readConfig();
  return config?.openaiKey || null;
}

export function setOpenAIKey(key: string): boolean {
  const config = readConfig() || {};
  config.openaiKey = key;
  return writeConfig(config);
}

export function getProvider(): AIProvider {
  const config = readConfig();
  return config?.provider || "openai"; // Default to openai for backward compat
}

export function setProvider(provider: AIProvider): boolean {
  const config = readConfig() || {};
  config.provider = provider;
  return writeConfig(config);
}

export function getGeminiKey(): string | null {
  const config = readConfig();
  return config?.geminiKey || null;
}

export function setGeminiKey(key: string): boolean {
  const config = readConfig() || {};
  config.geminiKey = key;
  return writeConfig(config);
}

export function getZaiKey(): string | null {
  const config = readConfig();
  return config?.zaiKey || null;
}

export function setZaiKey(key: string): boolean {
  const config = readConfig() || {};
  config.zaiKey = key;
  return writeConfig(config);
}

export function getAPIKey(provider: AIProvider): string | null {
  switch (provider) {
    case "openai":
      return getOpenAIKey();
    case "gemini":
      return getGeminiKey();
    case "zai":
      return getZaiKey();
    default:
      return null;
  }
}

export function getGitUsers(): GitUserProfile[] {
  const config = readConfig();
  return config?.gitUsers || [];
}

export function setGitUsers(users: GitUserProfile[]): boolean {
  const config = readConfig() || {};
  config.gitUsers = users;
  return writeConfig(config);
}

export function getDefaultGitUser(): string | null {
  const config = readConfig();
  return config?.defaultGitUser || null;
}

export function setDefaultGitUser(userId: string): boolean {
  const config = readConfig() || {};
  config.defaultGitUser = userId;
  return writeConfig(config);
}

export function getEditor(): string | null {
  const config = readConfig();
  return config?.editor || null;
}

export function setEditor(editor: string): boolean {
  const config = readConfig() || {};
  config.editor = editor;
  return writeConfig(config);
}

export function getConfig(): Config {
  return readConfig() || {};
}

export function removeGitUser(identifier: string): boolean {
  const config = readConfig();
  if (!config || !config.gitUsers) {
    return false;
  }

  const identifierLower = identifier.toLowerCase().trim();
  const users = config.gitUsers;

  const userIndex = users.findIndex(
    (u) =>
      u.id === identifier ||
      u.id === identifierLower ||
      u.email === identifier ||
      u.email.toLowerCase() === identifierLower ||
      u.shortcut === identifierLower
  );

  if (userIndex === -1) {
    return false;
  }

  const removedUser = users[userIndex];
  const wasDefault = config.defaultGitUser === removedUser.id;

  users.splice(userIndex, 1);
  config.gitUsers = users;

  if (wasDefault) {
    config.defaultGitUser = users.length > 0 ? users[0].id : null;
  }

  return writeConfig(config);
}

export function resetConfig(): boolean {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    return true;
  } catch {
    return false;
  }
}

export { CONFIG_FILE };
