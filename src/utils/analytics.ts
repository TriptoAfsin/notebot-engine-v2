import { ANALYTICS_ORIGIN, ANALYTICS_AUTH_KEY, COLLECT_ANALYTICS } from "constants/secrets";

export async function handleAnalytics(subName: string) {
  if (!COLLECT_ANALYTICS || !ANALYTICS_ORIGIN) return;
  try {
    await fetch(
      `${ANALYTICS_ORIGIN}/notes/${subName}?adminKey=${ANALYTICS_AUTH_KEY}`,
    );
    console.log(`🟢 Analytics handled: notes/${subName}`);
  } catch {
    console.log(`🔴 Analytics error: notes/${subName}`);
  }
}

export async function handleAnalyticsLabs(subName: string) {
  if (!COLLECT_ANALYTICS || !ANALYTICS_ORIGIN) return;
  try {
    await fetch(
      `${ANALYTICS_ORIGIN}/labs/${subName}?adminKey=${ANALYTICS_AUTH_KEY}`,
    );
    console.log(`🟢 Analytics handled: labs/${subName}`);
  } catch {
    console.log(`🔴 Analytics error: labs/${subName}`);
  }
}

export async function handleApiCallAnalytics(platform = "app") {
  if (!COLLECT_ANALYTICS || !ANALYTICS_ORIGIN) return;
  try {
    await fetch(
      `${ANALYTICS_ORIGIN}/daily_report?adminKey=${ANALYTICS_AUTH_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      },
    );
    console.log(`🚀 API call count ✅`);
  } catch {
    console.log(`🔴 API call count error`);
  }
}
