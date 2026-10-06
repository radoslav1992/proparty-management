import type { RequestContext, UserContext } from "./http";

type Params = Record<string, string>;
export type Route =
  | {
      method: string;
      pattern: string;
      public: true;
      handler: (c: RequestContext, params: Params) => Promise<Response>;
    }
  | {
      method: string;
      pattern: string;
      public?: false;
      handler: (c: UserContext, params: Params) => Promise<Response>;
    };

export const get = (
  pattern: string,
  handler: (c: UserContext, params: Params) => Promise<Response>,
): Route => ({ method: "GET", pattern, handler });
export const post = (
  pattern: string,
  handler: (c: UserContext, params: Params) => Promise<Response>,
): Route => ({ method: "POST", pattern, handler });
export const patch = (
  pattern: string,
  handler: (c: UserContext, params: Params) => Promise<Response>,
): Route => ({ method: "PATCH", pattern, handler });
export const del = (
  pattern: string,
  handler: (c: UserContext, params: Params) => Promise<Response>,
): Route => ({ method: "DELETE", pattern, handler });
/** A route that works without a session (sign-in, webhooks). */
export const publicPost = (
  pattern: string,
  handler: (c: RequestContext, params: Params) => Promise<Response>,
): Route => ({ method: "POST", pattern, public: true, handler });

/** Matches "properties/:id" style patterns against a path such as "properties/abc". */
function matchPattern(pattern: string, path: string): Params | null {
  const want = pattern.split("/"),
    got = path.split("/");
  if (want.length !== got.length) return null;
  const params: Params = {};
  for (const [i, part] of want.entries()) {
    if (part.startsWith(":")) {
      if (!got[i]) return null;
      params[part.slice(1)] = decodeURIComponent(got[i]);
    } else if (part !== got[i]) return null;
  }
  return params;
}

/** The first route whose pattern and method match; "method" when only the method is wrong. */
export function findRoute(routes: Route[], method: string, path: string) {
  let pathKnown = false;
  for (const route of routes) {
    const params = matchPattern(route.pattern, path);
    if (!params) continue;
    pathKnown = true;
    if (route.method === method) return { route, params };
  }
  return pathKnown ? ("method" as const) : null;
}
