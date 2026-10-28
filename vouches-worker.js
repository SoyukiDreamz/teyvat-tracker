// Cloudflare Worker API for Teyvat Pilot Tracker vouches.
// Bind a D1 database named DB and add a secret named VOUCH_SECRET.
// Run schema.sql against the D1 database before deploying.
const ORIGIN = "https://soyukidreamz.github.io";
function cors(origin) {
  const allowed = origin === ORIGIN ? origin : ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Vouch-Secret",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) }
  });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "teyvat-vouches" }, 200, origin);
    if (url.pathname === "/vouches" && request.method === "GET") {
      try {
        const result = await env.DB.prepare(
          "SELECT message_id, author_id, author_name, avatar_url, content, created_at FROM vouches WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 200"
        ).all();
        const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM vouches WHERE is_deleted = 0").first();
        return json({ count: Number(count?.total || 0), vouches: result.results || [] }, 200, origin);
      } catch (_) {
        return json({ error: "Database is not configured yet." }, 503, origin);
      }
    }
    if (url.pathname === "/vouch" && request.method === "POST") {
      if (!env.VOUCH_SECRET || request.headers.get("X-Vouch-Secret") !== env.VOUCH_SECRET) {
        return json({ error: "Unauthorized" }, 401, origin);
      }
      let body;
      try { body = await request.json(); } catch (_) { return json({ error: "Invalid JSON" }, 400, origin); }
      const event = String(body.event || "");
      const vouch = body.vouch && typeof body.vouch === "object" ? body.vouch : body;
      const messageId = String(vouch.id || body.id || body.message_id || "");
      if (!/^\d{15,22}$/.test(messageId)) return json({ error: "Invalid message id" }, 400, origin);
      const action = event === "vouch.deleted" || body.action === "delete" ? "delete" : "upsert";
      if (action === "delete") {
        await env.DB.prepare("UPDATE vouches SET is_deleted = 1 WHERE message_id = ?").bind(messageId).run();
        return json({ ok: true, action, message_id: messageId }, 200, origin);
      }
      const content = String(vouch.content || "").trim().slice(0, 4000);
      if (!content) return json({ ok: true, ignored: true, reason: "empty content" }, 200, origin);
      const authorId = String(vouch.author_id || "").slice(0, 32);
      const authorName = String(vouch.author_name || "Traveler").slice(0, 100);
      const avatarUrl = String(vouch.avatar_url || vouch.avatar || "").slice(0, 500);
      const createdAt = String(vouch.created_at || new Date().toISOString()).slice(0, 40);
      await env.DB.prepare(
        "INSERT INTO vouches (message_id, author_id, author_name, avatar_url, content, created_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, 0) ON CONFLICT(message_id) DO UPDATE SET author_id=excluded.author_id, author_name=excluded.author_name, avatar_url=excluded.avatar_url, content=excluded.content, created_at=excluded.created_at, is_deleted=0"
      ).bind(messageId, authorId, authorName, avatarUrl, content, createdAt).run();
      return json({ ok: true, action, message_id: messageId }, 200, origin);
    }
    return json({ error: "Not found" }, 404, origin);
  }
};
