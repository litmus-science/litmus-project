"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { getExperiment, claimJob } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import type { Experiment } from "@/lib/types";
import { formatUsd } from "@/lib/format";

interface ClaimForm {
  equipment_confirmation: boolean;
  authorization_confirmation: boolean;
  estimated_start_date: string;
  notes?: string;
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated } = useAuth();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");

  const experimentId = params.id as string;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClaimForm>({
    defaultValues: {
      estimated_start_date: new Date().toISOString().split("T")[0],
    },
  });

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function fetchExperiment() {
      try {
        const data = await getExperiment(experimentId);
        setExperiment(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load job");
      } finally {
        setLoading(false);
      }
    }

    fetchExperiment();
  }, [isAuthenticated, router, experimentId]);

  const onSubmit = async (data: ClaimForm) => {
    setClaiming(true);
    setError("");

    try {
      await claimJob(experimentId, {
        equipment_confirmation: data.equipment_confirmation,
        authorization_confirmation: data.authorization_confirmation,
        estimated_start_date: data.estimated_start_date,
        notes: data.notes,
      });
      router.push(`/operator/jobs/${experimentId}/submit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim job");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!experiment) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error || "Job not found"}
        </div>
      </div>
    );
  }

  const spec = experiment.specification as {
    title?: string;
    experiment_type?: string;
    hypothesis?: { statement: string; null_hypothesis: string };
    compliance?: { bsl_level: string };
    [key: string]: unknown;
  };
  const canClaim = experiment.status === "open";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/operator/jobs"
          className="text-indigo-600 hover:text-indigo-500 text-sm"
        >
          &larr; Back to Jobs
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
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Budget */}
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-800">Budget</p>
            <p className="text-2xl font-bold text-green-600">
              {experiment.cost.estimated_usd ? formatUsd(experiment.cost.estimated_usd) : "TBD"}
            </p>
          </div>

          {/* Hypothesis */}
          {spec.hypothesis && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-2">Hypothesis</h2>
              <div className="bg-gray-50 rounded p-3 text-sm">
                <p className="font-medium">
                  {spec.hypothesis.statement}
                </p>
                <p className="text-gray-500 mt-2">
                  Null: {spec.hypothesis.null_hypothesis}
                </p>
              </div>
            </div>
          )}

          {/* Compliance */}
          {spec.compliance && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-2">Requirements</h2>
              <div className="flex gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                  {spec.compliance.bsl_level}
                </span>
              </div>
            </div>
          )}

          {/* Full Specification */}
          <div>
            <h2 className="text-sm font-medium text-gray-500 mb-2">Full Specification</h2>
            <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto max-h-64">
              {JSON.stringify(spec, null, 2)}
            </pre>
          </div>
        </div>

        {/* Claim Form */}
        {canClaim && (
          <div className="px-6 py-4 border-t border-gray-200">
            <h2 className="font-medium mb-4">Claim This Job</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    {...register("equipment_confirmation", {
                      required: "You must confirm equipment access",
                    })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">
                    I have access to all required equipment
                  </span>
                </label>
                {errors.equipment_confirmation && (
                  <p className="text-sm text-red-600">
                    {errors.equipment_confirmation.message}
                  </p>
                )}

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    {...register("authorization_confirmation", {
                      required: "You must confirm authorization",
                    })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">
                    I am authorized to perform this type of experiment
                  </span>
                </label>
                {errors.authorization_confirmation && (
                  <p className="text-sm text-red-600">
                    {errors.authorization_confirmation.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estimated Start Date
                </label>
                <input
                  type="date"
                  {...register("estimated_start_date", {
                    required: "Start date is required",
                  })}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  {...register("notes")}
                  rows={2}
                  placeholder="Any notes for the requester..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={claiming}
                className="w-full bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                {claiming ? "Claiming..." : "Claim Job"}
              </button>
            </form>
          </div>
        )}

        {experiment.status === "claimed" && experiment.operator && (
          <div className="px-6 py-4 border-t border-gray-200">
            <Link
              href={`/operator/jobs/${experimentId}/submit`}
              className="block w-full text-center bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-md text-sm font-medium"
            >
              Submit Results
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
