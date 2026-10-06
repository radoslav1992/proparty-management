import { defineMiddleware } from "astro:middleware";
import { resumeSession } from "./lib/auth";
import { randomHex } from "./lib/crypto";
import { logError } from "./lib/log";
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, cookies } = context;
  context.locals.user = null;
  context.locals.requestId = request.headers.get("cf-ray") || randomHex(8);
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
      context.locals.user = await resumeSession(cookies, url);
    } catch (err) {
      logError(context, "Session lookup failed", err);
      return new Response(
        JSON.stringify({
          error: `Database unavailable. Apply D1 migrations before using the application. (reference ${context.locals.requestId})`,
          requestId: context.locals.requestId,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.pathname.startsWith("/app") && !context.locals.user)
      return context.redirect("/login");
  }
  const response = await next();
  if (url.pathname.startsWith("/api/"))
    response.headers.set("X-Request-Id", context.locals.requestId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  if (url.protocol === "https:")
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
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
