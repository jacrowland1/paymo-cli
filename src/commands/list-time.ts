import { Command } from "commander";
import { getClient } from "./_shared";
import { getDateRange, formatDate } from "../utils/dates";
import { PaymoEntry } from "../types";

export function registerListTime(program: Command): void {
  program
    .command("list-time")
    .description("List time entries for each day in a date range")
    .requiredOption("--start <date>", "Start date (YYYY-MM-DD, inclusive)")
    .option("--end <date>", "End date (YYYY-MM-DD, inclusive, default: today)")
    .option("--task <taskId>", "Only show entries for a specific task ID")
    .option("--include-empty", "Show days with no entries")
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

        const tasks = await client.getTasks();
        const taskMap = new Map(tasks.map((t) => [t.id, t.name]));
        const projects = await client.getProjects(false);
        const projectMap = new Map(projects.map((p) => [p.id, p.name]));

        const byDate = new Map<string, PaymoEntry[]>();
        for (const e of entries) {
          const date = e.date || e.start_time?.split("T")[0] || "unknown";
          if (!byDate.has(date)) byDate.set(date, []);
          byDate.get(date)!.push(e);
        }

        const sortedDates = opts.includeEmpty
          ? getDateRange(opts.start, end)
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
        console.error(
          "Failed to list time:",
          err.response?.data || err.message,
        );
        process.exit(1);
      }
    });
}
