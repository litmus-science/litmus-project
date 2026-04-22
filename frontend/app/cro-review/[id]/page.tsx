"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getExperiment, getLabPacket } from "@/lib/api";
import type { Experiment, LabPacket } from "@/lib/types";
import CroReviewCockpit from "../CroReviewCockpit";
import type { StudyContext } from "../CroReviewCockpit";

// ── Fallback example study ────────────────────────────────────────────────────

const FALLBACK: StudyContext = {
  id: "HD-103",
  title: "HDAC6 Selective Inhibitor IC50 Characterization (HD-103)",
  assayType: "Fluorogenic substrate assay (IC₅₀)",
  compound: "HD-103",
  enzymes: ["HDAC1", "HDAC3/NCoR2", "HDAC6 (primary)", "HDAC8"],
  submitted: "Apr 19, 2026",
  privacy: "Confidential",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "string" ? cur : null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function buildStudy(experimentId: string, experiment: Experiment, labPacket: LabPacket | null): StudyContext {
  const spec = (experiment.specification ?? {}) as Record<string, unknown>;

  const title =
    labPacket?.title ??
    getStr(spec, "title") ??
    experimentId;

  const expType = getStr(spec, "experiment_type") ?? "Custom Protocol";

  const assayType = labPacket?.objective
    ? labPacket.objective.slice(0, 80)
    : expType;

  const compound =
    getStr(spec, "enzyme_inhibition", "test_compound") ??
    getStr(spec, "cell_viability", "test_compound") ??
    getStr(spec, "compound") ??
    "—";

  // Try to extract enzyme panel from spec or lab packet test articles
  const rawEnzymes = labPacket?.test_articles?.map((a) => a.id) ?? [];
  const enzymes = rawEnzymes.length > 0
    ? rawEnzymes
    : ["HDAC1", "HDAC3/NCoR2", "HDAC6 (primary)", "HDAC8"];

  const privacyMap: Record<string, string> = {
    open: "Open",
    delayed_6mo: "Private 6mo",
    delayed_12mo: "Private 12mo",
    private: "Confidential",
  };
  const privacy = privacyMap[getStr(spec, "privacy") ?? "private"] ?? "Confidential";

  // Budget & turnaround from spec
  const tb = (spec.turnaround_budget ?? {}) as Record<string, unknown>;
  const budget = typeof tb.budget_max_usd === "number" ? tb.budget_max_usd : undefined;
  const turnaroundDays = typeof tb.desired_turnaround_days === "number" ? tb.desired_turnaround_days : undefined;
  const turnaroundWeeks = turnaroundDays != null ? Math.ceil(turnaroundDays / 7) : undefined;
  const rawBsl = getStr(spec, "compliance", "bsl");
  const bsl = rawBsl === "BSL1" || rawBsl === "BSL2" ? rawBsl : undefined;

  return {
    id: experimentId,
    title,
    assayType,
    compound,
    enzymes,
    submitted: formatDate(experiment.created_at),
    privacy,
    budget,
    turnaroundWeeks,
    bsl,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CroReviewDynamicPage() {
  const params = useParams();
  const experimentId = params.id as string;

  const [study, setStudy] = useState<StudyContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!experimentId) return;
    Promise.allSettled([
      getExperiment(experimentId),
      getLabPacket(experimentId),
    ]).then(([expResult, lpResult]) => {
      if (expResult.status === "rejected") {
        setError("Failed to load experiment.");
        return;
      }
      const experiment = expResult.value;
      const labPacket = lpResult.status === "fulfilled" ? lpResult.value : null;
      setStudy(buildStudy(experimentId, experiment, labPacket));
    }).finally(() => setLoading(false));
  }, [experimentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-50">
        <div className="text-center space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <p className="text-xs text-surface-400">Loading example study instead…</p>
          <CroReviewCockpit study={FALLBACK} />
        </div>
      </div>
    );
  }

  return <CroReviewCockpit study={study ?? FALLBACK} />;
}
