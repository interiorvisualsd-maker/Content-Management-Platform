"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "audio_generated", label: "Audio Generated" },
  { value: "transcription_generated", label: "Transcription Generated" },
  { value: "llm_corrected", label: "LLM Corrected" },
  { value: "ready_for_review", label: "Ready for Review" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed / Needs Fix" },
];

export function FilterForm({
  statusFilter,
  searchQuery,
}: {
  statusFilter: string;
  searchQuery: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onStatusChange(value: string) {
    const params = new URLSearchParams();
    if (value !== "all") params.set("status", value);
    if (searchQuery) params.set("q", searchQuery);
    const qs = params.toString();
    startTransition(() => {
      router.push(`/dashboard${qs ? `?${qs}` : ""}`);
    });
  }

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = (formData.get("q") as string || "").trim();
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (q) params.set("q", q);
    const qs = params.toString();
    startTransition(() => {
      router.push(`/dashboard${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600 mr-1">Status:</label>
        <select
          name="status"
          value={statusFilter}
          className="input max-w-[200px]"
          onChange={(e) => onStatusChange(e.target.value)}
          disabled={isPending}
        >
          {FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={searchQuery}
          placeholder="Search title or slug..."
          className="input max-w-xs"
        />
        <button type="submit" className="btn-secondary" disabled={isPending}>
          {isPending ? "..." : "Search"}
        </button>
      </form>
    </div>
  );
}
