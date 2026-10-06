// Runtime-neutral: used by the middleware and by the sign-in pages in the browser.
/** Where to go after signing in: a workspace path from `next`, never another site. */
export const afterSignIn = (next: string | null | undefined) =>
  next && /^\/app(?:[/?#]|$)/.test(next) ? next : "/app";
/** The sign-in page that returns to this workspace path afterwards. */
export const signInFor = (path: string) =>
  path === "/app" ? "/login" : "/login?next=" + encodeURIComponent(path);
