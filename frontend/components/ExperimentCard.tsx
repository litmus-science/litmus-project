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
  MIC_MBC_ASSAY:               "MIC / MBC",
  ZONE_OF_INHIBITION:          "Zone of Inhibition",
  CUSTOM:                      "Custom",
  // short-form aliases stored in DB
  enzyme_inhibition:    "Enzyme Inhibition IC₅₀",
  cell_viability:       "Cell Viability IC₅₀",
  qpcr_expression:      "qPCR Expression",
  mic_mbc:              "MIC / MBC",
  zone_of_inhibition:   "Zone of Inhibition",
  microbial_growth:     "Microbial Growth",
  sanger:               "Sanger / Plasmid",
  custom:               "Custom",
};

const STATUS_ACCENT: Record<string, string> = {
  completed:      "border-t-emerald-500",
  in_progress:    "border-t-accent",
  open:           "border-t-accent",
  claimed:        "border-t-accent",
  pending_review: "border-t-surface-300",
  draft:          "border-t-surface-200",
  disputed:       "border-t-amber-400",
  cancelled:      "border-t-surface-200",
};

export function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const spec = experiment.specification as Record<string, string | undefined>;
  const title = spec.title || spec.experiment_type || "Untitled";
  const typeLabel = TYPE_LABELS[spec.experiment_type ?? ""] ?? spec.experiment_type ?? "";
  const accentClass = STATUS_ACCENT[experiment.status] ?? "border-t-surface-200";

  return (
    <Link href={`/experiments/${experiment.id}`}>
      <div className={`card border-t-2 ${accentClass} p-5 group cursor-pointer hover:shadow-sm transition-shadow`}>
        {/* Title */}
        <h3 className="text-sm font-semibold text-surface-900 leading-snug group-hover:text-accent transition-colors line-clamp-2 mb-1">
          {title}
        </h3>

        {/* Assay type */}
        <p className="text-[11px] text-surface-400 font-mono mb-4">{typeLabel}</p>

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-surface-200">
          <StatusBadge status={experiment.status} />
          {experiment.cost.estimated_usd && (
            <span className="text-xs font-mono text-surface-500">
              {formatUsd(experiment.cost.estimated_usd)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
