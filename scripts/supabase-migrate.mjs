/**
 * Run Supabase migrations via direct pg connection
 * Usage: node scripts/supabase-migrate.mjs
 */
import pg from "pg";

const { Client } = pg;

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY env var not set");
  process.exit(1);
}

// Supabase transaction pooler connection string
// Format: postgresql://postgres.[project-ref]:[service_role_key]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
const PROJECT_REF = "hnoqkcrzualzxkzmuwvp";
const CONNECTION_STRING = `postgresql://postgres.${PROJECT_REF}:${SERVICE_ROLE_KEY}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require`;

const MIGRATIONS = [
  // party_rooms columns
  "ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS auto_advance_seconds int DEFAULT 0",
  "ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS question_start_time bigint DEFAULT 0",
  // users profile fields
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS country text DEFAULT ''",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text DEFAULT ''",
  // daily_scores additional columns (table already exists)
  "ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT ''",
  "ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS country text DEFAULT ''",
  "ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS score int NOT NULL DEFAULT 0",
  "ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS total int NOT NULL DEFAULT 5",
  "ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS date text NOT NULL DEFAULT ''",
  "ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT now()",
  // unique constraint
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'daily_scores'::regclass AND conname = 'daily_scores_user_id_date_key'
    ) THEN
      ALTER TABLE daily_scores ADD CONSTRAINT daily_scores_user_id_date_key UNIQUE (user_id, date);
    END IF;
  END $$`,
];

async function run() {
  const client = new Client({ connectionString: CONNECTION_STRING });
  
  try {
    console.log("Connecting to Supabase...");
    await client.connect();
    console.log("✅ Connected!\n");
    
    for (const sql of MIGRATIONS) {
      const label = sql.slice(0, 70).replace(/\n/g, " ");
      try {
        await client.query(sql);
        console.log(`✅ ${label}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // "already exists" errors are fine
        if (msg.includes("already exists") || msg.includes("duplicate column")) {
          console.log(`⏭  ${label} (already exists)`);
        } else {
          console.log(`❌ ${label}\n   Error: ${msg}`);
        }
      }
    }

    // Verify
    console.log("\n--- Verification ---");
    const checks = [
      ["party_rooms", "auto_advance_seconds"],
      ["users", "country"],
      ["users", "bio"],
      ["daily_scores", "date"],
      ["daily_scores", "display_name"],
      ["daily_scores", "score"],
      ["daily_scores", "total"],
    ];

    for (const [table, col] of checks) {
      try {
        await client.query(`SELECT ${col} FROM ${table} LIMIT 0`);
        console.log(`✅ ${table}.${col}`);
      } catch {
        console.log(`❌ ${table}.${col} — MISSING`);
      }
    }

  } finally {
    await client.end();
    console.log("\nDone.");
  }
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
