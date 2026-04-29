import { Router } from "express";

const router = Router();

const SUPABASE_URL = "https://hnoqkcrzualzxkzmuwvp.supabase.co";

router.post("/avatar", async (req, res) => {
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceKey) {
    res.status(503).json({ error: "Storage service not configured" });
    return;
  }

  const { userId, contentType, data } = req.body as {
    userId?: string;
    contentType?: string;
    data?: string;
  };

  if (!userId || !data) {
    res.status(400).json({ error: "userId and data are required" });
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
  const path = `${userId}/avatar.${ext}`;
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
