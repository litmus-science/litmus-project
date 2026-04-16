"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getExperiment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Experiment } from "@/lib/types";
import { ExperimentProgressRail } from "@/components/ExperimentProgressRail";

type QuoteStage = {
  key: string;
  label: string;
  description: string;
  statuses: string[];
};

const QUOTE_STAGES: QuoteStage[] = [
  {
    key: "submitted",
    label: "Submitted",
    description: "Experiment sent to the lab for review",
    statuses: ["open"],
  },
  {
    key: "accepted",
    label: "Quote accepted",
    description: "Lab has reviewed and accepted the experiment",
    statuses: ["claimed"],
  },
  {
    key: "in_progress",
    label: "In progress",
    description: "Lab is actively running the assay",
    statuses: ["in_progress"],
  },
  {
    key: "completed",
    label: "Results ready",
    description: "Data has been submitted and is ready for review",
    statuses: ["completed"],
  },
];

function stageIndex(status: string): number {
  const idx = QUOTE_STAGES.findIndex((s) => s.statuses.includes(status));
  return idx === -1 ? 0 : idx;
}

export default function QuotePage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const experimentId = params.id as string;

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    getExperiment(experimentId)
      .then(setExperiment)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load experiment"))
      .finally(() => setLoading(false));
  }, [authChecked, isAuthenticated, router, experimentId]);

  if (loading) {
    return (
      <>
        <ExperimentProgressRail experimentId={experimentId} currentStep="quote" />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      </>
    );
  }

  if (error || !experiment) {
    return (
      <>
        <ExperimentProgressRail experimentId={experimentId} currentStep="quote" />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="alert-error">{error || "Experiment not found"}</div>
        </div>
      </>
    );
  }

  const status = experiment.status;
  const notSubmitted = ["draft", "pending_review"].includes(status);
  const isComplete = status === "completed";
  const activeIdx = notSubmitted ? -1 : stageIndex(status);

  return (
    <>
      <ExperimentProgressRail experimentId={experimentId} currentStep="quote" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-surface-900">Quote status</h1>
          <p className="text-sm text-surface-500 mt-1">
            Track where your experiment is in the lab&apos;s workflow.
          </p>
        </div>

        {notSubmitted ? (
          <div className="border border-surface-200 rounded-lg p-8 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-surface-700 mb-1">No quote started</p>
            <p className="text-xs text-surface-400 mb-5">Select a lab from the matching page to begin the quoting process.</p>
            <button
              onClick={() => router.push(`/experiments/${experimentId}/matching`)}
              className="btn-primary text-xs"
            >
              View matched labs
            </button>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[19px] top-6 bottom-6 w-px bg-surface-200" />

            <div className="space-y-0">
              {QUOTE_STAGES.map((stage, i) => {
                const isDone = i < activeIdx;
                const isCurrent = i === activeIdx;
                const isFuture = i > activeIdx;

                return (
                  <div key={stage.key} className="relative flex items-start gap-4 pb-8 last:pb-0">
                    {/* Node */}
                    <div className="flex-shrink-0 relative z-10">
                      {isDone ? (
                        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : isCurrent ? (
                        <div className="w-10 h-10 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-white border-2 border-surface-200 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-surface-300" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="pt-2.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium ${isFuture ? "text-surface-400" : "text-surface-900"}`}>
                          {stage.label}
                        </p>
                        {isCurrent && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                            Current
                          </span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 ${isFuture ? "text-surface-300" : "text-surface-500"}`}>
                        {stage.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {isComplete && (
              <div className="mt-8 pt-6 border-t border-surface-100">
                <button
                  onClick={() => router.push(`/experiments/${experimentId}/results`)}
                  className="btn-primary text-sm"
                >
                  View results
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
