// One JSON line per failure, so Workers Logs can filter by request, route and user.
export interface LogContext {
  request: Request;
  url: URL;
  locals: { requestId?: string; user?: { id: string } | null };
}
export function logError(ctx: LogContext, message: string, err: unknown) {
  console.error(
    JSON.stringify({
      message,
      requestId: ctx.locals.requestId,
      method: ctx.request.method,
      path: ctx.url.pathname,
      userId: ctx.locals.user?.id,
      error: err instanceof Error ? err.message : "unknown",
    }),
  );
}
