/** Minimal Worker env until `pnpm cf:typegen` is run against a configured account. */
interface Env {
  ASSETS?: Fetcher;
  HYPERDRIVE?: { connectionString: string };
  APP_MODE?: string;
  AUTH_MODE?: string;
  MODEL_MODE?: string;
  MODEL_API_KEY?: string;
  DATABASE_URL?: string;
}
