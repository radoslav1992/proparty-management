import { html } from "lit-html";
import { app, property } from "../state";
import { arrow, btn, empty, heading } from "../ui";

export function documents() {
  const files = app.data.files;
  return html`${heading(
    "Every detail, safely in its place.",
    "Private property photos and PDF documents. Up to 10 MB per file.",
    btn("+ Upload file", "upload-file"),
  )}
  ${
    files.length
      ? html`<div class="file-grid">
          ${files.map(
            (f) =>
              html`<article class="file-card">
                ${
                  f.kind === "image"
                    ? html`<img
                        src="/api/files/${f.id}"
                        alt=${f.name}
                        loading="lazy"
                      />`
                    : html`<div class="pdf-icon">▤ PDF</div>`
                }
                <strong>${f.name}</strong>
                <p>
                  ${property(f.property_id)?.name} ·
                  ${(f.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <div>
                  <a href="/api/files/${f.id}" target="_blank" rel="noopener"
                    >${f.kind === "image" ? "Open image" : "Download PDF"}
                    ${arrow}</a
                  >${btn("Delete", "delete-files", f.id, "icon-button danger")}
                </div>
              </article>`,
          )}
        </div>`
      : empty(
          "Your files deserve a home.",
          "Upload a property photo or a PDF lease. They will stay private to your workspace.",
          "Upload file",
          "upload-file",
        )
  }`;
}
