/**
 * Supabase migration script — adds columns needed for Daily Challenge, Profile, Party Mode
 * Run with: pnpm --filter @workspace/scripts run migrate-supabase
 */
import pg from "pg";

const { Client } = pg;

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

const PROJECT_REF = "hnoqkcrzualzxkzmuwvp";

// The service role key IS a JWT, not a DB password.
// Supabase's pg connection requires the actual DB password (set in Dashboard > Settings > Database).
// However, we can use the Supabase Management API with the service_role key via the admin endpoint.
// Alternatively: use the built-in postgres-meta RPC that Supabase exposes.

// Use supabase URL-based postgres connection (direct, not pooler)
// Format: postgresql://postgres:[DB_PASSWORD]@db.[project-ref].supabase.co:5432/postgres
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://hnoqkcrzualzxkzmuwvp.supabase.co";
const CONNECTION_STRING = `postgresql://postgres:${SERVICE_ROLE_KEY}@db.${PROJECT_REF}.supabase.co:5432/postgres`;

const MIGRATIONS: Array<[string, string]> = [
  ["ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS auto_advance_seconds int DEFAULT 0", "party_rooms.auto_advance_seconds"],
  ["ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS question_start_time bigint DEFAULT 0", "party_rooms.question_start_time"],
  ["ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text", "users.display_name"],
  ["ALTER TABLE users ADD COLUMN IF NOT EXISTS country text DEFAULT ''", "users.country"],
  ["ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text DEFAULT ''", "users.bio"],
  ["ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT ''", "daily_scores.display_name"],
  ["ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS country text DEFAULT ''", "daily_scores.country"],
  ["ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS score int NOT NULL DEFAULT 0", "daily_scores.score"],
  ["ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS total int NOT NULL DEFAULT 5", "daily_scores.total"],
  ["ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS date text NOT NULL DEFAULT ''", "daily_scores.date"],
  ["ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT now()", "daily_scores.completed_at"],
  [
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'daily_scores'::regclass AND conname = 'daily_scores_user_id_date_key'
      ) THEN
        ALTER TABLE daily_scores ADD CONSTRAINT daily_scores_user_id_date_key UNIQUE (user_id, date);
      END IF;
    END $$`,
    "daily_scores UNIQUE(user_id, date)",
  ],
];

const VERIFY: Array<[string, string]> = [
  ["party_rooms", "auto_advance_seconds"],
  ["users", "country"],
  ["users", "bio"],
  ["daily_scores", "date"],
  ["daily_scores", "display_name"],
  ["daily_scores", "score"],
  ["daily_scores", "total"],
];

async function main() {
  console.log("🔗 Connecting to Supabase (Transaction Pooler)...");

  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("✅ Connected!\n");

    for (const [sql, label] of MIGRATIONS) {
      try {
        await client.query(sql);
        console.log(`✅ ${label}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("duplicate column") || msg.includes("column") && msg.includes("of relation") && msg.includes("already exists")) {
          console.log(`⏭  ${label} (already exists)`);
        } else {
          console.error(`❌ ${label}: ${msg}`);
        }
      }
    }

    console.log("\n--- Verification ---");
    let allOk = true;
    for (const [table, col] of VERIFY) {
      try {
        await client.query(`SELECT ${col} FROM ${table} LIMIT 0`);
        console.log(`✅ ${table}.${col}`);
      } catch {
        console.log(`❌ ${table}.${col} — MISSING`);
        allOk = false;
      }
    }

    console.log(allOk ? "\n🎉 All migrations complete!" : "\n⚠️  Some columns still missing — check errors above.");
    process.exit(allOk ? 0 : 1);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
