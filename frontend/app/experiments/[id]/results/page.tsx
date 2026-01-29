"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getResults, approveResults, disputeResults } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ExperimentResults, DisputeReason } from "@/lib/types";

const disputeReasons: { value: DisputeReason; label: string }[] = [
  { value: "results_incomplete", label: "Results are incomplete" },
  { value: "results_incorrect", label: "Results appear incorrect" },
  { value: "protocol_not_followed", label: "Protocol was not followed" },
  { value: "documentation_insufficient", label: "Documentation is insufficient" },
  { value: "other", label: "Other" },
];

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated } = useAuth();
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [disputeReason, setDisputeReason] = useState<DisputeReason>("results_incomplete");
  const [disputeDescription, setDisputeDescription] = useState("");

  const experimentId = params.id as string;

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function fetchResults() {
      try {
        const data = await getResults(experimentId);
        setResults(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results");
      } finally {
        setLoading(false);
      }
    }

    fetchResults();
  }, [isAuthenticated, router, experimentId]);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveResults(experimentId, { rating, feedback: feedback || undefined });
      router.push(`/experiments/${experimentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve results");
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error && !results) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-gray-500">No results available yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href={`/experiments/${experimentId}`}
          className="text-indigo-600 hover:text-indigo-500 text-sm"
        >
          &larr; Back to Experiment
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Experiment Results</h1>
        </div>

        <div className="px-6 py-4 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Hypothesis Result */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                  results.hypothesis_supported ? "bg-green-500" : "bg-red-500"
                }`}
              >
                {results.hypothesis_supported ? "Yes" : "No"}
              </div>
              <div>
                <p className="font-medium">
                  Hypothesis {results.hypothesis_supported ? "Supported" : "Not Supported"}
                </p>
                {results.confidence_level && (
                  <p className="text-sm text-gray-500">
                    Confidence: {results.confidence_level}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          {results.summary && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-2">Summary</h2>
              <p className="text-sm">{results.summary}</p>
            </div>
          )}

          {/* Measurements */}
          {results.structured_data?.measurements && results.structured_data.measurements.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-2">Measurements</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Metric</th>
                      <th className="text-left py-2 px-2">Value</th>
                      <th className="text-left py-2 px-2">Unit</th>
                      <th className="text-left py-2 px-2">Condition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.structured_data.measurements.map((m, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2 px-2">{m.metric}</td>
                        <td className="py-2 px-2">{m.value}</td>
                        <td className="py-2 px-2">{m.unit || "-"}</td>
                        <td className="py-2 px-2">{m.condition || "-"}</td>
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
              <h2 className="text-sm font-medium text-gray-500 mb-2">Statistics</h2>
              <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
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
              <h2 className="text-sm font-medium text-gray-500 mb-2">Raw Data Files</h2>
              <ul className="space-y-2">
                {results.raw_data_files.map((file, i) => (
                  <li key={i}>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-500 text-sm"
                    >
                      {file.name} {file.format && `(${file.format})`}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Documentation Photos */}
          {results.documentation?.photos && results.documentation.photos.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-2">Documentation Photos</h2>
              <div className="grid grid-cols-2 gap-2">
                {results.documentation.photos.map((photo, i) => (
                  <a
                    key={i}
                    href={photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={photo.url}
                      alt={`Step ${photo.step}`}
                      className="rounded border"
                    />
                    <p className="text-xs text-gray-500 mt-1">Step {photo.step}</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Operator Notes */}
          {results.operator_notes && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-2">Operator Notes</h2>
              <p className="text-sm bg-gray-50 rounded p-3">{results.operator_notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {results.status === "completed" && (
          <div className="px-6 py-4 border-t border-gray-200">
            {!showDisputeForm ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rating
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        className={`text-2xl ${
                          star <= rating ? "text-yellow-400" : "text-gray-300"
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Feedback (optional)
                  </label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={2}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {approving ? "Approving..." : "Approve Results"}
                  </button>
                  <button
                    onClick={() => setShowDisputeForm(true)}
                    className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Dispute Results
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="font-medium">File a Dispute</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason
                  </label>
                  <select
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value as DisputeReason)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  >
                    {disputeReasons.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (min 50 characters)
                  </label>
                  <textarea
                    value={disputeDescription}
                    onChange={(e) => setDisputeDescription(e.target.value)}
                    rows={4}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {disputeDescription.length}/50 characters
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleDispute}
                    disabled={disputing}
                    className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {disputing ? "Submitting..." : "Submit Dispute"}
                  </button>
                  <button
                    onClick={() => setShowDisputeForm(false)}
                    className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-4 py-2 rounded-md text-sm font-medium"
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
  );
}
