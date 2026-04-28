import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.post("/migrate", async (req: Request, res: Response) => {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  const supabaseUrl = process.env["VITE_SUPABASE_URL"] ?? "https://hnoqkcrzualzxkzmuwvp.supabase.co";
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] ?? "hnoqkcrzualzxkzmuwvp";
  
  const results: Array<{ sql: string; status: string; error?: string }> = [];
  
  if (!serviceRoleKey) {
    return res.json({ 
      error: "SUPABASE_SERVICE_ROLE_KEY not available in process.env",
      availableEnvKeys: Object.keys(process.env).filter(k => !k.includes("SECRET") && !k.includes("PASSWORD") && !k.includes("KEY")).join(", ")
    });
  }
  
  const migrations = [
    `ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS auto_advance_seconds int DEFAULT 0`,
    `ALTER TABLE party_rooms ADD COLUMN IF NOT EXISTS question_start_time bigint DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS country text DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text DEFAULT ''`,
    `CREATE TABLE IF NOT EXISTS daily_scores (
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
  ];

  for (const sql of migrations) {
    // Try Management API
    try {
      const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      });
      const body = await resp.json() as { error?: string; message?: string };
      if (resp.ok) {
        results.push({ sql: sql.slice(0, 60), status: "ok_management_api" });
        continue;
      }
      // Try pg-proxy or other approaches
      results.push({ sql: sql.slice(0, 60), status: "failed", error: `${resp.status}: ${JSON.stringify(body)}` });
    } catch (e) {
      results.push({ sql: sql.slice(0, 60), status: "error", error: String(e) });
    }
  }
  
  // Verify tables
  const verifyRes = await fetch(`${supabaseUrl}/rest/v1/daily_scores?select=id&limit=1`, {
    headers: { "apikey": serviceRoleKey, "Authorization": `Bearer ${serviceRoleKey}` }
  });
  const dailyOk = verifyRes.status === 200;

  const usersRes = await fetch(`${supabaseUrl}/rest/v1/users?select=display_name,country,bio&limit=1`, {
    headers: { "apikey": serviceRoleKey, "Authorization": `Bearer ${serviceRoleKey}` }
  });
  const usersOk = usersRes.status === 200;
  
  return res.json({ 
    results, 
    verification: { daily_scores: dailyOk, users_columns: usersOk },
    keyAvailable: !!serviceRoleKey,
    keyPrefix: serviceRoleKey.slice(0, 20) + "..."
  });
});

export default router;
