/** Runtime bindings available to the Compass Worker. Expanded by `pnpm cf:typegen` later. */
export type WorkerBindings = {
  ASSETS?: { fetch: typeof fetch };
  HYPERDRIVE?: { connectionString: string };
  APP_MODE?: string;
  AUTH_MODE?: string;
  MODEL_MODE?: string;
  APP_ORIGIN?: string;
  MODEL_API_KEY?: string;
  DATABASE_URL?: string;
};
