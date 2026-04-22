"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getExperiment, cancelExperiment, generateLabPacket } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { ExperimentProgressRail } from "@/components/ExperimentProgressRail";
import type { Experiment } from "@/lib/types";
import { formatUsd } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  SANGER_PLASMID_VERIFICATION: "Sanger / Plasmid Verification",
  QPCR_EXPRESSION:             "qPCR Expression",
  CELL_VIABILITY_IC50:         "Cell Viability IC₅₀",
  ENZYME_INHIBITION_IC50:      "Enzyme Inhibition IC₅₀",
  MICROBIAL_GROWTH_MATRIX:     "Microbial Growth Matrix",
  MIC_MBC_ASSAY:               "MIC / MBC Assay",
  ZONE_OF_INHIBITION:          "Zone of Inhibition",
  CUSTOM:                      "Custom",
};

// Convert snake_case key to a readable label
function fieldLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Render a spec value as a readable node
function SpecValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-surface-300">—</span>;
  if (typeof value === "boolean")
    return <span className={value ? "text-emerald-600" : "text-surface-500"}>{value ? "Yes" : "No"}</span>;
  if (typeof value === "number") return <span className="font-mono">{value}</span>;
  if (typeof value === "string") return <span>{value}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-surface-300">—</span>;
    if (typeof value[0] === "string" || typeof value[0] === "number") {
      return (
        <ul className="space-y-0.5">
          {(value as (string | number)[]).map((v, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-surface-300 select-none">·</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      );
    }
    // Array of objects — show each as a sub-block
    return (
      <div className="space-y-2">
        {(value as Record<string, unknown>[]).map((obj, i) => (
          <div key={i} className="pl-3 border-l-2 border-surface-100 space-y-0.5">
            {Object.entries(obj).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="text-surface-400 w-28 flex-shrink-0">{fieldLabel(k)}</span>
                <span className="text-surface-700"><SpecValue value={v} /></span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
      <div className="space-y-0.5">
        {Object.entries(obj).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-surface-400 w-28 flex-shrink-0">{fieldLabel(k)}</span>
            <span className="text-surface-700"><SpecValue value={v} /></span>
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

// Keys we surface separately — skip in the spec table
const SKIP_KEYS = new Set(["title", "experiment_type", "hypothesis"]);

export default function ExperimentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [generatingPacket, setGeneratingPacket] = useState(false);

  const experimentId = params.id as string;

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function fetchExperiment() {
      try {
        const data = await getExperiment(experimentId);
        setExperiment(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load experiment");
      } finally {
        setLoading(false);
      }
    }

    fetchExperiment();
  }, [authChecked, isAuthenticated, router, experimentId]);

  const handleGeneratePacket = async () => {
    setGeneratingPacket(true);
    setError("");
    try {
      await generateLabPacket(experimentId);
      router.push(`/experiments/${experimentId}/matching`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate lab packet");
      setGeneratingPacket(false);
    }
  };

  const handleCancel = async () => {
    const reason = prompt("Please provide a reason for cancellation:");
    if (!reason) return;
    if (!confirm("Are you sure you want to cancel this experiment?")) return;

    setCancelling(true);
    try {
      await cancelExperiment(experimentId, reason);
      const data = await getExperiment(experimentId);
      setExperiment(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel experiment");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (error || !experiment) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="alert-error">{error || "Experiment not found"}</div>
      </div>
    );
  }

  const spec = experiment.specification as {
    title?: string;
    experiment_type?: string;
    hypothesis?: { statement: string; null_hypothesis: string };
    [key: string]: unknown;
  };

  const typeLabel = TYPE_LABELS[spec.experiment_type ?? ""] ?? spec.experiment_type ?? "Unknown type";
  const specEntries = Object.entries(spec).filter(([k]) => !SKIP_KEYS.has(k));

  return (
    <>
      <ExperimentProgressRail experimentId={experimentId} currentStep="detail" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
        {/* Breadcrumb */}
        <Link
          href="/dashboard"
          className="text-xs text-surface-400 hover:text-surface-700 transition-colors"
        >
          &larr; Dashboard
        </Link>

        {/* Main card */}
        <div className="card">
          {/* Header */}
          <div className="px-6 py-5 border-b border-surface-100">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h1 className="text-lg font-semibold text-surface-900 leading-snug">
                  {(spec.title as string) || "Untitled Experiment"}
                </h1>
                <p className="text-xs text-surface-400 mt-1">{typeLabel}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={experiment.status} />
                <button
                  onClick={handleGeneratePacket}
                  disabled={generatingPacket}
                  className="btn-primary text-xs disabled:opacity-60 flex items-center gap-1.5"
                >
                  {generatingPacket ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending…
                    </>
                  ) : (
                    <>
                      Send to Lab
                      <span className="opacity-70">→</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Hypothesis */}
          {spec.hypothesis && (
            <div className="px-6 py-5 border-b border-surface-100">
              <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                Hypothesis
              </h2>
              <p className="text-sm text-surface-800 leading-relaxed">
                {spec.hypothesis.statement}
              </p>
              <p className="text-xs text-surface-500 mt-2 pl-3 border-l-2 border-surface-200">
                Null: {spec.hypothesis.null_hypothesis}
              </p>
            </div>
          )}

          {/* Specification fields */}
          {specEntries.length > 0 && (
            <div className="px-6 py-5 border-b border-surface-100">
              <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-4">
                Specification
              </h2>
              <div className="space-y-3">
                {specEntries.map(([key, value]) => (
                  <div key={key} className="flex gap-4 text-sm">
                    <span className="text-surface-400 w-40 flex-shrink-0 pt-0.5">
                      {fieldLabel(key)}
                    </span>
                    <span className="text-surface-700 min-w-0 flex-1">
                      <SpecValue value={value} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta grid: timeline + cost + operator */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-surface-100">
            {/* Timeline */}
            <div className="px-6 py-5">
              <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                Timeline
              </h2>
              <div className="space-y-2 text-xs">
                <div>
                  <p className="text-surface-400">Created</p>
                  <p className="text-surface-700 mt-0.5">
                    {new Date(experiment.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
                </div>
                {experiment.claimed_at && (
                  <div>
                    <p className="text-surface-400">Claimed</p>
                    <p className="text-surface-700 mt-0.5">
                      {new Date(experiment.claimed_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </p>
                  </div>
                )}
                {experiment.completed_at && (
                  <div>
                    <p className="text-surface-400">Completed</p>
                    <p className="text-surface-700 mt-0.5">
                      {new Date(experiment.completed_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Cost */}
            <div className="px-6 py-5">
              <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                Cost
              </h2>
              <div className="space-y-2 text-xs">
                {experiment.cost.estimated_usd && (
                  <div>
                    <p className="text-surface-400">Estimated</p>
                    <p className="text-surface-900 font-mono font-medium mt-0.5">
                      {formatUsd(experiment.cost.estimated_usd)}
                    </p>
                  </div>
                )}
                {experiment.cost.final_usd && (
                  <div>
                    <p className="text-surface-400">Final</p>
                    <p className="text-surface-900 font-mono font-medium mt-0.5">
                      {formatUsd(experiment.cost.final_usd)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-surface-400">Payment</p>
                  <p className="text-surface-700 mt-0.5 capitalize">
                    {experiment.cost.payment_status.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
            </div>

            {/* Operator */}
            <div className="px-6 py-5">
              <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                Operator
              </h2>
              {experiment.operator ? (
                <div className="space-y-2 text-xs">
                  <div>
                    <p className="text-surface-400">Reputation</p>
                    <p className="text-surface-700 mt-0.5">
                      {experiment.operator.reputation_score.toFixed(1)} / 5.0
                    </p>
                  </div>
                  <div>
                    <p className="text-surface-400">Experiments</p>
                    <p className="text-surface-700 mt-0.5">
                      {experiment.operator.completed_experiments} completed
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-surface-300">Not yet assigned</p>
              )}
            </div>
          </div>

          {/* Footer: experiment ID + cancel */}
          <div className="px-6 py-3 border-t border-surface-100 flex items-center justify-between">
            <p className="text-[10px] font-mono text-surface-300">{experimentId}</p>
            {["draft", "pending_review", "open"].includes(experiment.status) && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel Experiment"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
