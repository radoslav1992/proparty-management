import { handle } from "@astrojs/cloudflare/handler";
import { dailyMaintenance } from "./lib/jobs";

export default {
  fetch: handle,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(
      dailyMaintenance(env.DB).catch((err) => {
        console.error(
          JSON.stringify({
            message: "Daily job failed",
            cron: controller.cron,
            error: err instanceof Error ? err.message : "unknown",
          }),
        );
        // Rethrown so the run shows as failed under the Worker's Trigger Events.
        throw err;
      }),
    );
  },
} satisfies ExportedHandler<{ DB: D1Database }>;
