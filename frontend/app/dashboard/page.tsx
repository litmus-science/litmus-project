"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listExperiments } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ExperimentCard } from "@/components/ExperimentCard";
import type { Experiment, ExperimentStatus } from "@/lib/types";

const statusFilters: { label: string; value: ExperimentStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Disputed", value: "disputed" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, authChecked } = useAuth();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExperimentStatus | "all">(
    "all",
  );

  useEffect(() => {
    if (!authChecked) {
      return;
    }
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function fetchExperiments() {
      try {
        const params =
          statusFilter !== "all" ? { status: statusFilter } : undefined;
        const data = await listExperiments(params);
        setExperiments(data.experiments);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load experiments",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchExperiments();
  }, [authChecked, isAuthenticated, router, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-10">
        <div>
          <span className="section-label">01 — Dashboard</span>
          <h1 className="text-4xl font-display text-surface-900">
            My Experiments
          </h1>
        </div>
        <Link href="/experiments/new" className="btn-primary">
          New Experiment
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex gap-2 flex-wrap">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-4 py-2 text-sm font-mono uppercase tracking-wide transition-all ${
                statusFilter === filter.value
                  ? "bg-accent text-white"
                  : "bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert-error px-6 py-4 mb-8">{error}</div>}

      {experiments.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 border-2 border-surface-200 flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-surface-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
          </div>
          <p className="text-surface-500 mb-6 text-lg">No experiments found</p>
          <Link
            href="/experiments/new"
            className="text-accent hover:text-accent-dim font-medium transition-colors"
          >
            Create your first experiment
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {experiments.map((experiment) => (
            <ExperimentCard key={experiment.id} experiment={experiment} />
          ))}
        </div>
      )}
    </div>
  );
}
