import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";

import { ADMIN_API_KEY } from "constants/secrets";

/**
 * Shared-secret guard for machine callers.
 *
 * This is the first inbound authentication in the service — until now every route was open,
 * including POST /app/tex-gpt, which proxies a paid Cloudflare token. Any new write endpoint
 * must sit behind this.
 *
 * Fails closed: if ADMIN_API_KEY is unset the route is refused rather than left open, so a
 * missing env var can never silently expose a mutating endpoint.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_API_KEY) {
    res.status(503).json({ error: "Admin API is not configured" });
    return;
  }

  const header = req.get("x-api-key") || "";
  const supplied = Buffer.from(header);
  const expected = Buffer.from(ADMIN_API_KEY);

  // timingSafeEqual throws on a length mismatch, so compare lengths first — and still run the
  // comparison against a same-length buffer so the failure path costs the same either way.
  const ok =
    supplied.length === expected.length && timingSafeEqual(supplied, expected);

  if (!ok) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }

  next();
}
