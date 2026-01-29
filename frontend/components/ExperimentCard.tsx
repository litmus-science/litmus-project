"use client";

import Link from "next/link";
import type { Experiment } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const spec = experiment.specification as { title?: string; experiment_type?: string };
  const title = spec.title || spec.experiment_type || "Untitled";

  return (
    <Link href={`/experiments/${experiment.id}`}>
      <div className="card p-5 hover:shadow-md hover:border-surface-200 transition-all group">
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-display text-lg text-primary group-hover:text-primary-light transition-colors truncate pr-2">
            {title}
          </h3>
          <StatusBadge status={experiment.status} />
        </div>
        <p className="text-sm text-surface-400 mb-4 font-medium">
          {spec.experiment_type}
        </p>
        <div className="flex justify-between text-xs text-surface-300 pt-3 border-t border-surface-100">
          <span>
            {new Date(experiment.created_at).toLocaleDateString()}
          </span>
          {experiment.cost.estimated_usd && (
            <span className="font-mono text-primary-light font-medium">
              ${experiment.cost.estimated_usd.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
