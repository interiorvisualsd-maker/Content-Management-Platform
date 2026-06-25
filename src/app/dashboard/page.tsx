import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/StatusBadge";
import { ARTICLE_STATUS, STATUS_LABELS, type ArticleStatus } from "@/lib/status";
import type { Article } from "@/lib/types";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: ARTICLE_STATUS.DRAFT, label: STATUS_LABELS.draft },
  { value: ARTICLE_STATUS.AUDIO_GENERATED, label: STATUS_LABELS.audio_generated },
  { value: ARTICLE_STATUS.TRANSCRIPTION_GENERATED, label: STATUS_LABELS.transcription_generated },
  { value: ARTICLE_STATUS.LLM_CORRECTED, label: STATUS_LABELS.llm_corrected },
  { value: ARTICLE_STATUS.READY_FOR_REVIEW, label: STATUS_LABELS.ready_for_review },
  { value: ARTICLE_STATUS.APPROVED, label: STATUS_LABELS.approved },
  { value: ARTICLE_STATUS.PUBLISHED, label: STATUS_LABELS.published },
  { value: ARTICLE_STATUS.FAILED, label: STATUS_LABELS.failed },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const supabase = createServerClient();

  const statusFilter = searchParams.status || "all";
  const searchQuery = (searchParams.q || "").trim();

  let query = supabase
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter as ArticleStatus);
  }

  if (searchQuery) {
    // Case-insensitive search on title or slug
    query = query.or(`title.ilike.%${searchQuery}%,slug.ilike.%${searchQuery}%`);
  }

  const { data, error } = await query;
  const articles = (data ?? []) as Article[];

  // Counts for the summary tiles
  const { data: allArticles } = await supabase.from("articles").select("status");
  const counts: Record<string, number> = {};
  for (const a of (allArticles ?? [])) {
    counts[a.status] = (counts[a.status] || 0) + 1;
  }
  const total = (allArticles ?? []).length;
  const needsAudio = (counts[ARTICLE_STATUS.DRAFT] || 0);
  const needsTranscription = (counts[ARTICLE_STATUS.AUDIO_GENERATED] || 0);
  const needsCorrection = (counts[ARTICLE_STATUS.TRANSCRIPTION_GENERATED] || 0);
  const needsApproval =
    (counts[ARTICLE_STATUS.LLM_CORRECTED] || 0) +
    (counts[ARTICLE_STATUS.READY_FOR_REVIEW] || 0);
  const published = (counts[ARTICLE_STATUS.PUBLISHED] || 0);

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
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <form method="get" className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-600 mr-1">Status:</label>
              <select
                name="status"
                defaultValue={statusFilter}
                className="input max-w-[200px]"
                onChange={(e) => (e.currentTarget.form as HTMLFormElement)?.submit()}
              >
                {FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <noscript>
                <button type="submit" className="btn-secondary">Filter</button>
              </noscript>
            </form>
            <form method="get" className="flex items-center gap-2">
              {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
              <input
                type="search"
                name="q"
                defaultValue={searchQuery}
                placeholder="Search title or slug..."
                className="input max-w-xs"
              />
              <button type="submit" className="btn-secondary">Search</button>
            </form>
          </div>

          {/* Article list */}
          {error ? (
            <div className="px-5 py-8 text-center text-red-600 text-sm">
              Failed to load articles: {error.message}
            </div>
          ) : articles.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-slate-500 text-sm">No articles match the current filters.</p>
              <Link href="/articles/new" className="btn-primary mt-4">Create your first article</Link>
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
