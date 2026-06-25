import { STATUS_LABELS, STATUS_COLORS, type ArticleStatus } from "@/lib/status";

export function StatusBadge({ status }: { status: ArticleStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
