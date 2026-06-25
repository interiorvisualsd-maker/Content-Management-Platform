import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/StatusBadge";
import { ARTICLE_STATUS, type ArticleStatus } from "@/lib/status";
import type { Article } from "@/lib/types";
import { logoutAction } from "./actions";
import { FilterForm } from "./FilterForm";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const statusFilter = searchParams.status || "all";
  const searchQuery = (searchParams.q || "").trim();

  // Defensive: wrap everything so we surface a friendly error instead of crashing.
  let articles: Article[] = [];
  let loadError: string | null = null;

  let total = 0;
  let needsAudio = 0;
  let needsTranscription = 0;
  let needsApproval = 0;
  let published = 0;

  try {
    const supabase = createServerClient();

    let query = supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter as ArticleStatus);
    }

    if (searchQuery) {
      // Escape special characters in the search query for PostgREST ilike
      const safeQuery = searchQuery.replace(/[%_,]/g, " ");
      query = query.or(`title.ilike.%${safeQuery}%,slug.ilike.%${safeQuery}%`);
    }

    const { data, error } = await query;

    if (error) {
      // Distinguish "table doesn't exist" from other errors
      if (error.message.includes("Could not find the table") || error.message.includes("relation") || error.code === "42P01") {
        loadError = "The 'articles' table does not exist in your Supabase project. Please run supabase/schema.sql in the Supabase SQL Editor.";
      } else {
        loadError = `Supabase query error: ${error.message}`;
      }
    } else {
      articles = (data ?? []) as Article[];
    }

    // Counts for the summary tiles — only if no error so far
    if (!loadError) {
      const { data: allArticles, error: countErr } = await supabase
        .from("articles")
        .select("status");

      if (countErr) {
        // Don't crash — just show zeroed counts
        console.warn("Count query failed:", countErr.message);
      } else {
        const counts: Record<string, number> = {};
        for (const a of (allArticles ?? [])) {
          counts[a.status] = (counts[a.status] || 0) + 1;
        }
        total = (allArticles ?? []).length;
        needsAudio = counts[ARTICLE_STATUS.DRAFT] || 0;
        needsTranscription = counts[ARTICLE_STATUS.AUDIO_GENERATED] || 0;
        needsApproval =
          (counts[ARTICLE_STATUS.LLM_CORRECTED] || 0) +
          (counts[ARTICLE_STATUS.READY_FOR_REVIEW] || 0);
        published = counts[ARTICLE_STATUS.PUBLISHED] || 0;
      }
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unknown error loading dashboard";
  }

  return (
    <div className="min-h-screen">
      {/* Top nav */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white font-bold text-xs">
              CP
            </div>
            <div>
              <h1 className="font-semibold text-slate-900">Content Management</h1>
              <p className="text-xs text-slate-500">Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/articles/new" className="btn-primary">
              + New Article
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn-secondary">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {loadError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <strong className="font-semibold">Error:</strong> {loadError}
          </div>
        )}

        {/* Summary tiles */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryTile label="Total" value={total} accent="text-slate-900" />
          <SummaryTile label="Needs Audio" value={needsAudio} accent="text-blue-600" />
          <SummaryTile label="Needs Transcription" value={needsTranscription} accent="text-indigo-600" />
          <SummaryTile label="Needs Approval" value={needsApproval} accent="text-amber-600" />
          <SummaryTile label="Published" value={published} accent="text-emerald-600" />
        </section>

        {/* Filters + search */}
        <section className="bg-white border border-slate-200 rounded-xl">
          <FilterForm statusFilter={statusFilter} searchQuery={searchQuery} />

          {/* Article list */}
          {articles.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-slate-500 text-sm">
                {loadError ? "No articles to show until the error above is fixed." : "No articles match the current filters."}
              </p>
              {!loadError && (
                <Link href="/articles/new" className="btn-primary mt-4">Create your first article</Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {articles.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/articles/${a.id}`}
                    className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={a.status} />
                        {a.category && (
                          <span className="text-xs text-slate-500">#{a.category}</span>
                        )}
                        {a.published_at && (
                          <span className="text-xs text-emerald-600">published {new Date(a.published_at).toLocaleDateString()}</span>
                        )}
                      </div>
                      <h3 className="font-medium text-slate-900 truncate">{a.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        /{a.slug} · {a.language}
                        {a.audio_url ? " · audio ✓" : " · no audio"}
                        {a.transcription ? " · transcription ✓" : ""}
                        {a.corrected_transcription ? " · corrected ✓" : ""}
                      </p>
                      {a.error_message && (
                        <p className="text-xs text-red-600 mt-1">⚠ {a.error_message}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400">{new Date(a.created_at).toLocaleDateString()}</p>
                      <span className="text-xs text-slate-500 mt-1 inline-block">Open →</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}
