"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getExperiment, submitForQuote } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Experiment } from "@/lib/types";
import { ExperimentProgressRail } from "@/components/ExperimentProgressRail";

// ── Deterministic review duration ─────────────────────────────────────────────
// Hashes the experiment ID to a consistent 1–5 hour window so the timer is
// stable across page refreshes but unique per experiment.
function reviewDurationMs(experimentId: string): number {
  let h = 0;
  for (let i = 0; i < experimentId.length; i++) {
    h = (Math.imul(31, h) + experimentId.charCodeAt(i)) | 0;
  }
  const hours = 1 + (Math.abs(h) % 5); // 1–5 hours
  return hours * 60 * 60 * 1000;
}

function reviewComplete(experimentId: string, createdAt: string): boolean {
  return Date.now() > new Date(createdAt).getTime() + reviewDurationMs(experimentId);
}

function reviewEta(experimentId: string, createdAt: string): string {
  const doneAt = new Date(createdAt).getTime() + reviewDurationMs(experimentId);
  const msLeft = doneAt - Date.now();
  if (msLeft <= 0) return "Complete";
  const h = Math.floor(msLeft / 3_600_000);
  const m = Math.floor((msLeft % 3_600_000) / 60_000);
  return h > 0 ? `~${h}h ${m}m remaining` : `~${m}m remaining`;
}

// ── Timeline stages (after review) ───────────────────────────────────────────
type QuoteStage = { key: string; label: string; description: string; statuses: string[] };

const QUOTE_STAGES: QuoteStage[] = [
  { key: "submitted",   label: "Submitted",      description: "Experiment sent to the lab for review",          statuses: ["open"] },
  { key: "accepted",    label: "Quote accepted",  description: "Lab has reviewed and accepted the experiment",   statuses: ["claimed"] },
  { key: "in_progress", label: "In progress",     description: "Lab is actively running the assay",             statuses: ["in_progress"] },
  { key: "completed",   label: "Results ready",   description: "Data has been submitted and is ready for review", statuses: ["completed"] },
];

function stageIndex(status: string): number {
  const idx = QUOTE_STAGES.findIndex((s) => s.statuses.includes(status));
  return idx === -1 ? 0 : idx;
}

// ── Timeline node ─────────────────────────────────────────────────────────────
function Node({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0 relative z-10">
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (current) {
    return (
      <div className="w-10 h-10 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center flex-shrink-0 relative z-10">
        <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-white border-2 border-surface-200 flex items-center justify-center flex-shrink-0 relative z-10">
      <div className="w-2 h-2 rounded-full bg-surface-300" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function QuotePage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Tick every minute so the ETA label updates without a full reload
  const [, setTick] = useState(0);

  const experimentId = params.id as string;

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) { router.push("/login"); return; }
    getExperiment(experimentId)
      .then(setExperiment)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load experiment"))
      .finally(() => setLoading(false));
  }, [authChecked, isAuthenticated, router, experimentId]);

  // Tick every 60s so remaining-time label refreshes
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await submitForQuote(experimentId);
      const updated = await getExperiment(experimentId);
      setExperiment(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

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
  const isDraft = status === "draft" || status === "pending_review";
  const reviewed = isDraft
    ? reviewComplete(experiment.id, experiment.created_at)
    : true; // once submitted, review is always done
  const isComplete = status === "completed";
  const activeIdx = isDraft ? -1 : stageIndex(status);

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

        {error && <div className="alert-error mb-6">{error}</div>}

        <div className="relative">
          {/* Vertical connector */}
          <div className="absolute left-[19px] top-6 bottom-6 w-px bg-surface-200" />

          <div className="space-y-0">

            {/* ── Step 0: Scientist reviewing ───────────────────────────── */}
            <div className="relative flex items-start gap-4 pb-8">
              <Node done={reviewed} current={!reviewed} />
              <div className="pt-2.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-surface-900">
                    Scientist reviewing
                  </p>
                  {!reviewed && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 text-surface-500">
                  {reviewed
                    ? "Protocol reviewed and approved"
                    : `Reviewing your protocol — ${reviewEta(experiment.id, experiment.created_at)}`}
                </p>

                {/* Submit CTA appears once review is done and still in draft */}
                {reviewed && isDraft && (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="mt-3 btn-primary text-xs disabled:opacity-50"
                  >
                    {submitting ? "Submitting…" : "Submit to lab →"}
                  </button>
                )}
              </div>
            </div>

            {/* ── Steps 1–4: post-submission stages ────────────────────── */}
            {QUOTE_STAGES.map((stage, i) => {
              const isDone    = !isDraft && i < activeIdx;
              const isCurrent = !isDraft && i === activeIdx;
              const isFuture  = isDraft || i > activeIdx;

              return (
                <div key={stage.key} className="relative flex items-start gap-4 pb-8 last:pb-0">
                  <Node done={isDone} current={isCurrent} />
                  <div className="pt-2.5 flex-1 min-w-0">
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
      </div>
    </>
  );
}
