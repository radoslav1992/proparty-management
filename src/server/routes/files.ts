import { HttpError, uid } from "../../lib/domain";
import type { FileRecord } from "../../lib/types";
import { json } from "../http";
import { del, get, post } from "../router";
import { parse, recordId } from "../schemas";

const MAX_BYTES = 10 * 1024 * 1024;
const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.slice(from, to));
/** The file's real type from its first bytes; the browser's claimed type is ignored. */
function sniff(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (bytes[0] === 137 && ascii(bytes, 1, 4) === "PNG") return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP")
    return "image/webp";
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  return "";
}

export const fileRoutes = [
  get("files/:id", async (c, { id }) => {
    const f = await c.owned<FileRecord & { key: string }>("files", id);
    const obj = await c.env.PROPERTY_FILES.get(f.key);
    if (!obj) throw new HttpError(404, "File not found.");
    return new Response(obj.body, {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `${f.kind === "image" ? "inline" : "attachment"}; filename="${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        // File IDs never change content, so images can stay in the browser cache.
        "Cache-Control":
          f.kind === "image"
            ? "private, max-age=86400, immutable"
            : "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // Opened directly, an uploaded file can never run script or load anything.
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  }),
  del("files/:id", async (c, { id }) => {
    const f = await c.owned<{ key: string }>("files", id);
    await c.db
      .prepare("DELETE FROM files WHERE id=? AND user_id=?")
      .bind(id, c.userId)
      .run();
    await c.env.PROPERTY_FILES.delete(f.key);
    return json({ ok: true });
  }),
  post("files", async (c) => {
    c.requireVerifiedEmail();
    const length = Number(c.request.headers.get("content-length") || 0);
    if (length > MAX_BYTES + 1024 * 1024)
      throw new HttpError(413, "Maximum file size is 10 MB.");
    const form = await c.request.formData();
    const p = await c.owned<{ id: string }>(
      "properties",
      parse(recordId, form.get("property_id")),
    );
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES)
      throw new HttpError(400, "Choose a file up to 10 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniff(bytes);
    if (!mime)
      throw new HttpError(400, "Supported files: JPEG, PNG, WebP and PDF.");
    const count = await c.db
      .prepare(
        "SELECT COUNT(*) AS n FROM files WHERE property_id=? AND user_id=?",
      )
      .bind(p.id, c.userId)
      .first<{ n: number }>();
    if ((count?.n || 0) >= 30)
      throw new HttpError(400, "This property has reached the 30-file limit.");
    const fileId = uid(),
      key = `${c.userId}/${p.id}/${fileId}`;
    await c.env.PROPERTY_FILES.put(key, bytes, {
      httpMetadata: { contentType: mime },
    });
    try {
      await c.db
        .prepare(
          "INSERT INTO files(id,user_id,property_id,key,name,mime,size,kind) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          fileId,
          c.userId,
          p.id,
          key,
          file.name.slice(0, 180),
          mime,
          file.size,
          mime.startsWith("image/") ? "image" : "document",
        )
        .run();
    } catch (err) {
      await c.env.PROPERTY_FILES.delete(key);
      throw err;
    }
    return json({ id: fileId }, 201);
  }),
];
