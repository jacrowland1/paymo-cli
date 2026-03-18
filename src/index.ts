import { Command } from "commander";
import * as dotenv from "dotenv";
import * as path from "path";
import { PaymoClient } from "./paymoClient";
import { getWorkingDays, getDateRange } from "./dates";

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
      console.log("\n  Tasks:\n");
      console.log(
        "  " +
          "ID".padEnd(12) +
          "Project".padEnd(12) +
          "Name".padEnd(40) +
          "Complete",
      );
      console.log("  " + "─".repeat(72));
      for (const t of tasks) {
        console.log(
          "  " +
            String(t.id).padEnd(12) +
            String(t.project_id).padEnd(12) +
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
  .requiredOption("--task <taskId>", "Task ID to log time against")
  .option(
    "--hours <hours>",
    "Hours per day (default: 8)",
    String(HOURS_PER_DAY),
  )
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
  .option(
    "--description <text>",
    "Description for the time entries",
    "Development",
  )
  .option("--dry-run", "Preview entries without creating them")
  .action(async (opts) => {
    try {
      const client = getClient();
      const taskId = Number(opts.task);
      const hours = Number(opts.hours);
      const duration = hours * SECONDS_PER_HOUR;
      const description: string = opts.description;
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
        await client.waitIfNeeded();
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
        await client.waitIfNeeded();
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

program.parse(process.argv);
