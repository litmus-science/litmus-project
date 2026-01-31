"use client";

import Link from "next/link";
import type { Job } from "@/lib/types";
import { formatUsd } from "@/lib/format";

export function JobCard({ job }: { job: Job }) {
  return (
    <Link href={`/operator/jobs/${job.experiment_id}`}>
      <div className="card p-6 hover:shadow-lg transition-all group">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-display text-xl text-surface-900 group-hover:text-accent transition-colors">
            {job.title}
          </h3>
          <span className="font-mono text-lg font-semibold text-accent">
            {formatUsd(job.budget_usd)}
          </span>
        </div>
        <div className="flex gap-2 mb-4">
          <span className="inline-flex items-center px-2.5 py-1 text-xs font-mono uppercase tracking-wide bg-accent-50 text-accent border border-accent-200">
            {job.category}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 text-xs font-mono uppercase tracking-wide bg-surface-100 text-surface-600 border border-surface-200">
            {job.bsl_level}
          </span>
        </div>
        {job.equipment_required.length > 0 && (
          <p className="text-xs text-surface-500 mb-4 font-mono">
            {job.equipment_required.join(" · ")}
          </p>
        )}
        <div className="flex justify-between text-xs text-surface-400 pt-4 border-t border-surface-200">
          <span>Posted {new Date(job.posted_at).toLocaleDateString()}</span>
          {job.deadline && (
            <span className="text-accent font-medium">
              Due {new Date(job.deadline).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
