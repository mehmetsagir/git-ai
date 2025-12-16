import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Config, GitUserProfile } from "./types";
import { getErrorMessage } from "./utils/errors";

const CONFIG_DIR = path.join(os.homedir(), ".git-ai");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/**
 * Read config file
 */
function readConfig(): Config | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = fs.readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(content) as Config;
  } catch (error) {
    return null;
  }
}

/**
 * Write config file
 */
function writeConfig(config: Config): boolean {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Config write error:", getErrorMessage(error));
    return false;
  }
}

/**
 * Check if config exists
 */
export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

/**
 * Get OpenAI key
 */
export function getOpenAIKey(): string | null {
  const config = readConfig();
  return config?.openaiKey || null;
}

/**
 * Save OpenAI key
 */
export function setOpenAIKey(key: string): boolean {
  const config = readConfig() || {};
  config.openaiKey = key;
  return writeConfig(config);
}

/**
 * Get git user profiles
 */
export function getGitUsers(): GitUserProfile[] {
  const config = readConfig();
  return config?.gitUsers || [];
}

/**
 * Save git user profiles
 */
export function setGitUsers(users: GitUserProfile[]): boolean {
  const config = readConfig() || {};
  config.gitUsers = users;
  return writeConfig(config);
}

/**
 * Get default git user
 */
export function getDefaultGitUser(): string | null {
  const config = readConfig();
  return config?.defaultGitUser || null;
}

/**
 * Save default git user
 */
export function setDefaultGitUser(userId: string): boolean {
  const config = readConfig() || {};
  config.defaultGitUser = userId;
  return writeConfig(config);
}

/**
 * Get all config
 */
export function getConfig(): Config {
  return readConfig() || {};
}

/**
 * Reset config
 */
export function resetConfig(): boolean {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    return true;
  } catch (error) {
    console.error("Config reset error:", getErrorMessage(error));
    return false;
  }
}

/**
 * Remove a git user by ID, email, or shortcut
 */
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

/**
 * Get editor preference
 */
export function getEditor(): string | null {
  const config = readConfig();
  return config?.editor || null;
}

/**
 * Save editor preference
 */
export function setEditor(editor: string): boolean {
  const config = readConfig() || {};
  config.editor = editor;
  return writeConfig(config);
}

export { CONFIG_FILE };
