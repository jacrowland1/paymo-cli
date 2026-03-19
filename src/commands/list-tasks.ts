import { Command } from "commander";
import { getClient } from "./_shared";

export function registerListTasks(program: Command): void {
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
        console.error(
          "Failed to list tasks:",
          err.response?.data || err.message,
        );
        process.exit(1);
      }
    });
}
