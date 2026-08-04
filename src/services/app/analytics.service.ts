/**
 * Fire-and-forget writes to the analytics.* tables (migrated from the legacy MySQL analytics DB
 * into this same Postgres). Mirrors what the notebot-analytics-go API records for the v1 bot, so
 * v2 usage also feeds the popularity/usage analytics. These NEVER throw — analytics must not break
 * a request, so every call is best-effort and errors are only logged.
 */
import { getPool } from "db/index";

export const analyticsService = {
  /** A note subject was opened. subnamedb.sub_name is the subject slug (phy1, math1, cp, ...). */
  incrementNoteSubject(slug: string): void {
    getPool()
      .query("UPDATE analytics.subnamedb SET count = count + 1 WHERE sub_name = $1", [slug])
      .catch((e) => console.error("🔴 analytics subnamedb:", e.message));
  },

  /** A lab subject was opened. labsdb.lab_name is the subject slug. */
  incrementLabSubject(slug: string): void {
    getPool()
      .query("UPDATE analytics.labsdb SET count = count + 1 WHERE lab_name = $1", [slug])
      .catch((e) => console.error("🔴 analytics labsdb:", e.message));
  },

  /** Daily app-platform call counter: increment today's row, or insert it if missing. */
  bumpDailyApp(): void {
    getPool()
      .query(
        `WITH upd AS (
           UPDATE analytics.bot_daily_report SET count = count + 1
           WHERE date = CURRENT_DATE AND platform = 'app' RETURNING id
         )
         INSERT INTO analytics.bot_daily_report (date, count, platform)
         SELECT CURRENT_DATE, 1, 'app' WHERE NOT EXISTS (SELECT 1 FROM upd)`
      )
      .catch((e) => console.error("🔴 analytics bot_daily_report:", e.message));
  },
};
