"use client";

import Link from "next/link";
import type { Job } from "@/lib/types";

export function JobCard({ job }: { job: Job }) {
  return (
    <Link href={`/operator/jobs/${job.experiment_id}`}>
      <div className="card p-5 hover:shadow-md hover:border-surface-200 transition-all group">
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-display text-lg text-primary group-hover:text-primary-light transition-colors">
            {job.title}
          </h3>
          <span className="font-mono text-lg font-semibold text-primary-light">
            ${job.budget_usd.toFixed(2)}
          </span>
        </div>
        <div className="flex gap-2 mb-4">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-600 border border-primary-200">
            {job.category}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-surface-100 text-surface-500">
            {job.bsl_level}
          </span>
        </div>
        {job.equipment_required.length > 0 && (
          <p className="text-xs text-surface-400 mb-3 font-mono">
            {job.equipment_required.join(" · ")}
          </p>
        )}
        <div className="flex justify-between text-xs text-surface-300 pt-3 border-t border-surface-100">
          <span>Posted {new Date(job.posted_at).toLocaleDateString()}</span>
          {job.deadline && (
            <span className="text-accent-soft font-medium">
              Due {new Date(job.deadline).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
