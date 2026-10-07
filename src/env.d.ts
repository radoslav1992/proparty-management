/// <reference types="astro/client" />
type CloudflareRuntime = import("@astrojs/cloudflare").Runtime;
declare namespace App {
  interface Locals extends CloudflareRuntime {
    user: import("./lib/types").SessionUser | null;
    /** Cloudflare's Ray ID for the request, or a random id when running locally. */
    requestId: string;
  }
}
