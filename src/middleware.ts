import { defineMiddleware } from "astro:middleware";
import { sessionUser } from "./lib/auth";
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, cookies } = context;
  context.locals.user = null;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    url.pathname !== "/api/billing/webhook"
  ) {
    if (request.headers.get("origin") !== url.origin)
      return new Response(
        JSON.stringify({ error: "Invalid request origin." }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
  }
  if (url.pathname.startsWith("/app") || url.pathname.startsWith("/api/")) {
    try {
      context.locals.user = await sessionUser(
        cookies.get("proparty_session")?.value,
      );
    } catch {
      return new Response(
        JSON.stringify({
          error:
            "Database unavailable. Apply D1 migrations before using the application.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.pathname.startsWith("/app") && !context.locals.user)
      return context.redirect("/login");
  }
  const response = await next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (
    (url.pathname.startsWith("/api") || url.pathname.startsWith("/app")) &&
    !response.headers.has("Cache-Control")
  )
    response.headers.set("Cache-Control", "no-store");
  return response;
});
