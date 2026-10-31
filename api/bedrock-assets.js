import { Readable } from "node:stream";
import { get, put } from "@vercel/blob";
import { hasAssetSession } from "../src/server/asset-auth.js";

const ASSET_PATH = "bedrock-assets/bedrock-assets-prepared.zip";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// Keep the raw multipart request stream available for Request.formData().
export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  if (request.method === "GET" && request.query?.status === "1") {
    try {
      const result = await get(ASSET_PATH, { access: "private" });
      return response.status(200).json({ available: Boolean(result) });
    } catch (error) {
      console.error("Private Bedrock Blob status failed:", error);
      return response.status(200).json({ available: false });
    }
  }

  if (!hasAssetSession(request)) {
    return response.status(401).json({ error: "Authentication required." });
  }

  if (request.method === "GET") {
    try {
      const result = await get(ASSET_PATH, {
        access: "private",
        ifNoneMatch: request.headers["if-none-match"] || undefined
      });
      if (!result) return response.status(404).send("Private Bedrock pack not found.");

      response.setHeader("Content-Type", "application/zip");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Cache-Control", "private, no-cache");
      response.setHeader("ETag", result.blob.etag);
      if (result.statusCode === 304) return response.status(304).end();
      response.setHeader("Content-Length", String(result.blob.size));
      response.setHeader("Content-Disposition", 'attachment; filename="bedrock-assets-prepared.zip"');
      return Readable.fromWeb(result.stream).pipe(response);
    } catch (error) {
      console.error("Private Bedrock Blob read failed:", error);
      return response.status(502).json({ error: "Private storage could not deliver the resource pack." });
    }
  }

  if (request.method === "POST") {
    try {
      const contentLength = Number(request.headers["content-length"] || 0);
      if (contentLength > MAX_UPLOAD_BYTES + 128 * 1024) {
        return response.status(413).json({ error: "ZIP excede o limite de 4 MiB." });
      }

      const webRequest = new Request("https://" + (request.headers.host || "localhost") + request.url, {
        method: "POST",
        headers: request.headers,
        body: request,
        duplex: "half"
      });
      const form = await webRequest.formData();
      const file = form.get("file");
      if (!(file instanceof Blob) || file.size < 22 || file.size > MAX_UPLOAD_BYTES) {
        return response.status(400).json({ error: "Envie o ZIP preparado (até 4 MiB)." });
      }
      const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
        return response.status(400).json({ error: "O arquivo selecionado não parece ser um ZIP válido." });
      }

      const saved = await put(ASSET_PATH, file, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/zip",
        cacheControlMaxAge: 60
      });
      return response.status(200).json({ uploaded: true, size: file.size, pathname: saved.pathname });
    } catch (error) {
      console.error("Private Bedrock Blob upload failed:", error);
      return response.status(502).json({ error: "Não foi possível armazenar o ZIP privado na Vercel." });
    }
  }

  response.setHeader("Allow", "GET, POST");
  return response.status(405).send("Method Not Allowed");
}
