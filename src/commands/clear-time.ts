import { Command } from "commander";
import { getClient } from "./_shared";
import { formatDate } from "../utils/dates";

export function registerClearTime(program: Command): void {
  program
    .command("clear-time")
    .description("Delete all time entries between two dates")
    .requiredOption("--start <date>", "Start date (YYYY-MM-DD, inclusive)")
    .option("--end <date>", "End date (YYYY-MM-DD, inclusive, default: today)")
    .option("--task <taskId>", "Only delete entries for a specific task ID")
    .option("--dry-run", "Preview entries that would be deleted")
    .action(async (opts) => {
      try {
        const client = getClient();
        const taskId = opts.task ? Number(opts.task) : undefined;
        const end: string = opts.end ?? formatDate(new Date());

        console.log(`\n  Fetching entries from ${opts.start} to ${end}...\n`);

        const entries = taskId
          ? await client.getEntries(taskId, opts.start, end)
          : await client.getEntriesByDate(opts.start, end);

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

        for (const e of entries) {
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
        console.error(
          "Failed to clear time:",
          err.response?.data || err.message,
        );
        process.exit(1);
      }
    });
}
