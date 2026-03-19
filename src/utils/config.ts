import * as fs from "fs";
import * as path from "path";

const CONFIG_PATH = path.resolve(__dirname, "../.paymorc.json");

export interface PaymoConfig {
  task?: string;
  hours?: string;
  description?: string;
}

const VALID_KEYS: (keyof PaymoConfig)[] = ["task", "hours", "description"];

export function isValidKey(key: string): key is keyof PaymoConfig {
  return VALID_KEYS.includes(key as keyof PaymoConfig);
}

export function loadConfig(): PaymoConfig {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

export function saveConfig(config: PaymoConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function getConfigValue(key: keyof PaymoConfig): string | undefined {
  return loadConfig()[key];
}

export function setConfigValue(key: keyof PaymoConfig, value: string): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

export function deleteConfigValue(key: keyof PaymoConfig): void {
  const config = loadConfig();
  delete config[key];
  saveConfig(config);
}

export { VALID_KEYS };
