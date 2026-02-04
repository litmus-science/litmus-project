"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getExperiment, cancelExperiment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import type { Experiment } from "@/lib/types";
import { formatUsd } from "@/lib/format";

export default function ExperimentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const experimentId = params.id as string;

  useEffect(() => {
    if (!authChecked) {
      return;
    }
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function fetchExperiment() {
      try {
        const data = await getExperiment(experimentId);
        setExperiment(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load experiment",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchExperiment();
  }, [authChecked, isAuthenticated, router, experimentId]);

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
      setError(
        err instanceof Error ? err.message : "Failed to cancel experiment",
      );
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !experiment) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error || "Experiment not found"}
        </div>
      </div>
    );
  }

  const spec = experiment.specification as {
    title?: string;
    experiment_type?: string;
    hypothesis?: { statement: string; null_hypothesis: string };
    [key: string]: unknown;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-indigo-600 hover:text-indigo-500 text-sm"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {(spec.title as string) || "Untitled Experiment"}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {spec.experiment_type}
              </p>
            </div>
            <StatusBadge status={experiment.status} />
          </div>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Timeline */}
          <div>
            <h2 className="text-sm font-medium text-gray-500 mb-2">Timeline</h2>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-gray-500">Created:</span>{" "}
                {new Date(experiment.created_at).toLocaleString()}
              </p>
              {experiment.claimed_at && (
                <p>
                  <span className="text-gray-500">Claimed:</span>{" "}
                  {new Date(experiment.claimed_at).toLocaleString()}
                </p>
              )}
              {experiment.completed_at && (
                <p>
                  <span className="text-gray-500">Completed:</span>{" "}
                  {new Date(experiment.completed_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Operator Info */}
          {experiment.operator && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-2">
                Operator
              </h2>
              <div className="text-sm">
                <p>
                  Reputation: {experiment.operator.reputation_score.toFixed(1)}
                  /5.0
                </p>
                <p>
                  Completed experiments:{" "}
                  {experiment.operator.completed_experiments}
                </p>
              </div>
            </div>
          )}

          {/* Hypothesis */}
          {spec.hypothesis && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-2">
                Hypothesis
              </h2>
              <div className="bg-gray-50 rounded p-3 text-sm">
                <p className="font-medium">{spec.hypothesis.statement}</p>
                <p className="text-gray-500 mt-2">
                  Null: {spec.hypothesis.null_hypothesis}
                </p>
              </div>
            </div>
          )}

          {/* Cost */}
          <div>
            <h2 className="text-sm font-medium text-gray-500 mb-2">Cost</h2>
            <div className="text-sm">
              {experiment.cost.estimated_usd && (
                <p>Estimated: {formatUsd(experiment.cost.estimated_usd)}</p>
              )}
              {experiment.cost.final_usd && (
                <p>Final: {formatUsd(experiment.cost.final_usd)}</p>
              )}
              <p className="text-gray-500">
                Payment status: {experiment.cost.payment_status}
              </p>
            </div>
          </div>

          {/* Full Specification */}
          <div>
            <h2 className="text-sm font-medium text-gray-500 mb-2">
              Full Specification
            </h2>
            <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto">
              {JSON.stringify(spec, null, 2)}
            </pre>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          {experiment.status === "completed" && (
            <Link
              href={`/experiments/${experimentId}/results`}
              className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-md text-sm font-medium"
            >
              View Results
            </Link>
          )}
          {["draft", "pending_review", "open"].includes(experiment.status) && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {cancelling ? "Cancelling..." : "Cancel Experiment"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
