import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ARTICLE_STATUS } from "@/lib/status";
import type { ArticleInput } from "@/lib/types";

export const runtime = "nodejs";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  let body: Partial<ArticleInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const content = (body.content ?? "").trim();
  if (!title || !content) {
    return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
  }

  const slug = slugify(body.slug || title);

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("articles")
    .insert({
      title,
      slug,
      excerpt: body.excerpt?.trim() || null,
      content,
      level: body.level?.trim() || null,
      category: body.category?.trim() || null,
      language: body.language?.trim() || "en",
      status: ARTICLE_STATUS.DRAFT,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An article with that slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
