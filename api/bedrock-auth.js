import { createAssetSessionCookie, verifyAssetPassword, hasAssetSession } from "../src/server/asset-auth.js";

function readJsonBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  try {
    const raw = Buffer.isBuffer(request.body) ? request.body.toString("utf8") : String(request.body || "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function handler(request, response) {
  if (request.method === "GET") {
    return response.status(200).json({ authenticated: hasAssetSession(request) });
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).send("Method Not Allowed");
  }

  const body = readJsonBody(request);
  if (!verifyAssetPassword(body?.password)) {
    return response.status(401).json({ error: "Invalid access key." });
  }

  try {
    response.setHeader("Set-Cookie", createAssetSessionCookie());
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ authenticated: true });
  } catch {
    return response.status(503).json({ error: "Private asset access is not configured." });
  }
}
