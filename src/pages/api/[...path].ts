import type { APIRoute } from "astro";
import { handleApi } from "../../server";

// Every /api/* request; routes live in src/server/routes.
export const ALL: APIRoute = (ctx) => handleApi(ctx);
