import { Command } from "commander";
import { getClient, HOURS_PER_DAY } from "./_shared";
import { loadConfig } from "../utils/config";
import { getPeriodRange, getWorkingDays } from "../utils/dates";
import { PaymoEntry } from "../types";

export function registerStatus(program: Command): void {
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
        const targetHours = Number(config.hours ?? HOURS_PER_DAY);

        const allWeekDays = getWorkingDays(weekStart, today);
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
        console.error(
          "Failed to get status:",
          err.response?.data || err.message,
        );
        process.exit(1);
      }
    });
}
