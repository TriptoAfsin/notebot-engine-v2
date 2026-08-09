export const MY_VERIFY_TOKEN = process.env.MY_VERIFY_TOKEN;
export const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
export const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
export const SECONDARY_RECEIVER_ID = process.env.SECONDARY_RECEIVER_ID;
export const DATABASE_PUBLIC_URL = process.env.DATABASE_PUBLIC_URL;
export const REDIS_URL = process.env.REDIS_URL;
export const ANALYTICS_ORIGIN = process.env.ANALYTICS_ORIGIN;
export const ANALYTICS_AUTH_KEY = process.env.ANALYTICS_AUTH_KEY;
export const COLLECT_ANALYTICS = process.env.COLLECT_ANALYTICS === "true";
export const APP_PRODUCTION = process.env.APP_PRODUCTION === "true";
export const NODE_ENV = process.env.NODE_ENV || "development";
export const AUTO_RAG_TOKEN = process.env.AUTO_RAG_TOKEN;
export const GRAPH_API_URL = process.env.GRAPH_API_URL || "https://graph.facebook.com/v21.0";
export const RESEND_API_KEY = process.env.RESEND_API_KEY;
export const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "notebot@t21.dev";
export const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || "NoteBot";
// Shared secret for machine callers (the CMS's cache-bust action, and later the ingest API).
// Unset means the admin routes refuse every request rather than running unauthenticated.
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
