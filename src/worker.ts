import { handle } from "@astrojs/cloudflare/handler";
import { dailyMaintenance } from "./lib/jobs";

export default {
  fetch: handle,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(dailyMaintenance(env.DB));
  },
} satisfies ExportedHandler<{ DB: D1Database }>;
