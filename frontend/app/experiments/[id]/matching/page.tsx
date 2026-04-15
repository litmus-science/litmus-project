"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { matchLabs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LabMatch, RoutingResult } from "@/lib/types";
import { formatUsd } from "@/lib/format";

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 85 ? "bg-emerald-500" : pct >= 65 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-36 text-gray-500 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-gray-700 font-medium">{pct}%</span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
        Best Match
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
        #2
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">
      #{rank}
    </span>
  );
}

function LabCard({ match, rank }: { match: LabMatch; rank: number }) {
  const [expanded, setExpanded] = useState(rank === 1);
  const overallPct = Math.round(match.score * 100);
  const ringColor =
    overallPct >= 85
      ? "ring-emerald-400"
      : overallPct >= 70
      ? "ring-amber-300"
      : "ring-gray-200";

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ring-2 ${ringColor}`}
    >
      {/* Header */}
      <div className="px-6 py-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {match.logo_initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{match.lab_name}</h3>
              <RankBadge rank={rank} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{match.location}</p>
          </div>
        </div>

        {/* Overall score ring */}
        <div className="flex flex-col items-center flex-shrink-0">
          <span className="text-2xl font-bold text-gray-900">{overallPct}%</span>
          <span className="text-xs text-gray-400">match score</span>
        </div>
      </div>

      {/* Quick stats */}
      <div className="px-6 pb-4 grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-gray-400">Est. turnaround</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">
            {match.estimated_tat_days ? `${match.estimated_tat_days} days` : "TBD"}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-gray-400">Price range</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">
            {match.pricing_band_usd?.min != null && match.pricing_band_usd?.max != null
              ? `${formatUsd(match.pricing_band_usd.min)}–${formatUsd(match.pricing_band_usd.max)}`
              : "Request quote"}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-gray-400">On-time rate</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">
            {Math.round(match.quality_metrics.on_time_rate * 100)}%
          </p>
        </div>
      </div>

      {/* Flags */}
      {match.flags.length > 0 && (
        <div className="px-6 pb-3 flex flex-wrap gap-2">
          {match.flags.map((flag) => (
            <span
              key={flag}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {flag}
            </span>
          ))}
        </div>
      )}

      {/* Deliverables gaps */}
      {match.deliverables_gaps.length > 0 && (
        <div className="px-6 pb-3 flex flex-wrap gap-2">
          {match.deliverables_gaps.map((gap) => (
            <span
              key={gap}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-50 text-red-600 border border-red-200"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {gap}
            </span>
          ))}
        </div>
      )}

      {/* Expandable details */}
      <div className="border-t border-gray-100">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-6 py-3 text-left text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center justify-between"
        >
          {expanded ? "Hide details" : "Show score breakdown & capabilities"}
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <div className="px-6 pb-5 space-y-5">
            {/* Score breakdown */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                Score breakdown
              </p>
              <div className="space-y-2">
                <ScoreBar value={match.score_breakdown.menu_fit} label="Menu fit (20%)" />
                <ScoreBar value={match.score_breakdown.quality} label="Quality (20%)" />
                <ScoreBar value={match.score_breakdown.cost_fit} label="Cost fit (15%)" />
                <ScoreBar value={match.score_breakdown.turnaround_fit} label="Turnaround (15%)" />
                <ScoreBar value={match.score_breakdown.deliverables_match} label="Deliverables (15%)" />
                <ScoreBar value={match.score_breakdown.spec_completeness} label="Spec completeness (10%)" />
                <ScoreBar value={match.score_breakdown.logistics} label="Logistics (5%)" />
              </div>
            </div>

            {/* Capabilities */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                Capabilities
              </p>
              <div className="flex flex-wrap gap-2">
                {match.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full border border-indigo-100"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            {/* Quality metrics */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                Quality metrics
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Avg rating</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {match.quality_metrics.average_rating.toFixed(1)} / 5.0
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Rerun rate</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {Math.round(match.quality_metrics.rerun_rate * 100)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">On-time rate</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {Math.round(match.quality_metrics.on_time_rate * 100)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Request quote CTA */}
            <button className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
              Request Quote from {match.lab_name}
            </button>
          </div>
        )}
      </div>
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        <p className="text-sm text-gray-500">Matching your experiment to available labs...</p>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error || "No matching data available"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link href="/dashboard" className="text-indigo-600 hover:text-indigo-500">
          Dashboard
        </Link>
        <span className="text-gray-300">/</span>
        <Link
          href={`/experiments/${experimentId}`}
          className="text-indigo-600 hover:text-indigo-500"
        >
          Experiment
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-500">Matched Labs</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lab Matches</h1>
        <p className="text-sm text-gray-500 mt-1">
          {result.all_matches_count} labs matched &middot; scored across 7 weighted factors
        </p>
      </div>

      {/* Scoring legend */}
      <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-xs text-indigo-700 flex flex-wrap gap-4">
        <span className="font-medium">Scoring weights:</span>
        <span>Menu fit 20%</span>
        <span>Quality 20%</span>
        <span>Cost 15%</span>
        <span>Turnaround 15%</span>
        <span>Deliverables 15%</span>
        <span>Spec completeness 10%</span>
        <span>Logistics 5%</span>
      </div>

      {/* Lab cards */}
      <div className="space-y-4">
        {result.top_matches.map((match, i) => (
          <LabCard key={match.lab_id} match={match} rank={i + 1} />
        ))}
      </div>

      {/* Filtered-out section */}
      {Object.keys(result.filtered_out).length > 0 && (
        <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Labs filtered out
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {Object.entries(result.filtered_out).map(([reason, labs]) => (
              <div key={reason} className="px-4 py-3 flex justify-between items-start text-sm">
                <span className="text-gray-500">{reason}</span>
                <span className="text-gray-400 text-xs">{labs.join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-8 flex gap-3">
        <Link
          href={`/experiments/${experimentId}`}
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          &larr; Back to Experiment
        </Link>
        <Link
          href={`/experiments/${experimentId}/lab-packet`}
          className="ml-auto bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-md text-sm font-medium"
        >
          View Lab Packet
        </Link>
      </div>
    </div>
  );
}
