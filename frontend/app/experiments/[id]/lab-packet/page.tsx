"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getExperiment, getLabPacket, startExecution } from "@/lib/api";
import type { Experiment, LabPacket } from "@/lib/types";
import { ExperimentProgressRail } from "@/components/ExperimentProgressRail";

// ── Types ─────────────────────────────────────────────────────────────────────

type DecisionState = "idle" | "approved" | "changes" | "rejected";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "string" ? cur : null;
}

function getNum(obj: Record<string, unknown>, ...keys: string[]): number | null {
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "number" ? cur : null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-semibold uppercase tracking-widest text-surface-400 mb-4">
      {children}
    </h2>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-surface-200 rounded-xl shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function WarningBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
      <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <span className="text-sm text-amber-800">{children}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-surface-50 last:border-0">
      <span className="text-xs text-surface-400 w-40 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-surface-800">{value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const experimentId = params.id as string;

  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [labPacket, setLabPacket] = useState<LabPacket | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedOption, setSelectedOption] = useState<"A" | "B" | "C" | null>("A");
  const [decision, setDecision] = useState<DecisionState>("idle");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      getExperiment(experimentId),
      getLabPacket(experimentId),
    ]).then(([expRes, lpRes]) => {
      if (expRes.status === "fulfilled") setExperiment(expRes.value);
      if (lpRes.status === "fulfilled") setLabPacket(lpRes.value);
      setLoading(false);
    });
  }, [experimentId]);

  async function handleApprove() {
    setSubmitting(true);
    try {
      await startExecution(experimentId).catch(() => {});
      setSubmitted(true);
      setTimeout(() => router.push(`/experiments/${experimentId}/quote`), 1200);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derive display values ──────────────────────────────────────────────────
  const spec = (experiment?.specification ?? {}) as Record<string, unknown>;
  const hyp = (spec.hypothesis ?? {}) as Record<string, unknown>;
  const expType = getStr(spec, "experiment_type") ?? "Custom Protocol";
  const title = labPacket?.title ?? getStr(spec, "title") ?? `${expType.replace(/_/g, " ")} Feasibility Summary`;
  const objective = labPacket?.objective ?? getStr(hyp, "statement") ?? "Characterize the dose-response relationship and determine IC₅₀ values.";
  const budget = getNum(spec, "turnaround_budget", "budget_max_usd");
  const turnaroundDays = getNum(spec, "turnaround_budget", "desired_turnaround_days");
  const bsl = getStr(spec, "compliance", "bsl") ?? "BSL1";

  // Cost mockup — would come from CRO's feasibility in a real system
  const costRows = [
    { label: "Enzymes & biologics", value: 620 },
    { label: "Reagents & consumables", value: 340 },
    { label: "Labour", value: 580 },
    { label: "Instrument time", value: 180 },
    { label: "QC & reporting", value: 120 },
  ];
  const costTotal = costRows.reduce((s, r) => s + r.value, 0);
  const costDelta = budget != null ? costTotal - budget : null;

  if (loading) {
    return (
      <>
        <ExperimentProgressRail experimentId={experimentId} currentStep="lab-packet" />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      </>
    );
  }

  return (
    <>
      <ExperimentProgressRail experimentId={experimentId} currentStep="lab-packet" />

      <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-10 pb-36 space-y-10">

        {/* ── HEADER ── */}
        <div>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-1">
                Feasibility Review
              </p>
              <h1 className="text-2xl font-semibold text-surface-900 leading-snug">{title}</h1>
            </div>
            <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full flex-shrink-0 mt-1">
              Pending Sponsor Approval
            </span>
          </div>
          <div className="flex flex-wrap gap-5 mt-4">
            {[
              { label: "Study ID", value: experimentId.slice(0, 8).toUpperCase() },
              { label: "BSL", value: bsl },
                ...(budget != null ? [{ label: "Budget", value: `$${budget.toLocaleString()}` }] : []),
              ...(turnaroundDays != null ? [{ label: "Requested turnaround", value: `${turnaroundDays} days` }] : []),
              { label: "Assay type", value: expType.replace(/_/g, " ") },
            ].filter(Boolean).map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-surface-400">{label}</span>
                <span className="text-xs font-semibold text-surface-700">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 1: STUDY SUMMARY ── */}
        <section>
          <SectionTitle>1 — Study Summary</SectionTitle>
          <Card>
            <div className="px-6 py-5">
              <Row label="Objective" value={objective} />
              <Row label="Assay type" value={expType.replace(/_/g, " ")} />
              <Row label="Method" value="Fluorogenic substrate assay" />
              <Row label="BSL" value={bsl} />
              {budget != null && <Row label="Sponsor budget" value={`$${budget.toLocaleString()}`} />}
              {turnaroundDays != null && <Row label="Requested turnaround" value={`${turnaroundDays} days`} />}
            </div>
          </Card>
        </section>

        {/* ── SECTION 2: CRO INTERPRETATION ── */}
        <section>
          <SectionTitle>2 — CRO Interpretation</SectionTitle>
          <Card>
            <div className="px-6 py-5 space-y-3">
              {[
                { status: "pass", text: "Assay SOP validated and on file" },
                { status: "pass", text: "Primary enzyme panel confirmed in-house" },
                { status: "warn", text: "HDAC3/NCoR2 enzyme: low stock — 7-day lead time required" },
                { status: "warn", text: "Reference control: external sourcing required (~5 days)" },
                { status: "pass", text: "Assay feasibility confirmed across full panel" },
                { status: "info", text: "Minor scope adjustment may be required for HDAC3 continuity" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  {item.status === "pass" && (
                    <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {item.status === "warn" && (
                    <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  )}
                  {item.status === "info" && (
                    <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
                    </svg>
                  )}
                  <span className="text-sm text-surface-700">{item.text}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* ── SECTION 3: COST & TIMELINE ── */}
        <section>
          <SectionTitle>3 — Cost & Timeline</SectionTitle>
          <div className="grid grid-cols-2 gap-5">
            {/* Timeline */}
            <Card>
              <div className="px-5 pt-4 pb-3 border-b border-surface-100">
                <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400">Timeline</p>
              </div>
              <div className="px-5 py-4 space-y-2">
                {[
                  ["Lab setup", "2 days"],
                  ["Assay execution", "3 days"],
                  ["Data analysis", "4 days"],
                  ["Report writing", "3 days"],
                ].map(([phase, dur]) => (
                  <div key={phase} className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">{phase}</span>
                    <span className="text-xs font-medium text-surface-700">{dur}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-surface-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-surface-800">Total</span>
                  <span className="text-xs font-bold text-accent">12 business days</span>
                </div>
              </div>
              <div className="px-5 pb-4 grid grid-cols-2 gap-2">
                <div className="bg-surface-50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-0.5">Start</p>
                  <p className="text-xs font-semibold text-surface-800">Apr 28, 2026</p>
                </div>
                <div className="bg-surface-50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-0.5">Delivery</p>
                  <p className="text-xs font-semibold text-surface-800">May 14, 2026</p>
                </div>
              </div>
            </Card>

            {/* Cost */}
            <Card>
              <div className="px-5 pt-4 pb-3 border-b border-surface-100">
                <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400">Cost Breakdown</p>
              </div>
              <div className="px-5 py-4 space-y-2">
                {costRows.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">{label}</span>
                    <span className="text-xs font-medium text-surface-700">${value.toLocaleString()}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-surface-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-surface-800">CRO total</span>
                  <span className="text-xs font-bold text-surface-900">${costTotal.toLocaleString()}</span>
                </div>
                {budget != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-400">Sponsor budget</span>
                    <span className="text-xs text-surface-500">${budget.toLocaleString()}</span>
                  </div>
                )}
              </div>
              {costDelta != null && (
                <div className={`mx-5 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${costDelta > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
                  {costDelta > 0
                    ? `⚠ +$${costDelta.toLocaleString()} over budget — minor flex required`
                    : `✓ $${Math.abs(costDelta).toLocaleString()} under budget`}
                </div>
              )}
            </Card>
          </div>
        </section>

        {/* ── SECTION 4: RISKS & CONSTRAINTS ── */}
        <section>
          <SectionTitle>4 — Risks & Constraints</SectionTitle>
          <div className="space-y-3">
            <WarningBadge>HDAC3/NCoR2 low stock may delay assay start by up to 7 days</WarningBadge>
            {costDelta != null && costDelta > 0 && (
              <WarningBadge>Slight budget overrun (${costDelta.toLocaleString()}) — sponsor approval for flex required</WarningBadge>
            )}
            <WarningBadge>Multi-target enzyme panel increases QC complexity and reporting time</WarningBadge>
          </div>
        </section>

        {/* ── SECTION 5: RECOMMENDATION OPTIONS ── */}
        <section>
          <SectionTitle>5 — CRO Recommendation Options</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                key: "A" as const,
                tag: "Recommended",
                label: "Approve as-is",
                bullets: ["Minor budget flex required (+$40)", "Fastest start date (Apr 28)", "Full 4-isoform selectivity dataset"],
                color: "border-accent/30 bg-accent/5",
                tagColor: "bg-accent/10 text-accent",
                selectedColor: "border-accent ring-2 ring-accent/30",
              },
              {
                key: "B" as const,
                tag: "Cost saving",
                label: "Remove HDAC3",
                bullets: ["Reduces cost ~$120", "Eliminates lead-time risk", "Weaker selectivity dataset"],
                color: "border-surface-200 bg-white",
                tagColor: "bg-surface-100 text-surface-500",
                selectedColor: "border-surface-400 ring-2 ring-surface-300",
              },
              {
                key: "C" as const,
                tag: "Low risk",
                label: "Delay start 5 days",
                bullets: ["Buffer for reagent procurement", "No scope changes", "Delivery shifts to ~May 19"],
                color: "border-surface-200 bg-white",
                tagColor: "bg-surface-100 text-surface-500",
                selectedColor: "border-surface-400 ring-2 ring-surface-300",
              },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setSelectedOption(opt.key)}
                className={`text-left rounded-xl border p-4 transition-all ${selectedOption === opt.key ? opt.selectedColor : opt.color} hover:shadow-sm`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${opt.tagColor}`}>{opt.tag}</span>
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${selectedOption === opt.key ? "border-accent bg-accent" : "border-surface-300"}`} />
                </div>
                <p className="text-sm font-semibold text-surface-900 mb-2">{opt.label}</p>
                <ul className="space-y-1.5">
                  {opt.bullets.map(b => (
                    <li key={b} className="text-xs text-surface-500 flex items-start gap-1.5">
                      <span className="text-surface-300 flex-shrink-0 mt-0.5">•</span>{b}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── STICKY BOTTOM BAR ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-surface-200 px-6 py-4">
        {!submitted ? (
          <div className="max-w-[900px] mx-auto space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDecision(d => d === "approved" ? "idle" : "approved")}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all border ${decision === "approved" ? "bg-emerald-600 border-emerald-600 text-white ring-2 ring-emerald-400 ring-offset-1" : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"}`}
              >
                Approve Study
              </button>
              <button
                onClick={() => setDecision(d => d === "changes" ? "idle" : "changes")}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all border ${decision === "changes" ? "bg-amber-50 border-amber-400 text-amber-700 ring-2 ring-amber-300 ring-offset-1" : "bg-white border-amber-300 text-amber-700 hover:bg-amber-50"}`}
              >
                Request Changes
              </button>
              <button
                onClick={() => setDecision(d => d === "rejected" ? "idle" : "rejected")}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all border ${decision === "rejected" ? "bg-red-50 border-red-400 text-red-700 ring-2 ring-red-300 ring-offset-1" : "bg-white border-red-200 text-red-600 hover:bg-red-50"}`}
              >
                Reject Study
              </button>
              {selectedOption && (
                <span className="ml-auto text-xs text-surface-400">
                  Option <strong className="text-surface-700">{selectedOption}</strong> selected
                </span>
              )}
            </div>
            {decision !== "idle" && (
              <div className="flex items-start gap-3">
                <textarea
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={
                    decision === "approved" ? "Optional note to CRO (e.g. confirm kickoff date)…" :
                    decision === "changes" ? "Describe requested changes…" :
                    "Reason for rejection…"
                  }
                  className="flex-1 text-sm text-surface-800 placeholder:text-surface-400 border border-surface-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
                <button
                  onClick={decision === "approved" ? handleApprove : () => setSubmitted(true)}
                  disabled={submitting || (decision !== "approved" && !note.trim())}
                  className="btn text-sm py-2.5 px-6 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-[900px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-surface-900">
                {decision === "approved" ? "Study approved — moving to execution" : "Decision submitted"}
              </p>
            </div>
            <button onClick={() => { setSubmitted(false); setDecision("idle"); setNote(""); }} className="btn-ghost text-xs px-3 py-1.5">
              Revise
            </button>
          </div>
        )}
      </div>
    </>
  );
}
