// Status constants — must match supabase/schema.sql check constraint
export const ARTICLE_STATUS = {
  DRAFT: "draft",
  AUDIO_GENERATED: "audio_generated",
  TRANSCRIPTION_GENERATED: "transcription_generated",
  LLM_CORRECTED: "llm_corrected",
  READY_FOR_REVIEW: "ready_for_review",
  APPROVED: "approved",
  PUBLISHED: "published",
  FAILED: "failed",
} as const;

export type ArticleStatus = (typeof ARTICLE_STATUS)[keyof typeof ARTICLE_STATUS];

export const STATUS_LABELS: Record<ArticleStatus, string> = {
  draft: "Draft",
  audio_generated: "Audio Generated",
  transcription_generated: "Transcription Generated",
  llm_corrected: "LLM Corrected",
  ready_for_review: "Ready for Review",
  approved: "Approved",
  published: "Published",
  failed: "Failed / Needs Fix",
};

export const STATUS_COLORS: Record<ArticleStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  audio_generated: "bg-blue-50 text-blue-700 border-blue-200",
  transcription_generated: "bg-indigo-50 text-indigo-700 border-indigo-200",
  llm_corrected: "bg-violet-50 text-violet-700 border-violet-200",
  ready_for_review: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-teal-50 text-teal-700 border-teal-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

// Pipeline step ordering — used for the stepper UI
export const PIPELINE_STEPS = [
  { key: "draft", label: "Draft", status: ARTICLE_STATUS.DRAFT },
  { key: "audio", label: "Audio", status: ARTICLE_STATUS.AUDIO_GENERATED },
  { key: "transcription", label: "Transcription", status: ARTICLE_STATUS.TRANSCRIPTION_GENERATED },
  { key: "llm_corrected", label: "LLM Corrected", status: ARTICLE_STATUS.LLM_CORRECTED },
  { key: "approved", label: "Approved", status: ARTICLE_STATUS.APPROVED },
  { key: "published", label: "Published", status: ARTICLE_STATUS.PUBLISHED },
] as const;

export function getStepIndex(status: ArticleStatus): number {
  if (status === "failed") {
    // Show as "stuck" at the last successful step — caller should use
    // failed_step to figure out which step failed.
    return -1;
  }
  const order: ArticleStatus[] = [
    "draft",
    "audio_generated",
    "transcription_generated",
    "llm_corrected",
    "ready_for_review",
    "approved",
    "published",
  ];
  return order.indexOf(status);
}
