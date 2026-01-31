"use client";

import type { ExperimentStatus } from "@/lib/types";

const statusColors: Record<ExperimentStatus, string> = {
  draft: "bg-surface-100 text-surface-500 border border-surface-200",
  pending_review: "bg-accent-50 text-accent-700 border border-accent-200",
  open: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  claimed: "bg-violet-50 text-violet-700 border border-violet-200",
  in_progress: "bg-blue-50 text-blue-700 border border-blue-200",
  completed: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  disputed: "bg-red-50 text-red-700 border border-red-200",
  cancelled: "bg-surface-100 text-surface-400 border border-surface-200",
};

const statusLabels: Record<ExperimentStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  open: "Open",
  claimed: "Claimed",
  in_progress: "In Progress",
  completed: "Completed",
  disputed: "Disputed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: ExperimentStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-mono uppercase tracking-wider ${statusColors[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
