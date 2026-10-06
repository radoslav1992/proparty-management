export type ApiResult = Record<string, any>;
/** JSON request to /api; a 401 sends the browser to the login page. */
export async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api/" + path, {
    method,
    headers:
      body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {},
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const result = (await res.json().catch(() => null)) as ApiResult | null;
  if (!res.ok || !result) {
    if (res.status === 401) location.href = "/login";
    throw new Error(result?.error || "The request could not be completed.");
  }
  return result;
}
