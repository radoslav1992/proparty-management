import type { APIContext } from "astro";
import { HttpError } from "../lib/domain";
import { bindings } from "../lib/env";
import { errorResponse, userContext, type RequestContext } from "./http";
import { findRoute, type Route } from "./router";
import { authRoutes } from "./routes/auth";
import { accountRoutes } from "./routes/account";
import { billingRoutes } from "./routes/billing";
import { rentRoutes } from "./routes/rent";
import { recordRoutes } from "./routes/records";
import { fileRoutes } from "./routes/files";
import { aiRoutes } from "./routes/ai";
import { dataRoutes } from "./routes/data";

const routes: Route[] = [
  ...authRoutes,
  ...billingRoutes,
  ...accountRoutes,
  ...dataRoutes,
  ...rentRoutes,
  ...aiRoutes,
  ...fileRoutes,
  ...recordRoutes,
];

/** Entry point for /api/*: finds the route, checks the session for private routes and maps errors to JSON. */
export async function handleApi(ctx: APIContext) {
  try {
    const path = ctx.params.path || "";
    const found = findRoute(routes, ctx.request.method, path);
    const base: RequestContext = {
      ctx,
      request: ctx.request,
      url: ctx.url,
      db: bindings().DB,
      env: bindings(),
    };
    if (found && found !== "method" && found.route.public)
      return await found.route.handler(base, found.params);
    const user = ctx.locals.user;
    if (!user) throw new HttpError(401, "Please sign in to continue.");
    if (!found) throw new HttpError(404, "Not found.");
    if (found === "method") throw new HttpError(405, "Method not allowed.");
    if (found.route.public) throw new HttpError(500, "Unreachable.");
    return await found.route.handler(userContext(base, user), found.params);
  } catch (err) {
    return errorResponse(err);
  }
}
