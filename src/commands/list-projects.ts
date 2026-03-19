import { Command } from "commander";
import { getClient } from "./_shared";

export function registerListProjects(program: Command): void {
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
}
