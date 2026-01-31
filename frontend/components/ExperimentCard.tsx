"use client";

import Link from "next/link";
import type { Experiment } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

export function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const spec = experiment.specification as { title?: string; experiment_type?: string };
  const title = spec.title || spec.experiment_type || "Untitled";

  return (
    <Link href={`/experiments/${experiment.id}`}>
      <div className="card p-6 hover:shadow-lg transition-all group">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-display text-xl text-surface-900 group-hover:text-accent transition-colors truncate pr-3">
            {title}
          </h3>
          <StatusBadge status={experiment.status} />
        </div>
        <p className="text-sm text-surface-500 mb-4 font-mono uppercase tracking-wide">
          {spec.experiment_type}
        </p>
        <div className="flex justify-between text-xs text-surface-400 pt-4 border-t border-surface-200">
          <span>
            {new Date(experiment.created_at).toLocaleDateString()}
          </span>
          {experiment.cost.estimated_usd && (
            <span className="font-mono text-accent font-medium">
              {formatUsd(experiment.cost.estimated_usd)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
