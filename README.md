# Paymo Timesheet CLI

CLI tool to automate Paymo timesheet entries — bulk add time for development activities without touching the UI.

## Setup

```bash
cd paymo
npm install
```

Copy `.env.example` to `.env` and fill in your Paymo credentials:

```
PAYMO_EMAIL=your-email@example.com
PAYMO_PASSWORD=your-password
```

## Commands

### List Projects

List all active projects:

```bash
npx ts-node src/index.ts list-projects
```

Include archived projects:

```bash
npx ts-node src/index.ts list-projects --all
```

### List Tasks

List all tasks:

```bash
npx ts-node src/index.ts list-tasks
```

Filter by project:

```bash
npx ts-node src/index.ts list-tasks -p <projectId>
```

### Add Time

Bulk add time entries for a date range. Weekends are excluded automatically.

```bash
npx ts-node src/index.ts add-time --start 2026-03-02 --end 2026-03-06 --task 12345
```

#### Flags

| Flag | Required | Default | Description |
| --- | --- | --- | --- |
| `--start <date>` | Yes | — | Start date (YYYY-MM-DD, inclusive) |
| `--end <date>` | Yes | — | End date (YYYY-MM-DD, inclusive) |
| `--task <taskId>` | Yes | — | Task ID to log time against |
| `--hours <hours>` | No | `8` | Hours per day |
| `--exclude <dates>` | No | — | Comma-separated dates to skip (e.g. `2026-03-04,2026-03-05`) |
| `--description <text>` | No | `Development` | Description for the time entries |
| `--dry-run` | No | — | Preview entries without creating them |

#### Examples

Add 8 hours/day for a full work week:

```bash
npx ts-node src/index.ts add-time --start 2026-03-02 --end 2026-03-06 --task 12345
```

Add 6 hours/day, excluding a leave day:

```bash
npx ts-node src/index.ts add-time --start 2026-03-02 --end 2026-03-06 --task 12345 --hours 6 --exclude 2026-03-04
```

Preview what would be created without actually creating entries:

```bash
npx ts-node src/index.ts add-time --start 2026-03-02 --end 2026-03-06 --task 12345 --dry-run
```

## Authentication

Uses [Paymo Basic Auth](https://github.com/paymo-org/api/blob/master/sections/authentication.md#basic-auth) with email and password from the `.env` file.

## API Reference

- [Paymo API](https://github.com/paymo-org/api)
- [Time Entries](https://github.com/paymo-org/api/blob/master/sections/entries.md)
- [Projects](https://github.com/paymo-org/api/blob/master/sections/projects.md)
- [Tasks](https://github.com/paymo-org/api/blob/master/sections/tasks.md)
