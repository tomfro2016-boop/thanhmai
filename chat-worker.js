// Dán vào Cloudflare Worker "box-api" (cần KV binding, ở đây tên là BOX: đổi lại nếu bạn đặt tên khác)
// Trong fetch(): if (url.pathname === "/chat") return chatApi(request, env);
const CORS = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type,X-Admin","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json"};
async function chatApi(request, env) {
  if (request.method === "OPTIONS") return new Response(null, {headers: CORS});
  let chat = JSON.parse((await env.BOX.get("chat")) || "[]");
  if (request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const n = String(b.name || "").trim().slice(0, 16), t = String(b.text || "").trim().slice(0, 200);
    if (!n || !t) return new Response(JSON.stringify({error: "Thiếu tên hoặc tin nhắn"}), {status: 400, headers: CORS});
    chat.push({n, t, d: Date.now()});
    chat = chat.slice(-100);
    await env.BOX.put("chat", JSON.stringify(chat));
  }
  return new Response(JSON.stringify({chat: chat.slice(-60)}), {headers: CORS});
}
