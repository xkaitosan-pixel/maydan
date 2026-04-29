import { Router } from "express";

const router = Router();

router.post("/run-migration", async (_req, res) => {
  const supabaseUrl = process.env["SUPABASE_URL"] ?? "https://hnoqkcrzualzxkzmuwvp.supabase.co";
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!serviceRoleKey) {
    res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not available" });
    return;
  }

  // Run DDL via Supabase's pg REST endpoint (requires service role)
  const sql = `ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS country text DEFAULT '';`;

  const r = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await r.text();

  if (r.ok) {
    res.json({ success: true, detail: body });
  } else {
    // exec_sql may not exist; try direct query approach
    res.json({ success: false, status: r.status, detail: body, note: "exec_sql RPC not available — DDL must be run via dashboard" });
  }
});

export default router;
