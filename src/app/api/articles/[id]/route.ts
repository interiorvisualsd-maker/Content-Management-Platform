import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Article } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/articles/:id — fetch full article (used by the detail page client for refresh)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", id)
    .single<Article>();
  if (error || !data) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

// PATCH /api/articles/:id — update editable fields from the detail page
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Whitelist editable fields
  const allowed: Record<string, unknown> = {};
  for (const k of ["title", "slug", "excerpt", "content", "level", "category", "language"]) {
    if (k in body) allowed[k] = body[k];
  }
  // Also allow direct transcription/corrected_transcription edits (manual correction)
  if ("transcription" in body) allowed.transcription = body.transcription;
  if ("corrected_transcription" in body) allowed.corrected_transcription = body.corrected_transcription;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.from("articles").update(allowed).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
