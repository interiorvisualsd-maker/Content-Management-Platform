import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { ARTICLE_STATUS } from "@/lib/status";
import type { Article, TranscriptionPayload } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/publish
 * Body: { article_id: string, action: "approve" | "publish" }
 *
 * Validates that all required pipeline steps are complete, then
 * updates the article status. "approve" sets status to approved,
 * "publish" sets status to published and stamps published_at.
 */
export async function POST(req: NextRequest) {
  let body: { article_id?: string; action?: "approve" | "publish" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const articleId = body.article_id;
  const action = body.action || "publish";
  if (!articleId) {
    return NextResponse.json({ error: "article_id is required" }, { status: 400 });
  }

  const serverClient = createServerClient();
  const adminClient = createAdminClient();

  const { data: article, error: fetchErr } = await serverClient
    .from("articles")
    .select("*")
    .eq("id", articleId)
    .single<Article>();

  if (fetchErr || !article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // Validate pipeline completion
  const missing: string[] = [];
  if (!article.content || article.content.trim().length === 0) missing.push("article content");
  if (!article.audio_url) missing.push("generated audio");
  if (!article.transcription) missing.push("generated transcription");
  if (!article.corrected_transcription) missing.push("corrected transcription");

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Cannot ${action}: missing ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {
    error_message: null,
    failed_step: null,
  };

  if (action === "approve") {
    updates.status = ARTICLE_STATUS.APPROVED;
  } else {
    updates.status = ARTICLE_STATUS.PUBLISHED;
    updates.published_at = new Date().toISOString();
  }

  const { error: updateErr } = await adminClient.from("articles").update(updates).eq("id", articleId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: updates.status as string,
  });
}
