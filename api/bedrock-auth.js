import { createAssetSessionCookie, verifyAssetPassword, hasAssetSession } from "../src/server/asset-auth.js";

export default async function handler(request) {
  if (request.method === "GET") {
    return Response.json({ authenticated: hasAssetSession(request) });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  if (!verifyAssetPassword(body?.password)) {
    return Response.json({ error: "Invalid access key." }, { status: 401 });
  }

  try {
    return Response.json(
      { authenticated: true },
      { headers: { "Set-Cookie": createAssetSessionCookie(), "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json({ error: "Private asset access is not configured." }, { status: 503 });
  }
}
