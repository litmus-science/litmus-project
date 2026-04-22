"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { matchLabs, submitForQuote, finalizeDesign } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LabMatch, RoutingResult } from "@/lib/types";
import { ExperimentProgressRail } from "@/components/ExperimentProgressRail";

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? "bg-emerald-500" : pct >= 65 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-surface-400 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 bg-surface-100 rounded-full h-1">
        <div className={`${color} h-1 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 text-right text-surface-600 font-mono text-[10px]">{pct}%</span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Best</span>;
  if (rank === 2)
    return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-100 text-surface-600">#2</span>;
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-100 text-surface-500">#{rank}</span>;
}

function LabCard({ match, rank, onSubmit, submitting }: { match: LabMatch; rank: number; onSubmit: () => void; submitting: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(match.score * 100);
  const scoreColor = pct >= 85 ? "text-emerald-600" : pct >= 70 ? "text-amber-600" : "text-surface-500";

  return (
    <div className="bg-white border border-surface-200 rounded-lg flex flex-col">
      {/* Card header */}
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {match.logo_initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm font-semibold text-surface-900 leading-tight">{match.lab_name}</h3>
                <RankBadge rank={rank} />
              </div>
              <p className="text-[10px] text-surface-400 mt-0.5 truncate">{match.location}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-lg font-bold ${scoreColor}`}>{pct}%</p>
            <p className="text-[10px] text-surface-400">match</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-surface-50 rounded px-2 py-1.5 text-center">
            <p className="text-[10px] text-surface-400">TAT</p>
            <p className="text-xs font-semibold text-surface-800 mt-0.5">
              {match.estimated_tat_days ? `${match.estimated_tat_days}d` : "TBD"}
            </p>
          </div>
          <div className="bg-surface-50 rounded px-2 py-1.5 text-center">
            <p className="text-[10px] text-surface-400">On-time</p>
            <p className="text-xs font-semibold text-surface-800 mt-0.5">
              {Math.round(match.quality_metrics.on_time_rate * 100)}%
            </p>
          </div>
        </div>

        {/* Flags */}
        {match.flags.length > 0 && (
          <div className="mt-2 space-y-1">
            {match.flags.map((f) => (
              <p key={f} className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">{f}</p>
            ))}
          </div>
        )}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="mx-4 mb-3 text-[10px] text-accent hover:text-accent-dim font-medium flex items-center gap-1 transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {expanded ? "Hide details" : "Show details"}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-surface-100 px-4 py-4 space-y-4">
          {/* Score breakdown */}
          <div>
            <p className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">Score breakdown</p>
            <div className="space-y-1.5">
              <ScoreBar value={match.score_breakdown.menu_fit} label="Menu fit" />
              <ScoreBar value={match.score_breakdown.quality} label="Quality" />
              <ScoreBar value={match.score_breakdown.cost_fit} label="Cost fit" />
              <ScoreBar value={match.score_breakdown.turnaround_fit} label="Turnaround" />
              <ScoreBar value={match.score_breakdown.deliverables_match} label="Deliverables" />
              <ScoreBar value={match.score_breakdown.logistics} label="Logistics" />
            </div>
          </div>

          {/* Quality metrics */}
          <div>
            <p className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">Quality metrics</p>
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <p className="text-[10px] text-surface-400">Rating</p>
                <p className="text-xs font-semibold text-surface-800">{match.quality_metrics.average_rating.toFixed(1)}/5</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-400">Rerun</p>
                <p className="text-xs font-semibold text-surface-800">{Math.round(match.quality_metrics.rerun_rate * 100)}%</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-400">On-time</p>
                <p className="text-xs font-semibold text-surface-800">{Math.round(match.quality_metrics.on_time_rate * 100)}%</p>
              </div>
            </div>
          </div>

          {/* Capabilities */}
          <div>
            <p className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">Capabilities</p>
            <div className="flex flex-wrap gap-1">
              {match.capabilities.map((cap) => (
                <span key={cap} className="px-2 py-0.5 bg-accent/5 text-accent text-[10px] rounded-full border border-accent/20">
                  {cap}
                </span>
              ))}
            </div>
          </div>

          {/* Deliverable gaps */}
          {match.deliverables_gaps.length > 0 && (
            <div>
              {match.deliverables_gaps.map((gap) => (
                <p key={gap} className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1">{gap}</p>
              ))}
            </div>
          )}

          <button
            onClick={onSubmit}
            disabled={submitting}
            className="w-full py-2 bg-accent hover:bg-accent-dim text-white text-xs font-medium rounded-md transition-colors disabled:opacity-60"
          >
            {submitting ? "Submitting…" : `Submit for Quote — ${match.lab_name}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default function LabMatchingPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const [result, setResult] = useState<RoutingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submittingLabId, setSubmittingLabId] = useState<string | null>(null);

  const experimentId = params.id as string;

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function fetchMatches() {
      try {
        const data = await matchLabs(experimentId);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lab matches");
      } finally {
        setLoading(false);
      }
    }

    fetchMatches();
  }, [authChecked, isAuthenticated, router, experimentId]);

  const handleSubmit = async (labId: string) => {
    setSubmittingLabId(labId);
    try {
      await submitForQuote(experimentId);
      await finalizeDesign(experimentId);
      window.open(`/cro-review/${experimentId}`, "_blank");
      router.push(`/experiments/${experimentId}/quote`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit for quote");
      setSubmittingLabId(null);
    }
  };

  if (loading) {
    return (
      <>
        <ExperimentProgressRail experimentId={experimentId} currentStep="matching" />
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
          <p className="text-sm text-surface-500">Matching to available labs...</p>
        </div>
      </>
    );
  }

  if (error || !result) {
    return (
      <>
        <ExperimentProgressRail experimentId={experimentId} currentStep="matching" />
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="alert-error">{error || "No matching data available"}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <ExperimentProgressRail experimentId={experimentId} currentStep="matching" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-surface-900">Lab Matches</h1>
          <p className="text-sm text-surface-500 mt-1">
            {result.all_matches_count} labs matched for{" "}
            <span className="font-mono text-surface-700">{result.experiment_type}</span>
            {" "}· scored on capabilities, cost, and turnaround
          </p>
        </div>

        {/* 3-column grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {result.top_matches.map((match, i) => (
            <LabCard
              key={match.lab_id}
              match={match}
              rank={i + 1}
              onSubmit={() => handleSubmit(match.lab_id)}
              submitting={submittingLabId === match.lab_id}
            />
          ))}
        </div>

        {/* Filtered out */}
        {Object.keys(result.filtered_out).length > 0 && (
          <div className="mt-6 border border-surface-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 bg-surface-50 border-b border-surface-200">
              <p className="text-[10px] tracking-widest-plus uppercase text-surface-400 font-medium">
                Labs not matched
              </p>
            </div>
            <div className="divide-y divide-surface-100">
              {Object.entries(result.filtered_out).map(([reason, labs]) => (
                <div key={reason} className="px-4 py-3 flex justify-between items-start text-sm">
                  <span className="text-surface-500 text-xs">{reason}</span>
                  <span className="text-surface-400 text-xs text-right ml-4">{(labs as string[]).join(", ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
