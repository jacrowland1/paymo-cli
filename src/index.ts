#!/usr/bin/env node
import { Command } from "commander";
import * as dotenv from "dotenv";
import * as path from "path";
import { registerListProjects } from "./commands/list-projects";
import { registerListTasks } from "./commands/list-tasks";
import { registerAddTime } from "./commands/add-time";
import { registerFillTime } from "./commands/fill-time";
import { registerListTime } from "./commands/list-time";
import { registerClearTime } from "./commands/clear-time";
import { registerStatus } from "./commands/status";
import { registerConfig } from "./commands/config";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const program = new Command();

program
  .name("paymo")
  .description("CLI tool to automate Paymo timesheet entries")
  .version("1.0.0");

registerListProjects(program);
registerListTasks(program);
registerAddTime(program);
registerFillTime(program);
registerListTime(program);
registerClearTime(program);
registerStatus(program);
registerConfig(program);

program.parse(process.argv);
