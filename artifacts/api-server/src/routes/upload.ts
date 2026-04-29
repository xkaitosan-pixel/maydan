import { Router } from "express";

const router = Router();

const SUPABASE_URL = "https://hnoqkcrzualzxkzmuwvp.supabase.co";

router.post("/avatar", async (req, res) => {
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceKey) {
    res.status(503).json({ error: "Storage service not configured" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const userToken = authHeader.slice(7);

  const authResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${userToken}` },
  });
  if (!authResp.ok) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }
  const authUser = (await authResp.json()) as { id?: string };
  const authId = authUser.id;
  if (!authId) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  const dbUserResp = await fetch(
    `${SUPABASE_URL}/rest/v1/users?auth_id=eq.${authId}&select=id`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const dbUsers = (await dbUserResp.json()) as Array<{ id: string }>;
  const dbUserId = dbUsers[0]?.id;
  if (!dbUserId) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { contentType, data } = req.body as { contentType?: string; data?: string };
  if (!data) {
    res.status(400).json({ error: "data is required" });
    return;
  }

  const ct = contentType || "image/jpeg";
  const ext = ct.includes("png")
    ? "png"
    : ct.includes("webp")
      ? "webp"
      : ct.includes("gif")
        ? "gif"
        : "jpg";
  const path = `${dbUserId}/avatar.${ext}`;
  const buffer = Buffer.from(data, "base64");

  for (const method of ["POST", "PUT"] as const) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": ct,
      },
      body: buffer,
    });

    if (r.ok) {
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
      res.json({ url: publicUrl });
      return;
    }

    if (method === "PUT") {
      const errBody = await r.text();
      res.status(500).json({ error: errBody.slice(0, 300) });
      return;
    }
  }
});

export default router;
