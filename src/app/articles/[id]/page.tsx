import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import type { Article } from "@/lib/types";
import ArticleDetailClient from "./ArticleDetailClient";

export const dynamic = "force-dynamic";

export default async function ArticleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", params.id)
    .single<Article>();

  if (error || !data) {
    notFound();
  }

  return <ArticleDetailClient initialArticle={data} />;
}
