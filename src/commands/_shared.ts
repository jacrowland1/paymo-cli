import { PaymoClient } from "../paymoClient";

export const HOURS_PER_DAY = 8;
export const SECONDS_PER_HOUR = 3600;

export function getClient(): PaymoClient {
  const apiKey = process.env.PAYMO_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: PAYMO_API_KEY must be set in .env file or environment variables.",
    );
    process.exit(1);
  }
  return new PaymoClient(apiKey);
}
