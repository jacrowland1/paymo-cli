#!/usr/bin/env node
import { Command } from "commander";
import * as dotenv from "dotenv";
import * as path from "path";
import { PaymoClient, PaymoEntry } from "./paymoClient";
import {
  getWorkingDays,
  getDateRange,
  getPeriodRange,
  VALID_PERIODS,
  type Period,
} from "./utils/dates";
import {
  loadConfig,
  setConfigValue,
  deleteConfigValue,
  isValidKey,
  VALID_KEYS,
} from "./utils/config";

// Load .env from the paymo directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const HOURS_PER_DAY = 8;
const SECONDS_PER_HOUR = 3600;

function getClient(): PaymoClient {
  const apiKey = process.env.PAYMO_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: PAYMO_API_KEY must be set in .env file or environment variables.",
    );
    process.exit(1);
  }
  return new PaymoClient(apiKey);
}

const program = new Command();

program
  .name("paymo")
  .description("CLI tool to automate Paymo timesheet entries")
  .version("1.0.0");

// ─── list-projects ────────────────────────────────────────────────
program
  .command("list-projects")
  .description("List all active projects")
  .option("--all", "Include archived projects")
  .action(async (opts) => {
    try {
      const client = getClient();
      const projects = await client.getProjects(!opts.all);
      if (projects.length === 0) {
        console.log("No projects found.");
        return;
      }
      console.log("\n  Projects:\n");
      console.log(
        "  " +
          "ID".padEnd(12) +
          "Name".padEnd(40) +
          "Code".padEnd(10) +
          "Active",
      );
      console.log("  " + "─".repeat(70));
      for (const p of projects) {
        console.log(
          "  " +
            String(p.id).padEnd(12) +
            p.name.padEnd(40) +
            (p.code || "—").padEnd(10) +
            (p.active ? "Yes" : "No"),
        );
      }
      console.log();
    } catch (err: any) {
      console.error(
        "Failed to list projects:",
        err.response?.data || err.message,
      );
      process.exit(1);
    }
  });

// ─── list-tasks ───────────────────────────────────────────────────
program
  .command("list-tasks")
  .description("List tasks, optionally filtered by project")
  .option("-p, --project <projectId>", "Filter tasks by project ID")
  .action(async (opts) => {
    try {
      const client = getClient();
      const projectId = opts.project ? Number(opts.project) : undefined;
      const tasks = await client.getTasks(projectId);
      if (tasks.length === 0) {
        console.log("No tasks found.");
        return;
      }
      const projects = await client.getProjects(false);
      const projectMap = new Map(projects.map((p) => [p.id, p.name]));
      console.log("\n  Tasks:\n");
      console.log(
        "  " +
          "ID".padEnd(12) +
          "Project ID".padEnd(14) +
          "Project".padEnd(30) +
          "Name".padEnd(40) +
          "Complete",
      );
      console.log("  " + "─".repeat(104));
      for (const t of tasks) {
        const projName = (
          projectMap.get(t.project_id) || `${t.project_id}`
        ).substring(0, 28);
        console.log(
          "  " +
            String(t.id).padEnd(12) +
            String(t.project_id).padEnd(14) +
            projName.padEnd(30) +
            t.name.padEnd(40) +
            (t.complete ? "Yes" : "No"),
        );
      }
      console.log();
    } catch (err: any) {
      console.error("Failed to list tasks:", err.response?.data || err.message);
      process.exit(1);
    }
  });

// ─── add-time ─────────────────────────────────────────────────────
program
  .command("add-time")
  .description("Bulk add time entries for a date range")
  .requiredOption("--start <date>", "Start date (YYYY-MM-DD, inclusive)")
  .requiredOption("--end <date>", "End date (YYYY-MM-DD, inclusive)")
  .option("--task <taskId>", "Task ID to log time against")
  .option("--hours <hours>", "Hours per day")
  .option(
    "--exclude <dates>",
    "Comma-separated dates to exclude (YYYY-MM-DD)",
    "",
  )
  .option(
    "--exclude-start <date>",
    "Start of date range to exclude (YYYY-MM-DD, inclusive)",
  )
  .option(
    "--exclude-end <date>",
    "End of date range to exclude (YYYY-MM-DD, inclusive)",
  )
  .option("--description <text>", "Description for the time entries")
  .option("--dry-run", "Preview entries without creating them")
  .action(async (opts) => {
    try {
      const config = loadConfig();
      const client = getClient();
      const taskId = Number(opts.task || config.task);
      if (!taskId) {
        console.error(
          "Error: --task is required (or set a default with: config set task <id>)",
        );
        process.exit(1);
      }
      const hours = Number(opts.hours ?? config.hours ?? HOURS_PER_DAY);
      const duration = hours * SECONDS_PER_HOUR;
      const description: string =
        opts.description ?? config.description ?? "Development";
      const excludeDates = opts.exclude
        ? opts.exclude.split(",").map((d: string) => d.trim())
        : [];

      if (opts.excludeStart && opts.excludeEnd) {
        excludeDates.push(...getDateRange(opts.excludeStart, opts.excludeEnd));
      } else if (opts.excludeStart || opts.excludeEnd) {
        console.error(
          "Error: --exclude-start and --exclude-end must be used together.",
        );
        process.exit(1);
      }

      const days = getWorkingDays(opts.start, opts.end, excludeDates);

      if (days.length === 0) {
        console.log("No working days in the specified range.");
        return;
      }

      console.log(`\n  Task ID:     ${taskId}`);
      console.log(`  Date range:  ${opts.start} → ${opts.end}`);
      console.log(`  Hours/day:   ${hours}`);
      console.log(`  Description: ${description}`);
      if (excludeDates.length > 0) {
        console.log(`  Excluded:    ${excludeDates.join(", ")}`);
      }
      console.log(`  Working days: ${days.length}`);
      console.log(`  Total hours:  ${days.length * hours}\n`);

      if (opts.dryRun) {
        console.log("  Dry run — entries that would be created:\n");
        for (const day of days) {
          console.log(`    ${day}  ${hours}h  "${description}"`);
        }
        console.log();
        return;
      }

      console.log("  Fetching existing entries...\n");

      const existingEntries = await client.getEntries(
        taskId,
        opts.start,
        opts.end,
      );
      const existingDates = new Set(
        existingEntries.map((e) => e.date).filter(Boolean),
      );

      const daysToCreate = days.filter((d) => !existingDates.has(d));
      const skipped = days.length - daysToCreate.length;

      if (skipped > 0) {
        console.log(`  Skipping ${skipped} day(s) with existing entries.`);
      }

      if (daysToCreate.length === 0) {
        console.log("  All days already have entries — nothing to do.\n");
        return;
      }

      console.log(`  Creating ${daysToCreate.length} entries...\n`);

      let created = 0;
      let failed = 0;

      for (let i = 0; i < daysToCreate.length; i++) {
        const day = daysToCreate[i];
        await client.rateLimiter.waitIfNeeded();
        try {
          const entry = await client.createEntry({
            task_id: taskId,
            date: day,
            duration,
            description,
          });
          console.log(`    ✓ ${day}  →  entry #${entry.id}`);
          created++;
        } catch (err: any) {
          const msg = err.response?.data?.message || err.message;
          console.error(`    ✗ ${day}  →  ${msg}`);
          failed++;
        }
      }

      console.log(
        `\n  Done: ${created} created, ${skipped} skipped, ${failed} failed.\n`,
      );
    } catch (err: any) {
      console.error("Failed to add time:", err.response?.data || err.message);
      process.exit(1);
    }
  });

// ─── fill-time ───────────────────────────────────────────────────
program
  .command("fill-time <period>")
  .description(
    `Fill time entries for a named period. <period> is one of: ${VALID_PERIODS.join(", ")}`,
  )
  .option("--task <taskId>", "Task ID to log time against")
  .option("--hours <hours>", "Hours per day")
  .option(
    "--exclude <dates>",
    "Comma-separated dates to exclude (YYYY-MM-DD)",
    "",
  )
  .option("--description <text>", "Description for the time entries")
  .option("--dry-run", "Preview entries without creating them")
  .action(async (period: string, opts) => {
    if (!VALID_PERIODS.includes(period as Period)) {
      console.error(
        `Invalid period: "${period}". Must be one of: ${VALID_PERIODS.join(", ")}`,
      );
      process.exit(1);
    }

    try {
      const config = loadConfig();
      const client = getClient();
      const { start, end } = getPeriodRange(period as Period);

      const taskId = Number(opts.task || config.task);
      if (!taskId) {
        console.error(
          "Error: --task is required (or set a default with: config set task <id>)",
        );
        process.exit(1);
      }
      const hours = Number(opts.hours ?? config.hours ?? HOURS_PER_DAY);
      const duration = hours * SECONDS_PER_HOUR;
      const description: string =
        opts.description ?? config.description ?? "Development";
      const excludeDates = opts.exclude
        ? opts.exclude
            .split(",")
            .map((d: string) => d.trim())
            .filter(Boolean)
        : [];

      const days = getWorkingDays(start, end, excludeDates);

      console.log(`\n  Period:      ${period} (${start} → ${end})`);
      console.log(`  Task ID:     ${taskId}`);
      console.log(`  Hours/day:   ${hours}`);
      console.log(`  Description: ${description}`);
      if (excludeDates.length > 0) {
        console.log(`  Excluded:    ${excludeDates.join(", ")}`);
      }
      console.log(`  Working days: ${days.length}`);
      console.log(`  Total hours:  ${days.length * hours}\n`);

      if (days.length === 0) {
        console.log("  No working days in the specified period.\n");
        return;
      }

      if (opts.dryRun) {
        console.log("  Dry run — entries that would be created:\n");
        for (const day of days) {
          console.log(`    ${day}  ${hours}h  "${description}"`);
        }
        console.log();
        return;
      }

      console.log("  Fetching existing entries...\n");

      const existingEntries = await client.getEntries(taskId, start, end);
      const existingDates = new Set(
        existingEntries.map((e) => e.date).filter(Boolean),
      );

      const daysToCreate = days.filter((d) => !existingDates.has(d));
      const skipped = days.length - daysToCreate.length;

      if (skipped > 0) {
        console.log(`  Skipping ${skipped} day(s) with existing entries.`);
      }

      if (daysToCreate.length === 0) {
        console.log("  All days already have entries — nothing to do.\n");
        return;
      }

      console.log(`  Creating ${daysToCreate.length} entries...\n`);

      let created = 0;
      let failed = 0;

      for (const day of daysToCreate) {
        await client.rateLimiter.waitIfNeeded();
        try {
          const entry = await client.createEntry({
            task_id: taskId,
            date: day,
            duration,
            description,
          });
          console.log(`    ✓ ${day}  →  entry #${entry.id}`);
          created++;
        } catch (err: any) {
          const msg = err.response?.data?.message || err.message;
          console.error(`    ✗ ${day}  →  ${msg}`);
          failed++;
        }
      }

      console.log(
        `\n  Done: ${created} created, ${skipped} skipped, ${failed} failed.\n`,
      );
    } catch (err: any) {
      console.error("Failed to fill time:", err.response?.data || err.message);
      process.exit(1);
    }
  });

// ─── list-time ───────────────────────────────────────────────────
program
  .command("list-time")
  .description("List time entries for each day in a date range")
  .requiredOption("--start <date>", "Start date (YYYY-MM-DD, inclusive)")
  .requiredOption("--end <date>", "End date (YYYY-MM-DD, inclusive)")
  .option("--task <taskId>", "Only show entries for a specific task ID")
  .option("--include-empty", "Show days with no entries")
  .action(async (opts) => {
    try {
      const client = getClient();
      const taskId = opts.task ? Number(opts.task) : undefined;

      console.log(
        `\n  Fetching entries from ${opts.start} to ${opts.end}...\n`,
      );

      const entries = taskId
        ? await client.getEntries(taskId, opts.start, opts.end)
        : await client.getEntriesByDate(opts.start, opts.end);

      if (entries.length === 0) {
        console.log("  No entries found in the specified range.\n");
        return;
      }

      // Fetch task and project names for display
      const tasks = await client.getTasks();
      const taskMap = new Map(tasks.map((t) => [t.id, t.name]));
      const projects = await client.getProjects(false);
      const projectMap = new Map(projects.map((p) => [p.id, p.name]));

      // Group entries by date
      const byDate = new Map<string, PaymoEntry[]>();
      for (const e of entries) {
        const date = e.date || e.start_time?.split("T")[0] || "unknown";
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(e);
      }

      // Build date list — either just dates with entries, or all dates in range
      const sortedDates = opts.includeEmpty
        ? getDateRange(opts.start, opts.end)
        : [...byDate.keys()].sort();

      let totalHours = 0;

      console.log("  Time Entries:\n");
      console.log(
        "  " +
          "Date".padEnd(14) +
          "Hours".padEnd(8) +
          "Project".padEnd(24) +
          "Task".padEnd(24) +
          "Description",
      );
      console.log("  " + "─".repeat(90));

      for (const date of sortedDates) {
        const dayEntries = byDate.get(date) || [];
        const dayHours = dayEntries.reduce(
          (sum, e) => sum + (e.duration ? e.duration / 3600 : 0),
          0,
        );
        totalHours += dayHours;

        if (dayEntries.length === 0) {
          console.log("  " + date.padEnd(14) + "—");
          console.log("  " + "─".repeat(90));
          continue;
        }

        for (let i = 0; i < dayEntries.length; i++) {
          const e = dayEntries[i];
          const hrs = e.duration ? (e.duration / 3600).toFixed(1) : "?";
          const projName = (
            projectMap.get(e.project_id) || `project:${e.project_id}`
          ).substring(0, 22);
          const taskName = (
            taskMap.get(e.task_id) || `task:${e.task_id}`
          ).substring(0, 22);
          const desc = (e.description || "—").substring(0, 30);
          // Show date only on the first entry of each day
          const dateCol = i === 0 ? date : "";
          console.log(
            "  " +
              dateCol.padEnd(14) +
              `${hrs}h`.padEnd(8) +
              projName.padEnd(24) +
              taskName.padEnd(24) +
              desc,
          );
        }
        // Day subtotal if multiple entries
        if (dayEntries.length > 1) {
          console.log(
            "  " +
              "".padEnd(14) +
              `${dayHours.toFixed(1)}h`.padEnd(8) +
              "(day total)",
          );
        }
        console.log("  " + "─".repeat(90));
      }

      console.log(
        `\n  Total: ${totalHours.toFixed(1)}h across ${entries.length} entr${entries.length === 1 ? "y" : "ies"} over ${sortedDates.length} day(s).\n`,
      );
    } catch (err: any) {
      console.error("Failed to list time:", err.response?.data || err.message);
      process.exit(1);
    }
  });

// ─── clear-time ───────────────────────────────────────────────────
program
  .command("clear-time")
  .description("Delete all time entries between two dates")
  .requiredOption("--start <date>", "Start date (YYYY-MM-DD, inclusive)")
  .requiredOption("--end <date>", "End date (YYYY-MM-DD, inclusive)")
  .option("--task <taskId>", "Only delete entries for a specific task ID")
  .option("--dry-run", "Preview entries that would be deleted")
  .action(async (opts) => {
    try {
      const client = getClient();
      const taskId = opts.task ? Number(opts.task) : undefined;

      console.log(
        `\n  Fetching entries from ${opts.start} to ${opts.end}...\n`,
      );

      const entries = taskId
        ? await client.getEntries(taskId, opts.start, opts.end)
        : await client.getEntriesByDate(opts.start, opts.end);

      if (entries.length === 0) {
        console.log("  No entries found in the specified range.\n");
        return;
      }

      console.log(
        `  Found ${entries.length} entr${entries.length === 1 ? "y" : "ies"}:\n`,
      );
      for (const e of entries) {
        const date = e.date || e.start_time?.split("T")[0] || "unknown";
        const hrs = e.duration ? (e.duration / 3600).toFixed(1) : "?";
        console.log(
          `    #${e.id}  ${date}  ${hrs}h  task:${e.task_id}  "${e.description || ""}"`,
        );
      }
      console.log();

      if (opts.dryRun) {
        console.log(
          `  Dry run — ${entries.length} entr${entries.length === 1 ? "y" : "ies"} would be deleted.\n`,
        );
        return;
      }

      let deleted = 0;
      let failed = 0;

      console.log("  Deleting entries...\n");

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        await client.rateLimiter.waitIfNeeded();
        try {
          await client.deleteEntry(e.id);
          console.log(`    ✓ deleted #${e.id}`);
          deleted++;
        } catch (err: any) {
          const msg = err.response?.data?.message || err.message;
          console.error(`    ✗ #${e.id}  →  ${msg}`);
          failed++;
        }
      }

      console.log(`\n  Done: ${deleted} deleted, ${failed} failed.\n`);
    } catch (err: any) {
      console.error("Failed to clear time:", err.response?.data || err.message);
      process.exit(1);
    }
  });

// ─── status ───────────────────────────────────────────────────────
program
  .command("status")
  .description("Show hours logged today and this week")
  .option("--task <taskId>", "Only count entries for a specific task ID")
  .action(async (opts) => {
    try {
      const client = getClient();
      const config = loadConfig();
      const taskId = opts.task
        ? Number(opts.task)
        : config.task
          ? Number(config.task)
          : undefined;

      const { start: weekStart, end: weekEnd } = getPeriodRange("this-week");
      const { start: today } = getPeriodRange("today");

      const entries = taskId
        ? await client.getEntries(taskId, weekStart, weekEnd)
        : await client.getEntriesByDate(weekStart, weekEnd);

      const todayEntries = entries.filter(
        (e) => (e.date || e.start_time?.split("T")[0]) === today,
      );

      const totalSecs = (list: PaymoEntry[]) =>
        list.reduce((sum, e) => sum + (e.duration ?? 0), 0);

      const todayHours = totalSecs(todayEntries) / 3600;
      const weekHours = totalSecs(entries) / 3600;

      const config2 = loadConfig();
      const targetHours = Number(config2.hours ?? HOURS_PER_DAY);

      // Working days elapsed so far this week (Mon through today, weekdays only)
      const { start: weekStartStr } = getPeriodRange("this-week");
      const allWeekDays = getWorkingDays(weekStartStr, today);
      const expectedWeekHours = allWeekDays.length * targetHours;

      const bar = (current: number, target: number, width = 20): string => {
        const pct = Math.min(current / target, 1);
        const filled = Math.round(pct * width);
        return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
      };

      console.log(`\n  Status — ${today}\n`);
      console.log(
        `  Today   ${bar(todayHours, targetHours)}  ${todayHours.toFixed(1)}h / ${targetHours}h`,
      );
      console.log(
        `  Week    ${bar(weekHours, expectedWeekHours)}  ${weekHours.toFixed(1)}h / ${expectedWeekHours.toFixed(1)}h expected  (${weekStart} → ${weekEnd})`,
      );

      if (taskId) {
        console.log(`\n  (filtered to task ${taskId})`);
      }
      console.log();
    } catch (err: any) {
      console.error("Failed to get status:", err.response?.data || err.message);
      process.exit(1);
    }
  });

// ─── config ───────────────────────────────────────────────────────
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

program.parse(process.argv);
