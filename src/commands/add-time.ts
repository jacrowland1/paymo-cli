import { Command } from "commander";
import { getClient, HOURS_PER_DAY, SECONDS_PER_HOUR } from "./_shared";
import { loadConfig } from "../utils/config";
import { getWorkingDays, getDateRange, formatDate } from "../utils/dates";

export function registerAddTime(program: Command): void {
  program
    .command("add-time")
    .description("Bulk add time entries for a date range")
    .requiredOption("--start <date>", "Start date (YYYY-MM-DD, inclusive)")
    .option("--end <date>", "End date (YYYY-MM-DD, inclusive, default: today)")
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
        const end: string = opts.end ?? formatDate(new Date());
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
          excludeDates.push(
            ...getDateRange(opts.excludeStart, opts.excludeEnd),
          );
        } else if (opts.excludeStart || opts.excludeEnd) {
          console.error(
            "Error: --exclude-start and --exclude-end must be used together.",
          );
          process.exit(1);
        }

        const days = getWorkingDays(opts.start, end, excludeDates);

        if (days.length === 0) {
          console.log("No working days in the specified range.");
          return;
        }

        console.log(`\n  Task ID:     ${taskId}`);
        console.log(`  Date range:  ${opts.start} → ${end}`);
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
          end,
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
        console.error("Failed to add time:", err.response?.data || err.message);
        process.exit(1);
      }
    });
}
