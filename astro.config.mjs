import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
export default defineConfig({
  output: "server",
  session: false,
  adapter: cloudflare({ imageService: "passthrough" }),
  security: {
    checkOrigin: true,
    // Astro hashes its own scripts and styles; style attributes stay allowed for inline layout values.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ],
      styleDirective: {
        resources: [{ resource: "'unsafe-inline'", kind: "attribute" }],
      },
    },
  },
  devToolbar: { enabled: false },
  // No Markdown code blocks are rendered; Shiki's inline styles would clash with the CSP.
  markdown: { syntaxHighlight: false },
});
