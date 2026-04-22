"use client";

import type { ExperimentStatus } from "@/lib/types";

const statusStyles: Record<ExperimentStatus, string> = {
  draft:          "bg-surface-100 text-surface-500 border border-surface-200",
  pending_review: "bg-amber-50 text-amber-700 border border-amber-200",
  open:           "bg-teal-50 text-teal-700 border border-teal-200",
  design_finalized: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  claimed:        "bg-violet-50 text-violet-700 border border-violet-200",
  in_progress:    "bg-blue-50 text-blue-700 border border-blue-200",
  completed:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  disputed:       "bg-red-50 text-red-700 border border-red-200",
  cancelled:      "bg-surface-100 text-surface-400 border border-surface-200",
};

const statusLabels: Record<ExperimentStatus, string> = {
  draft:          "Draft",
  pending_review: "Pending Review",
  open:           "Open",
  design_finalized: "In Review",
  claimed:        "Claimed",
  in_progress:    "In Progress",
  completed:      "Completed",
  disputed:       "Disputed",
  cancelled:      "Cancelled",
};

export function StatusBadge({ status }: { status: ExperimentStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
