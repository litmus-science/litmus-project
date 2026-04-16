"use client";

import Link from "next/link";
import type { Experiment } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

const TYPE_LABELS: Record<string, string> = {
  SANGER_PLASMID_VERIFICATION: "Sanger / Plasmid",
  QPCR_EXPRESSION:             "qPCR Expression",
  CELL_VIABILITY_IC50:         "Cell Viability IC₅₀",
  ENZYME_INHIBITION_IC50:      "Enzyme Inhibition IC₅₀",
  MICROBIAL_GROWTH_MATRIX:     "Microbial Growth",
  MIC_MBC_ASSAY:               "MIC / MBC Assay",
  ZONE_OF_INHIBITION:          "Zone of Inhibition",
  CUSTOM:                      "Custom",
};

export function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const spec = experiment.specification as {
    title?: string;
    experiment_type?: string;
  };
  const title = spec.title || spec.experiment_type || "Untitled";
  const typeLabel = TYPE_LABELS[spec.experiment_type ?? ""] ?? spec.experiment_type ?? "";

  return (
    <Link href={`/experiments/${experiment.id}`}>
      <div className="card p-5 hover:shadow-md group cursor-pointer">
        <div className="flex justify-between items-start gap-3 mb-3">
          <h3 className="font-semibold text-surface-900 text-sm leading-snug group-hover:text-accent transition-colors line-clamp-2">
            {title}
          </h3>
          <StatusBadge status={experiment.status} />
        </div>
        <p className="text-xs text-surface-400 font-mono mb-4">
          {typeLabel}
        </p>
        <div className="flex justify-between items-center text-xs text-surface-400 pt-3 border-t border-surface-100">
          <span>{new Date(experiment.created_at).toLocaleDateString()}</span>
          {experiment.cost.estimated_usd && (
            <span className="font-mono font-medium text-surface-600">
              {formatUsd(experiment.cost.estimated_usd)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
