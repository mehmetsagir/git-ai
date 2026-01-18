import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface Config {
  openaiKey?: string;
}

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
