"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_LABELS, ARTICLE_STATUS, PIPELINE_STEPS, type ArticleStatus } from "@/lib/status";
import type { Article, TranscriptionPayload } from "@/lib/types";

interface Props {
  initialArticle: Article;
}

type StepKey = "tts" | "transcribe" | "correct" | "approve" | "publish";

export default function ArticleDetailClient({ initialArticle }: Props) {
  const router = useRouter();
  const [article, setArticle] = useState<Article>(initialArticle);

  // Local editable copies
  const [titleDraft, setTitleDraft] = useState(initialArticle.title);
  const [contentDraft, setContentDraft] = useState(initialArticle.content);
  const [transcriptionDraft, setTranscriptionDraft] = useState(
    initialArticle.transcription ? JSON.stringify(initialArticle.transcription, null, 2) : ""
  );
  const [correctedDraft, setCorrectedDraft] = useState(
    initialArticle.corrected_transcription ? JSON.stringify(initialArticle.corrected_transcription, null, 2) : ""
  );

  // Sync local drafts when article changes (e.g. after a pipeline step)
  useEffect(() => {
    setTitleDraft(initialArticle.title);
    setContentDraft(initialArticle.content);
  }, [initialArticle.title, initialArticle.content]);

  useEffect(() => {
    if (article.transcription) {
      setTranscriptionDraft(JSON.stringify(article.transcription, null, 2));
    }
  }, [article.transcription]);

  useEffect(() => {
    if (article.corrected_transcription) {
      setCorrectedDraft(JSON.stringify(article.corrected_transcription, null, 2));
    }
  }, [article.corrected_transcription]);

  // Busy state per step
  const [busy, setBusy] = useState<Record<StepKey, boolean>>({
    tts: false,
    transcribe: false,
    correct: false,
    approve: false,
    publish: false,
  });

  // Currently active error message (from server response)
  const [stepError, setStepError] = useState<string | null>(article.error_message);

  // Saved-flash UI state
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  function flash(msg: string) {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(null), 2500);
  }

  // Refresh article from server after each pipeline step
  const refreshArticle = useCallback(async () => {
    const res = await fetch(`/api/articles/${article.id}`, { method: "GET" });
    if (res.ok) {
      const updated = (await res.json()) as Article;
      setArticle(updated);
      setStepError(updated.error_message);
    }
    router.refresh();
  }, [article.id, router]);

  async function runStep(step: StepKey) {
    setBusy((b) => ({ ...b, [step]: true }));
    setStepError(null);
    try {
      const endpoint =
        step === "tts" ? "/api/tts" :
        step === "transcribe" ? "/api/transcribe" :
        step === "correct" ? "/api/correct" :
        "/api/publish";

      const payload =
        step === "approve" || step === "publish"
          ? { article_id: article.id, action: step }
          : { article_id: article.id };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setStepError(data.error || `${step} failed`);
        return;
      }
      await refreshArticle();
      flash(`${step} completed`);
    } catch (err) {
      setStepError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy((b) => ({ ...b, [step]: false }));
    }
  }

  async function saveField(field: "title" | "content" | "transcription" | "corrected_transcription", value: string) {
    let parsed: unknown = value;
    if (field === "transcription" || field === "corrected_transcription") {
      try {
        parsed = JSON.parse(value);
      } catch {
        alert("Invalid JSON — please fix before saving.");
        return;
      }
    }
    setBusy((b) => ({ ...b, tts: true })); // reuse tts slot for "saving" indicator
    try {
      const res = await fetch(`/api/articles/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Save failed");
        return;
      }
      await refreshArticle();
      flash(`${field.replace("_", " ")} saved`);
    } finally {
      setBusy((b) => ({ ...b, tts: false }));
    }
  }

  // Pipeline gating
  const canGenerateAudio = article.content?.trim().length > 0 && !busy.tts;
  const canTranscribe = !!article.audio_url && !busy.transcribe;
  const canCorrect = !!article.transcription && !busy.correct;
  const canApprove = !!article.audio_url && !!article.transcription && !!article.corrected_transcription && !busy.approve;
  const canPublish = article.status === ARTICLE_STATUS.APPROVED || article.status === ARTICLE_STATUS.LLM_CORRECTED;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">← Dashboard</Link>
          <div className="flex items-center gap-2">
            <StatusBadge status={article.status} />
            {savedFlash && <span className="text-xs text-emerald-600">{savedFlash}</span>}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {stepError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start justify-between gap-3">
            <div>
              <strong className="font-semibold">Error:</strong> {stepError}
            </div>
            <button
              className="text-xs underline text-red-700 hover:text-red-900"
              onClick={async () => {
                setStepError(null);
                // Retry the failed step
                const step = article.failed_step as StepKey | null;
                if (step) {
                  await runStep(step);
                }
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Pipeline Stepper */}
        <PipelineStepper status={article.status} />

        {/* Title + meta */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <label className="label">Title</label>
              <input
                className="input text-base font-medium"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
              />
            </div>
            <button
              className="btn-secondary mt-6"
              onClick={() => saveField("title", titleDraft)}
              disabled={titleDraft === article.title || busy.tts}
            >
              Save title
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Meta label="Slug" value={article.slug} />
            <Meta label="Language" value={article.language} />
            <Meta label="Level" value={article.level || "—"} />
            <Meta label="Category" value={article.category || "—"} />
          </div>
        </section>

        {/* Article content */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Article content</h2>
            <button
              className="btn-secondary"
              onClick={() => saveField("content", contentDraft)}
              disabled={contentDraft === article.content || busy.tts}
            >
              Save content
            </button>
          </div>
          <textarea
            className="input min-h-[200px] font-mono text-sm"
            value={contentDraft}
            onChange={(e) => setContentDraft(e.target.value)}
          />
          <p className="text-xs text-slate-400">{contentDraft.trim().split(/\s+/).filter(Boolean).length} words</p>
        </section>

        {/* Step 1: Audio */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Step 1 · Audio generation</h2>
              <p className="text-xs text-slate-500 mt-0.5">Microsoft Edge TTS — free, no API key needed.</p>
            </div>
            <button
              className="btn-primary"
              onClick={() => runStep("tts")}
              disabled={!canGenerateAudio}
            >
              {busy.tts ? "Generating..." : article.audio_url ? "Regenerate audio" : "Generate audio"}
            </button>
          </div>
          {article.audio_url ? (
            <div className="space-y-2">
              <AudioPlayer src={article.audio_url} />
              <p className="text-xs text-slate-400 break-all">URL: {article.audio_url}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No audio generated yet.</p>
          )}
        </section>

        {/* Step 2: Transcription */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Step 2 · Transcription</h2>
              <p className="text-xs text-slate-500 mt-0.5">Groq Whisper large-v3 — returns segments with timestamps.</p>
            </div>
            <button
              className="btn-primary"
              onClick={() => runStep("transcribe")}
              disabled={!canTranscribe}
            >
              {busy.transcribe ? "Transcribing..." : article.transcription ? "Regenerate transcription" : "Generate transcription"}
            </button>
          </div>
          {article.transcription ? (
            <TranscriptionView payload={article.transcription} draft={transcriptionDraft} onDraftChange={setTranscriptionDraft} onSave={() => saveField("transcription", transcriptionDraft)} busy={busy.tts} />
          ) : (
            <p className="text-sm text-slate-400">No transcription yet.</p>
          )}
        </section>

        {/* Step 3: LLM Correction */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Step 3 · LLM correction</h2>
              <p className="text-xs text-slate-500 mt-0.5">Groq Llama 3.3 70B — corrects transcription against original article, preserving timestamps.</p>
            </div>
            <button
              className="btn-primary"
              onClick={() => runStep("correct")}
              disabled={!canCorrect}
            >
              {busy.correct ? "Correcting..." : article.corrected_transcription ? "Re-run LLM correction" : "Correct transcription with AI"}
            </button>
          </div>
          {article.corrected_transcription ? (
            <TranscriptionView payload={article.corrected_transcription} draft={correctedDraft} onDraftChange={setCorrectedDraft} onSave={() => saveField("corrected_transcription", correctedDraft)} busy={busy.tts} label="Corrected" />
          ) : (
            <p className="text-sm text-slate-400">No corrected transcription yet.</p>
          )}
        </section>

        {/* Step 4 & 5: Approve + Publish */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="font-semibold text-slate-900">Step 4 · Approve & Publish</h2>
          {article.status === ARTICLE_STATUS.PUBLISHED ? (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
              ✓ This article is published. Published at {article.published_at ? new Date(article.published_at).toLocaleString() : "—"}.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                className="btn-secondary"
                onClick={() => runStep("approve")}
                disabled={!canApprove}
                title={!canApprove ? "Complete all pipeline steps first" : ""}
              >
                {busy.approve ? "Approving..." : "Approve"}
              </button>
              <button
                className="btn-success"
                onClick={() => runStep("publish")}
                disabled={!canPublish || busy.publish}
                title={!canPublish ? "Approve the article first" : ""}
              >
                {busy.publish ? "Publishing..." : "Approve & Publish"}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium text-slate-800 truncate">{value}</p>
    </div>
  );
}

function TranscriptionView({
  payload,
  draft,
  onDraftChange,
  onSave,
  busy,
  label = "Raw",
}: {
  payload: TranscriptionPayload;
  draft: string;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  busy: boolean;
  label?: string;
}) {
  const [mode, setMode] = useState<"segments" | "json">("segments");
  const segments = payload.segments || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-500">
          <span>{label}</span>
          <span>·</span>
          <span>{segments.length} segments</span>
          {payload.duration && <><span>·</span><span>{Math.round(payload.duration)}s</span></>}
          {payload.language && <><span>·</span><span>{payload.language}</span></>}
        </div>
        <div className="flex items-center gap-2">
          <button className="text-slate-500 hover:text-slate-900" onClick={() => setMode("segments")}>Segments</button>
          <span className="text-slate-300">|</span>
          <button className="text-slate-500 hover:text-slate-900" onClick={() => setMode("json")}>JSON</button>
        </div>
      </div>

      {mode === "segments" && segments.length > 0 ? (
        <ul className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {segments.map((s) => (
            <li key={s.id} className="px-3 py-2 flex gap-3 text-sm">
              <span className="text-xs text-slate-400 font-mono shrink-0 w-24">
                {fmt(s.start)} → {fmt(s.end)}
              </span>
              <span className="text-slate-700">{s.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <textarea
            className="input min-h-[180px] font-mono text-xs"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
          />
          <div className="flex justify-end">
            <button className="btn-secondary" onClick={onSave} disabled={busy}>Save changes</button>
          </div>
        </>
      )}
    </div>
  );
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PipelineStepper({ status }: { status: ArticleStatus }) {
  // Map article status to step index
  const stepIndex: Record<ArticleStatus, number> = {
    draft: 0,
    audio_generated: 1,
    transcription_generated: 2,
    llm_corrected: 3,
    ready_for_review: 3,
    approved: 4,
    published: 5,
    failed: -1,
  };
  const current = stepIndex[status];

  return (
    <ol className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3">
      {PIPELINE_STEPS.map((step, i) => {
        const done = current >= 0 && i <= current;
        const active = current === i;
        const failed = status === "failed" && i === current;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium ${
                failed ? "bg-red-100 text-red-700" :
                done ? "bg-emerald-100 text-emerald-700" :
                active ? "bg-slate-900 text-white" :
                "bg-slate-100 text-slate-400"
              }`}
            >
              {failed ? "!" : done ? "✓" : i + 1}
            </span>
            <span className={`text-xs ${active ? "font-medium text-slate-900" : done ? "text-slate-700" : "text-slate-400"}`}>
              {step.label}
            </span>
            {i < PIPELINE_STEPS.length - 1 && <span className="text-slate-300 mx-1">→</span>}
          </li>
        );
      })}
      {status === "failed" && (
        <span className="ml-2 text-xs text-red-600">· {STATUS_LABELS.failed}</span>
      )}
    </ol>
  );
}
