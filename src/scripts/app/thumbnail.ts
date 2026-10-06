/** Adds a small preview (640 px wide at most) of an uploaded photo; without one, cards show the original. */
export async function withThumbnail(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !/^image\/(jpeg|png|webp)$/.test(file.type))
    return form;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 640 / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    // Re-encoding also leaves out camera metadata such as GPS position.
    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await new Promise<Blob | null>((done) =>
        canvas.toBlob(done, type, 0.8),
      );
      if (blob?.type === type) {
        form.set(
          "thumb",
          blob,
          type === "image/webp" ? "thumb.webp" : "thumb.jpg",
        );
        break;
      }
    }
  } catch {
    // The upload goes ahead without a preview.
  }
  return form;
}
