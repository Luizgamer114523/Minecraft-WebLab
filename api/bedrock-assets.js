import { get, put } from "@vercel/blob";
import { hasAssetSession } from "../src/server/asset-auth.js";

const ASSET_PATH = "bedrock-assets/bedrock-assets-prepared.zip";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export default async function handler(request) {
  if (!hasAssetSession(request)) {
    return Response.json({ error: "Authentication required." }, {
      status: 401,
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (request.method === "GET") {
    try {
      const result = await get(ASSET_PATH, {
        access: "private",
        ifNoneMatch: request.headers.get("if-none-match") || undefined
      });
      if (!result) return new Response("Private Bedrock pack not found.", { status: 404 });
      if (result.statusCode === 304) {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: result.blob.etag,
            "Cache-Control": "private, no-cache"
          }
        });
      }
      return new Response(result.stream, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(result.blob.size),
          "Content-Disposition": 'attachment; filename="bedrock-assets-prepared.zip"',
          "X-Content-Type-Options": "nosniff",
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache"
        }
      });
    } catch (error) {
      console.error("Private Bedrock Blob read failed:", error);
      return Response.json({ error: "Private storage could not deliver the resource pack." }, { status: 502 });
    }
  }

  if (request.method === "POST") {
    try {
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > MAX_UPLOAD_BYTES + 128 * 1024) {
        return Response.json({ error: "ZIP excede o limite de 4 MiB." }, { status: 413 });
      }
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof Blob) || file.size < 22 || file.size > MAX_UPLOAD_BYTES) {
        return Response.json({ error: "Envie o ZIP preparado (até 4 MiB)." }, { status: 400 });
      }
      const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
        return Response.json({ error: "O arquivo selecionado não parece ser um ZIP válido." }, { status: 400 });
      }

      const saved = await put(ASSET_PATH, file, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/zip",
        cacheControlMaxAge: 60
      });
      return Response.json({ uploaded: true, size: file.size, pathname: saved.pathname }, {
        headers: { "Cache-Control": "no-store" }
      });
    } catch (error) {
      console.error("Private Bedrock Blob upload failed:", error);
      return Response.json({ error: "Não foi possível armazenar o ZIP privado na Vercel." }, { status: 502 });
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
}
