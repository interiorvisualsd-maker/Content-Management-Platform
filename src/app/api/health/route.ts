import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Returns the status of every required env var. Use this to debug
 * "application error" crashes on Vercel — if any var shows "missing",
 * that's your culprit.
 *
 * No auth required so you can hit it directly in the browser.
 */
export async function GET() {
  const checks: Record<string, { set: boolean; preview?: string }> = {
    NEXT_PUBLIC_SUPABASE_URL: checkUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: checkKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: checkKey(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_STORAGE_BUCKET: checkString(process.env.SUPABASE_STORAGE_BUCKET),
    GROQ_API_KEY: checkString(process.env.GROQ_API_KEY, "gsk_"),
    ADMIN_EMAIL: checkString(process.env.ADMIN_EMAIL),
    ADMIN_PASSWORD: checkString(process.env.ADMIN_PASSWORD),
    NEXT_PUBLIC_APP_URL: checkUrl(process.env.NEXT_PUBLIC_APP_URL),
  };

  const allSet = Object.values(checks).every((c) => c.set);

  return NextResponse.json(
    {
      ok: allSet,
      env: checks,
      node_env: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
    { status: allSet ? 200 : 500 }
  );
}

function checkString(value: string | undefined, expectedPrefix?: string): { set: boolean; preview?: string } {
  if (!value || value.length === 0) return { set: false };
  if (expectedPrefix && !value.startsWith(expectedPrefix)) {
    return { set: true, preview: `⚠️ does not start with "${expectedPrefix}"` };
  }
  return { set: true, preview: `${value.substring(0, 4)}...${value.substring(value.length - 4)}` };
}

function checkKey(value: string | undefined): { set: boolean; preview?: string } {
  if (!value || value.length === 0) return { set: false };
  // Supabase keys are JWTs — they start with "eyJ"
  if (!value.startsWith("eyJ")) {
    return { set: true, preview: "⚠️ does not start with eyJ (not a valid Supabase key?)" };
  }
  return { set: true, preview: `${value.substring(0, 8)}...${value.substring(value.length - 4)}` };
}

function checkUrl(value: string | undefined): { set: boolean; preview?: string } {
  if (!value || value.length === 0) return { set: false };
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return { set: true, preview: "⚠️ does not start with http(s)://" };
  }
  return { set: true, preview: value };
}
