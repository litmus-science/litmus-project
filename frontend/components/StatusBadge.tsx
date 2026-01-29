"use client";

import type { ExperimentStatus } from "@/lib/types";

// Using Litmus pH-inspired colors for status progression
const statusColors: Record<ExperimentStatus, string> = {
  draft: "bg-surface-100 text-surface-400",
  pending_review: "bg-amber-50 text-amber-700 border border-amber-200",
  open: "bg-primary-50 text-primary-600 border border-primary-200",
  claimed: "bg-violet-50 text-violet-700 border border-violet-200",
  in_progress: "bg-primary-100 text-primary-700 border border-primary-300",
  completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  disputed: "bg-accent-50 text-accent-600 border border-accent-200",
  cancelled: "bg-surface-100 text-surface-300",
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
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
