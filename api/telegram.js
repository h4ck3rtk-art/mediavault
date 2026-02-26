// api/telegram.js — Vercel Serverless Function
// Secrets live ONLY in Vercel Environment Variables, never in the browser.

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Read secrets from Vercel Environment Variables
  const BOT_TOKEN        = process.env.TELEGRAM_BOT_TOKEN;
  const CHANNEL_ID       = process.env.TELEGRAM_CHANNEL_ID;
  const CORRECT_PASSWORD = process.env.VAULT_PASSWORD;

  if (!BOT_TOKEN || !CHANNEL_ID || !CORRECT_PASSWORD) {
    return res.status(500).json({
      error: "Server misconfigured — set TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID and VAULT_PASSWORD in Vercel Environment Variables."
    });
  }

  const { action, password, file_id } = req.body;

  // Validate password on every request
  if (!password || password !== CORRECT_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }

  try {
    // ── Just verify password ──
    if (action === "verify") {
      return res.status(200).json({ ok: true });
    }

    // ── Fetch media posts from Telegram ──
    if (action === "getUpdates") {
      const tgRes  = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=100&allowed_updates=["channel_post"]`
      );
      const tgData = await tgRes.json();

      if (!tgData.ok) {
        return res.status(502).json({ error: tgData.description || "Telegram API error" });
      }

      const targetId = CHANNEL_ID.replace(/^-100/, "");
      const posts = tgData.result
        .filter(u => {
          const post = u.channel_post;
          if (!post) return false;
          return String(post.chat.id).includes(targetId) && (post.photo || post.video);
        })
        .map(u => {
          const post = u.channel_post;
          if (post.photo) {
            const largest = post.photo[post.photo.length - 1];
            return { type: "photo", file_id: largest.file_id, date: post.date };
          }
          return { type: "video", file_id: post.video.file_id, date: post.date };
        });

      return res.status(200).json({ ok: true, posts });
    }

    // ── Resolve file URL (token never sent to browser) ──
    if (action === "getFileUrl") {
      if (!file_id) return res.status(400).json({ error: "file_id required" });

      const tgRes  = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${file_id}`);
      const tgData = await tgRes.json();

      if (!tgData.ok || !tgData.result.file_path) {
        return res.status(502).json({ error: "Could not resolve file" });
      }

      const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgData.result.file_path}`;
      return res.status(200).json({ ok: true, url });
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (err) {
    return res.status(500).json({ error: "Proxy error: " + err.message });
  }
}
