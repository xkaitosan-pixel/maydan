const supabaseUrl = process.env["VITE_SUPABASE_URL"] ?? "https://hnoqkcrzualzxkzmuwvp.supabase.co";
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const anonKey = process.env["VITE_SUPABASE_ANON_KEY"] ?? "sb_publishable_eZVVmvhqAYdiyPfBWqddTw_yk_1JxJy";

const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] ?? "";

console.log(`Project ref: ${projectRef}`);
console.log(`Service role key available: ${!!serviceRoleKey}`);

async function trySql(sql: string, description: string): Promise<boolean> {
  console.log(`\n--- ${description} ---`);
  
  // Method 1: Supabase Management API (needs PAT, but try with service role key)
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.ok) {
      console.log(`  ✅ Management API OK`);
      return true;
    }
    console.log(`  Management API (${res.status}): ${text.slice(0, 120)}`);
  } catch (e) {
    console.log(`  Management API error: ${(e as Error).message}`);
  }

  return false;
}

async function checkTable(tableName: string): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${tableName}?select=*&limit=1`, {
    headers: {
      "apikey": serviceRoleKey || anonKey,
      "Authorization": `Bearer ${serviceRoleKey || anonKey}`,
    },
  });
  return res.status !== 404 && res.status !== 400;
}

async function runMigrations() {
  const migrations = [
    { sql: `ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS auto_advance_seconds int DEFAULT 0`, desc: "party_rooms.auto_advance_seconds" },
    { sql: `ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS question_start_time bigint DEFAULT 0`, desc: "party_rooms.question_start_time" },
    { sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text`, desc: "users.display_name" },
    { sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS country text DEFAULT ''`, desc: "users.country" },
    { sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text DEFAULT ''`, desc: "users.bio" },
    {
      sql: `CREATE TABLE IF NOT EXISTS daily_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  country text DEFAULT '',
  score int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 5,
  date text NOT NULL,
  completed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
)`,
      desc: "CREATE daily_scores"
    },
  ];

  let anySuccess = false;
  for (const { sql, desc } of migrations) {
    const ok = await trySql(sql, desc);
    if (ok) anySuccess = true;
  }

  // Verify current state
  console.log("\n=== VERIFICATION ===");
  
  // Check daily_scores
  const dailyExists = await checkTable("daily_scores");
  console.log(`daily_scores table accessible: ${dailyExists ? "✅ YES" : "❌ NO"}`);

  // Check users columns
  const usersRes = await fetch(`${supabaseUrl}/rest/v1/users?select=id,display_name,country,bio&limit=1`, {
    headers: {
      "apikey": serviceRoleKey || anonKey,
      "Authorization": `Bearer ${serviceRoleKey || anonKey}`,
    },
  });
  const usersStatus = usersRes.status;
  const usersText = await usersRes.text();
  if (usersStatus === 200) {
    console.log(`users.display_name/country/bio columns: ✅ EXIST`);
    console.log(`Sample: ${usersText.slice(0, 100)}`);
  } else {
    console.log(`users columns check (${usersStatus}): ${usersText.slice(0, 200)}`);
  }

  // Check party_rooms columns
  const partyRes = await fetch(`${supabaseUrl}/rest/v1/party_rooms?select=auto_advance_seconds&limit=1`, {
    headers: {
      "apikey": serviceRoleKey || anonKey,
      "Authorization": `Bearer ${serviceRoleKey || anonKey}`,
    },
  });
  if (partyRes.status === 200) {
    console.log(`party_rooms.auto_advance_seconds: ✅ EXISTS`);
  } else {
    const pt = await partyRes.text();
    console.log(`party_rooms.auto_advance_seconds check (${partyRes.status}): ${pt.slice(0, 150)}`);
  }
}

runMigrations().catch(console.error);
