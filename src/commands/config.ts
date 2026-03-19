import { Command } from "commander";
import {
  loadConfig,
  setConfigValue,
  deleteConfigValue,
  isValidKey,
  VALID_KEYS,
} from "../utils/config";

export function registerConfig(program: Command): void {
  const configCmd = program
    .command("config")
    .description("Manage default settings");

  configCmd
    .command("set <key> <value>")
    .description("Set a default value (task, hours, description)")
    .action((key: string, value: string) => {
      if (!isValidKey(key)) {
        console.error(
          `Invalid key: ${key}. Valid keys: ${VALID_KEYS.join(", ")}`,
        );
        process.exit(1);
      }
      setConfigValue(key, value);
      console.log(`  ✓ ${key} = ${value}`);
    });

  configCmd
    .command("get [key]")
    .description("Show current defaults")
    .action((key?: string) => {
      const config = loadConfig();
      if (key) {
        if (!isValidKey(key)) {
          console.error(
            `Invalid key: ${key}. Valid keys: ${VALID_KEYS.join(", ")}`,
          );
          process.exit(1);
        }
        console.log(`  ${key} = ${config[key] ?? "(not set)"}`);
      } else {
        console.log("\n  Config:\n");
        for (const k of VALID_KEYS) {
          console.log(`  ${k.padEnd(14)} ${config[k] ?? "—"}`);
        }
        console.log();
      }
    });

  configCmd
    .command("unset <key>")
    .description("Remove a default value")
    .action((key: string) => {
      if (!isValidKey(key)) {
        console.error(
          `Invalid key: ${key}. Valid keys: ${VALID_KEYS.join(", ")}`,
        );
        process.exit(1);
      }
      deleteConfigValue(key);
      console.log(`  ✓ ${key} unset`);
    });
}
