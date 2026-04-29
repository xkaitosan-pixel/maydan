import { Router } from "express";

const router = Router();

router.post("/create-storage-bucket", async (_req, res) => {
  const supabaseUrl = process.env["SUPABASE_URL"] ?? "https://hnoqkcrzualzxkzmuwvp.supabase.co";
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!serviceRoleKey) {
    res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not available in process env" });
    return;
  }

  const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: "avatars", name: "avatars", public: true }),
  });

  const createBody = await createRes.text();

  if (createRes.status === 200 || createRes.status === 201) {
    res.json({ success: true, message: "avatars bucket created", detail: createBody });
  } else if (createRes.status === 409 || createBody.includes("already exists")) {
    res.json({ success: true, message: "avatars bucket already exists" });
  } else {
    res.status(500).json({ success: false, status: createRes.status, detail: createBody });
  }
});

export default router;
