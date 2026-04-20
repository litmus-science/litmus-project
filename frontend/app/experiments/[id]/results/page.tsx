"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getResults, approveResults, disputeResults, getExperiment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ExperimentResults, DisputeReason, Experiment } from "@/lib/types";
import { ExperimentProgressRail } from "@/components/ExperimentProgressRail";

const disputeReasons: { value: DisputeReason; label: string }[] = [
  { value: "results_incomplete", label: "Results are incomplete" },
  { value: "results_incorrect", label: "Results appear incorrect" },
  { value: "protocol_not_followed", label: "Protocol was not followed" },
  {
    value: "documentation_insufficient",
    label: "Documentation is insufficient",
  },
  { value: "other", label: "Other" },
];

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [disputeReason, setDisputeReason] =
    useState<DisputeReason>("results_incomplete");
  const [disputeDescription, setDisputeDescription] = useState("");

  const experimentId = params.id as string;

  useEffect(() => {
    if (!authChecked) {
      return;
    }
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function fetchAll() {
      try {
        const [exp, data] = await Promise.allSettled([
          getExperiment(experimentId),
          getResults(experimentId),
        ]);

        if (exp.status === "fulfilled") setExperiment(exp.value);

        if (data.status === "fulfilled") {
          setResults(data.value);
        } else {
          // Only surface as an error if the experiment is actually completed
          // but results failed for a different reason. For non-completed
          // experiments the API returns 400 "not yet completed" — that's
          // expected; we use experiment.status to pick the right UI state.
          const msg = data.reason instanceof Error ? data.reason.message : "Failed to load results";
          const isExpected = msg.toLowerCase().includes("not yet completed") || msg.toLowerCase().includes("not completed");
          if (!isExpected) setError(msg);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, [authChecked, isAuthenticated, router, experimentId]);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveResults(experimentId, {
        rating,
        feedback: feedback || undefined,
      });
      router.push(`/experiments/${experimentId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to approve results",
      );
    } finally {
      setApproving(false);
    }
  };

  const handleDispute = async () => {
    if (disputeDescription.length < 50) {
      setError("Dispute description must be at least 50 characters");
      return;
    }

    setDisputing(true);
    try {
      await disputeResults(experimentId, {
        reason: disputeReason,
        description: disputeDescription,
      });
      router.push(`/experiments/${experimentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit dispute");
    } finally {
      setDisputing(false);
    }
  };

  if (loading) {
    return (
      <>
        <ExperimentProgressRail experimentId={experimentId} currentStep="results" />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      </>
    );
  }

  if (error && !results) {
    return (
      <>
        <ExperimentProgressRail experimentId={experimentId} currentStep="results" />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="alert-error">{error}</div>
        </div>
      </>
    );
  }

  const expStatus = experiment?.status ?? null;
  const notSubmitted = !results && !error && expStatus !== null && ["draft", "pending_review"].includes(expStatus);
  const awaitingResults = !results && !error && expStatus !== null && ["open", "claimed", "in_progress"].includes(expStatus);

  if (notSubmitted) {
    return (
      <>
        <ExperimentProgressRail experimentId={experimentId} currentStep="results" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-surface-900 mb-1">No lab selected yet</h1>
          <p className="text-sm text-surface-500 max-w-sm mb-6">
            Pick a matched lab and submit for a quote before results can be collected here.
          </p>
          <button
            onClick={() => router.push(`/experiments/${experimentId}/matching`)}
            className="btn-primary text-sm"
          >
            View matched labs
          </button>
        </div>
      </>
    );
  }

  if (awaitingResults) {
    const previews = [
      {
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
        title: "Dose–response curves",
        desc: "IC50 / EC50 with 4PL fit and confidence bounds",
      },
      {
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M10 3v18M14 3v18" />
          </svg>
        ),
        title: "Structured measurements",
        desc: "Parsed values, units, and conditions in a reviewable table",
      },
      {
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ),
        title: "Hypothesis verdict",
        desc: "Supported / not supported with statistical confidence",
      },
      {
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        ),
        title: "Raw data & documentation",
        desc: "Original data files, photos, and operator notes from the CRO",
      },
      {
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        ),
        title: "Approve or dispute",
        desc: "Rate the CRO, give feedback, or file a formal dispute",
      },
    ];

    return (
      <>
        <ExperimentProgressRail experimentId={experimentId} currentStep="results" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Status indicator */}
          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-surface-900 mb-1">Awaiting data from the lab</h1>
            <p className="text-sm text-surface-500 max-w-md">
              Once the CRO submits their deliverables, we&apos;ll automatically parse and analyze the data here.
            </p>
          </div>

          {/* Preview cards */}
          <div className="border border-surface-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-surface-50 border-b border-surface-200">
              <p className="text-[10px] tracking-widest-plus uppercase text-surface-400 font-medium">
                What you&apos;ll see when results arrive
              </p>
            </div>
            <div className="divide-y divide-surface-100">
              {previews.map((p) => (
                <div key={p.title} className="flex items-start gap-3 px-4 py-3.5">
                  <div className="w-7 h-7 rounded-md bg-surface-100 flex items-center justify-center text-surface-400 flex-shrink-0 mt-0.5">
                    {p.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-700">{p.title}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{p.desc}</p>
                  </div>
                  {/* Shimmer placeholder */}
                  <div className="ml-auto flex-shrink-0 w-24 h-5 bg-surface-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!results) return null;

  return (
    <>
      <ExperimentProgressRail experimentId={experimentId} currentStep="results" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card">
          {/* Header */}
          <div className="px-6 py-5 border-b border-surface-100">
            <h1 className="text-lg font-semibold text-surface-900">
              Experiment Results
            </h1>
          </div>

          <div className="px-6 py-5 space-y-6">
            {error && (
              <div className="alert-error">{error}</div>
            )}

            {/* Hypothesis Result */}
            <div className="bg-surface-50 rounded-md p-4">
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                    results.hypothesis_supported ? "bg-emerald-500" : "bg-red-500"
                  }`}
                >
                  {results.hypothesis_supported ? "Yes" : "No"}
                </div>
                <div>
                  <p className="font-semibold text-surface-900 text-sm">
                    Hypothesis{" "}
                    {results.hypothesis_supported ? "Supported" : "Not Supported"}
                  </p>
                  {results.confidence_level && (
                    <p className="text-xs text-surface-500 mt-0.5">
                      Confidence: {results.confidence_level}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Summary */}
            {results.summary && (
              <div>
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                  Summary
                </h2>
                <p className="text-sm text-surface-700">{results.summary}</p>
              </div>
            )}

            {/* Measurements */}
            {results.structured_data?.measurements &&
              results.structured_data.measurements.length > 0 && (
                <div>
                  <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                    Measurements
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-100 text-[10px] tracking-widest-plus uppercase text-surface-400">
                          <th className="text-left py-2 px-2 font-medium">Metric</th>
                          <th className="text-left py-2 px-2 font-medium">Value</th>
                          <th className="text-left py-2 px-2 font-medium">Unit</th>
                          <th className="text-left py-2 px-2 font-medium">Condition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.structured_data.measurements.map((m, i) => (
                          <tr key={i} className="border-b border-surface-50 text-surface-700">
                            <td className="py-2 px-2">{m.metric}</td>
                            <td className="py-2 px-2">{m.value}</td>
                            <td className="py-2 px-2">{m.unit || "—"}</td>
                            <td className="py-2 px-2">{m.condition || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            {/* Statistics */}
            {results.structured_data?.statistics && (
              <div>
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                  Statistics
                </h2>
                <div className="bg-surface-50 rounded-md p-4 text-sm space-y-1.5 text-surface-700">
                  {results.structured_data.statistics.test_used && (
                    <p>Test: {results.structured_data.statistics.test_used}</p>
                  )}
                  {results.structured_data.statistics.p_value !== undefined && (
                    <p>P-value: {results.structured_data.statistics.p_value}</p>
                  )}
                  {results.structured_data.statistics.effect_size !== undefined && (
                    <p>Effect size: {results.structured_data.statistics.effect_size}</p>
                  )}
                </div>
              </div>
            )}

            {/* Raw Data Files */}
            {results.raw_data_files.length > 0 && (
              <div>
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                  Raw Data Files
                </h2>
                <ul className="space-y-2">
                  {results.raw_data_files.map((file, i) => (
                    <li key={i}>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent-dim text-sm"
                      >
                        {file.name} {file.format && `(${file.format})`}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Documentation Photos */}
            {results.documentation?.photos &&
              results.documentation.photos.length > 0 && (
                <div>
                  <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                    Documentation Photos
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    {results.documentation.photos.map((photo, i) => (
                      <a
                        key={i}
                        href={photo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={`Step ${photo.step}`}
                          className="rounded-md border border-surface-200"
                        />
                        <p className="text-xs text-surface-400 mt-1">
                          Step {photo.step}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              )}

            {/* Operator Notes */}
            {results.operator_notes && (
              <div>
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                  Operator Notes
                </h2>
                <p className="text-sm text-surface-700 bg-surface-50 rounded-md p-4">
                  {results.operator_notes}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          {results.status === "completed" && (
            <div className="px-6 py-5 border-t border-surface-100">
              {!showDisputeForm ? (
                <div className="space-y-4">
                  <div>
                    <label className="form-label">Rating</label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRating(star)}
                          className={`text-2xl transition-colors ${
                            star <= rating ? "text-amber-400" : "text-surface-200"
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Feedback (optional)</label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={2}
                      className="input"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      className="btn-primary text-xs disabled:opacity-50"
                    >
                      {approving ? "Approving..." : "Approve Results"}
                    </button>
                    <button
                      onClick={() => setShowDisputeForm(true)}
                      className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors"
                    >
                      Dispute Results
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-surface-900">File a Dispute</h3>

                  <div>
                    <label className="form-label">Reason</label>
                    <select
                      value={disputeReason}
                      onChange={(e) =>
                        setDisputeReason(e.target.value as DisputeReason)
                      }
                      className="input"
                    >
                      {disputeReasons.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">
                      Description (min 50 characters)
                    </label>
                    <textarea
                      value={disputeDescription}
                      onChange={(e) => setDisputeDescription(e.target.value)}
                      rows={4}
                      className="input"
                    />
                    <p className="text-xs text-surface-400 mt-1">
                      {disputeDescription.length}/50 characters
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleDispute}
                      disabled={disputing}
                      className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {disputing ? "Submitting..." : "Submit Dispute"}
                    </button>
                    <button
                      onClick={() => setShowDisputeForm(false)}
                      className="btn-secondary text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
