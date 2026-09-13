import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load LOCAL Supabase credentials for integration tests. `.env.test` is
// gitignored (see .env.test.example); it must point at the local stack, never
// the remote project in .env/.dev.vars.
const envPath = fileURLToPath(new URL("../../.env.test", import.meta.url));

if (!existsSync(envPath)) {
  throw new Error(".env.test not found — copy .env.test.example to .env.test and fill it from `npx supabase status`.");
}

process.loadEnvFile(envPath);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`.env.test is missing ${name} — populate it from \`npx supabase status\`.`);
  }
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// Fail fast with an actionable message if the local stack isn't running.
try {
  const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
    headers: { apikey: anonKey },
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
} catch (err) {
  throw new Error(
    `Local Supabase stack not reachable at ${supabaseUrl} (${String(err)}). Run \`npx supabase start\` before integration tests.`,
  );
}
