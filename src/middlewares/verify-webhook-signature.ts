import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

import { APP_PRODUCTION, FACEBOOK_APP_SECRET } from "constants/secrets";

/**
 * Verifies Meta's `X-Hub-Signature-256` on webhook deliveries.
 *
 * Without this, `POST /webhook` is an open endpoint: anyone who knows the URL can post a
 * hand-written `entry.messaging` payload and make the bot send messages to any PSID they name.
 * v1 has never checked it either, so this is a gap being closed rather than a regression.
 *
 * Meta signs the **raw** request body, so `express.json()`'s parsed object cannot be re-serialised
 * to reproduce the digest — key order and whitespace would differ. `server.ts` therefore stashes
 * the raw buffer via body-parser's `verify` hook.
 */

/** Set by the body-parser `verify` hook in server.ts. */
export type WithRawBody = Request & { rawBody?: Buffer };

export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction) {
  // No secret configured: refuse in production rather than accept unauthenticated events, but stay
  // out of the way locally, where there is no signature to check against.
  if (!FACEBOOK_APP_SECRET) {
    if (APP_PRODUCTION) {
      console.error("FACEBOOK_APP_SECRET is unset — rejecting webhook delivery");
      return res.sendStatus(403);
    }
    console.warn("FACEBOOK_APP_SECRET is unset — webhook signature NOT verified (dev only)");
    return next();
  }

  const header = req.get("x-hub-signature-256");
  if (!header?.startsWith("sha256=")) return res.sendStatus(403);

  const raw = (req as WithRawBody).rawBody;
  if (!raw) {
    // Means the verify hook is not wired; failing closed is the only safe answer, because every
    // signature would otherwise be computed over an empty body and never match anyway.
    console.error("raw body unavailable — cannot verify webhook signature");
    return res.sendStatus(403);
  }

  const expected = crypto.createHmac("sha256", FACEBOOK_APP_SECRET).update(raw).digest("hex");
  const received = header.slice("sha256=".length);

  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(403);

  return next();
}
