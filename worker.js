// Cloudflare Worker: nơi lưu chung cho web box (số tim + tường lời chúc)
// Cần: 1 KV namespace gắn với tên biến BOX, và 1 secret tên ADMIN_TOKEN (mật khẩu quản trị do bạn tự đặt).

const MAX_NOTES = 40;   // số lời chúc tối đa trên tường
const MAX_LEN = 60;     // độ dài tối đa mỗi lời chúc / tên
const MAX_NAMES = 300;  // số tên tối đa có số tim

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Admin",
};
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const clean = (s) => String(s || "").replace(/[<>&"]/g, "").trim().slice(0, MAX_LEN);

// Giới hạn chống spam theo địa chỉ IP (lưu trong bộ nhớ, không tốn lượt ghi KV)
const hits = new Map();
function limited(ip, kind, max, windowMs) {
  const key = ip + "|" + kind, now = Date.now();
  let h = hits.get(key);
  if (!h || now - h.t > windowMs) h = { t: now, c: 0 };
  h.c++;
  hits.set(key, h);
  if (hits.size > 5000) hits.clear();
  return h.c > max;
}

async function load(env) {
  const s = await env.BOX.get("state", "json");
  return s && typeof s === "object"
    ? { hearts: s.hearts || {}, notes: Array.isArray(s.notes) ? s.notes : [] }
    : { hearts: {}, notes: [] };
}
const save = (env, st) => env.BOX.put("state", JSON.stringify(st));

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const path = new URL(req.url).pathname;
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    try {
      if (req.method === "GET") return json(await load(env));
      if (req.method !== "POST") return json({ error: "không hỗ trợ" }, 405);

      const b = await req.json().catch(() => ({}));
      const st = await load(env);

      if (path === "/heart") {
        if (limited(ip, "heart", 40, 60000)) return json({ error: "thả tim hơi nhanh, đợi chút nhé" }, 429);
        const name = clean(b.name);
        const n = Math.min(20, Math.max(1, parseInt(b.n) || 1));
        if (!name) return json({ error: "thiếu tên" }, 400);
        if (!(name in st.hearts) && Object.keys(st.hearts).length >= MAX_NAMES) return json({ error: "đã đầy" }, 400);
        st.hearts[name] = (st.hearts[name] || 0) + n;
        await save(env, st);
        return json(st);
      }

      if (path === "/note") {
        if (limited(ip, "note", 3, 60000)) return json({ error: "dán hơi nhiều, đợi một lát nhé" }, 429);
        const t = clean(b.text);
        if (!t) return json({ error: "lời chúc trống" }, 400);
        st.notes.push({ t, d: Date.now() });
        while (st.notes.length > MAX_NOTES) st.notes.shift();
        await save(env, st);
        return json(st);
      }

      // Các lệnh quản trị cần mật khẩu trong header X-Admin
      if (path.startsWith("/admin/")) {
        if (!env.ADMIN_TOKEN || req.headers.get("X-Admin") !== env.ADMIN_TOKEN) return json({ error: "sai mật khẩu" }, 403);
        if (path === "/admin/note-delete") {
          const i = parseInt(b.i);
          if (i >= 0 && i < st.notes.length) st.notes.splice(i, 1);
        } else if (path === "/admin/notes-clear") {
          st.notes = [];
        } else if (path === "/admin/hearts-reset") {
          st.hearts = {};
        } else return json({ error: "không có lệnh này" }, 404);
        await save(env, st);
        return json(st);
      }

      return json({ error: "không tìm thấy" }, 404);
    } catch (e) {
      return json({ error: "lỗi máy chủ" }, 500);
    }
  },
};
