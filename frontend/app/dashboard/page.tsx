"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listExperiments } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ExperimentCard } from "@/components/ExperimentCard";
import type { Experiment, ExperimentStatus } from "@/lib/types";

const STATUS_FILTERS: { label: string; value: ExperimentStatus | "all" }[] = [
  { label: "All",         value: "all" },
  { label: "Draft",       value: "draft" },
  { label: "Open",        value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed",   value: "completed" },
  { label: "Disputed",    value: "disputed" },
];

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0, open: 1, claimed: 2,
  pending_review: 3, draft: 4, completed: 5, disputed: 6, cancelled: 7,
};

function getProgram(exp: Experiment): string {
  const spec = exp.specification as Record<string, unknown>;
  return (spec?.program as string) || "Other";
}

function getTherapeuticArea(exp: Experiment): string {
  const spec = exp.specification as Record<string, unknown>;
  return (spec?.therapeutic_area as string) || "";
}

function ProgramHeader({ name, area, experiments }: {
  name: string;
  area: string;
  experiments: Experiment[];
}) {
  const active   = experiments.filter(e => ["open", "claimed", "in_progress"].includes(e.status)).length;
  const done     = experiments.filter(e => e.status === "completed").length;
  const total    = experiments.length;
  const totalCost = experiments.reduce((s, e) => s + (e.cost.estimated_usd ?? 0), 0);

  return (
    <div className="flex items-end justify-between mb-4">
      <div>
        <h2 className="text-xl font-display text-surface-900">{name}</h2>
        {area && (
          <p className="text-xs text-surface-400 mt-0.5">{area}</p>
        )}
      </div>
      <div className="flex items-center gap-5 text-xs text-surface-400 pb-0.5">
        {done > 0 && (
          <span className="text-emerald-600 font-medium">{done} completed</span>
        )}
        {active > 0 && (
          <span>{active} active</span>
        )}
        <span className="font-mono text-surface-500">
          ${totalCost.toLocaleString()} est.
        </span>
        <span>{total} assay{total !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, authChecked } = useAuth();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExperimentStatus | "all">("all");

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    async function fetchExperiments() {
      try {
        const data = await listExperiments();
        setExperiments(data.experiments);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load experiments");
      } finally {
        setLoading(false);
      }
    }
    fetchExperiments();
  }, [authChecked, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  const filtered = statusFilter === "all"
    ? experiments
    : experiments.filter(e => e.status === statusFilter);

  // Group by program, preserve insertion order of first appearance
  const programOrder: string[] = [];
  const byProgram: Record<string, Experiment[]> = {};
  for (const exp of filtered) {
    const p = getProgram(exp);
    if (!byProgram[p]) { byProgram[p] = []; programOrder.push(p); }
    byProgram[p].push(exp);
  }
  // Sort within each program by status priority
  for (const p of programOrder) {
    byProgram[p].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex justify-between items-start mb-10">
        <div>
          <span className="section-label">01 — Dashboard</span>
          <h1 className="text-4xl font-display text-surface-900">My Experiments</h1>
        </div>
        <Link href="/experiments/new" className="btn-primary">
          New Experiment
        </Link>
      </div>

      {/* Status filter */}
      <div className="mb-8 flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-4 py-2 text-sm font-mono uppercase tracking-wide transition-all ${
              statusFilter === f.value
                ? "bg-accent text-white"
                : "bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="alert-error mb-8">{error}</div>}

      {filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <p className="text-surface-400 mb-4">No experiments match this filter.</p>
          <button
            onClick={() => setStatusFilter("all")}
            className="text-accent text-sm hover:underline"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {programOrder.map((program) => {
            const exps = byProgram[program];
            const area = getTherapeuticArea(exps[0]);
            return (
              <section key={program}>
                <ProgramHeader name={program} area={area} experiments={exps} />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {exps.map((exp) => (
                    <ExperimentCard key={exp.id} experiment={exp} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
