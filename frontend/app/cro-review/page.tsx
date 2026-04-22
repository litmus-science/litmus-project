"use client";

import { useState } from "react";

// ── Static mock data ──────────────────────────────────────────────────────────

const PROTOCOL = {
  id: "EXP-2847",
  title: "HDAC6 Selective Inhibition IC₅₀ Profiling",
  submitted: "Apr 19, 2026",
  program: "LIT-2847 · Neurodegeneration",
  target: "HDAC6 (Histone Deacetylase 6)",
  assayType: "Enzyme Inhibition IC₅₀",
  objective:
    "Determine the IC₅₀ of compound LIT-2847-03 against recombinant HDAC6 using a fluorescence-based deacetylase activity assay. Selectivity profiling against HDAC1, HDAC3, and HDAC8 isoforms required.",
  enzymePanel: [
    { name: "HDAC6 (primary)", role: "Target", source: "Recombinant human, BPS Bioscience" },
    { name: "HDAC1", role: "Selectivity control", source: "Recombinant human, BPS Bioscience" },
    { name: "HDAC3 / NCoR2", role: "Selectivity control", source: "Recombinant human, BPS Bioscience" },
    { name: "HDAC8", role: "Selectivity control", source: "Recombinant human, BPS Bioscience" },
  ],
  assayDetails: {
    format: "384-well black polystyrene, non-binding",
    substrate: "Boc-Lys(Ac)-AMC fluorogenic peptide",
    detection: "Fluorescence (ex 355 nm / em 460 nm)",
    concentrationPoints: "10-point, 3-fold serial dilution",
    topConcentration: "100 µM",
    replicates: "2 technical replicates per concentration",
    incubation: "60 min at 37 °C, protected from light",
  },
  controls: [
    { name: "Tubastatin A", role: "HDAC6 positive control", concentration: "1 µM" },
    { name: "Vorinostat (SAHA)", role: "Pan-HDAC positive control", concentration: "1 µM" },
    { name: "DMSO vehicle", role: "Vehicle / negative control", concentration: "0.1% (v/v) final" },
    { name: "No-enzyme blank", role: "Background subtraction", concentration: "—" },
  ],
  deliverables: ["Raw fluorescence data (.xlsx)", "IC₅₀ curves (PDF)", "Selectivity ratio table", "QC summary report"],
  budget: 1800,
  turnaround: "3 weeks",
  bsl: "BSL1",
  privacy: "Confidential",
};

const FEASIBILITY = {
  assaySupport: { status: "pass" as const, label: "HDAC6 inhibition assay", note: "Standard panel — validated SOP available" },
  isoformCoverage: { status: "pass" as const, label: "All 4 isoforms in-house", note: "HDAC1, HDAC3, HDAC6, HDAC8 enzyme stocks confirmed" },
  reagentAvailability: [
    { item: "HDAC6 enzyme (BPS #50009)", status: "pass" as const, note: "In stock, lot expiry Dec 2026" },
    { item: "HDAC1 enzyme (BPS #50051)", status: "pass" as const, note: "In stock" },
    { item: "HDAC3/NCoR2 (BPS #50003)", status: "warn" as const, note: "Low stock — need to reorder; 7-day lead time" },
    { item: "Boc-Lys(Ac)-AMC substrate", status: "pass" as const, note: "Sufficient quantity on hand" },
    { item: "Tubastatin A reference std.", status: "warn" as const, note: "Need to source — ~5 day lead time" },
  ],
  timeline: {
    labSetup: "2 days",
    assayExecution: "3 days",
    dataAnalysis: "4 days",
    reportWriting: "3 days",
    totalCalendar: "12 business days (2.5 weeks)",
    startAvailable: "Apr 28, 2026",
    deliveryEstimate: "May 14, 2026",
  },
  cost: {
    enzymes: 620,
    reagentsConsumables: 340,
    labourHours: 580,
    instrumentTime: 180,
    qcReport: 120,
    subtotal: 1840,
    inBudget: false,
    delta: 40,
  },
  notes: "Timeline is within requested 3-week window. Cost slightly over budget ($1,840 vs $1,800 requested). Suggest approving with minor budget flex or removing HDAC3/NCoR2 from selectivity panel to reduce reagent cost by ~$120.",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-3">
      {children}
    </p>
  );
}

function StatusPip({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 text-xs font-medium px-2 py-0.5 rounded-full">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Pass
      </span>
    );
  if (status === "warn")
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 text-xs font-medium px-2 py-0.5 rounded-full">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        Caution
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 border border-red-200 text-xs font-medium px-2 py-0.5 rounded-full">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
      Issue
    </span>
  );
}

type ActionState = "idle" | "approved" | "changes" | "rejected" | "clarify";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CroReviewPage() {
  const [action, setAction] = useState<ActionState>("idle");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!note.trim() && action !== "approved") return;
    setSubmitted(true);
  }

  const actionMeta: Record<
    Exclude<ActionState, "idle">,
    { label: string; color: string; placeholder: string; icon: string }
  > = {
    approved: {
      label: "Approve as-is",
      color: "text-emerald-700",
      placeholder: "Optional note to researcher (e.g. confirm kickoff date)…",
      icon: "✅",
    },
    changes: {
      label: "Propose changes",
      color: "text-accent",
      placeholder: "Describe proposed changes (e.g. remove HDAC3/NCoR2 to reduce cost by $120)…",
      icon: "✏️",
    },
    rejected: {
      label: "Reject",
      color: "text-red-700",
      placeholder: "Reason for rejection…",
      icon: "❌",
    },
    clarify: {
      label: "Request clarification",
      color: "text-amber-700",
      placeholder: "What do you need clarified before proceeding?…",
      icon: "🔁",
    },
  };

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-surface-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-surface-400 uppercase tracking-widest">
            CRO Review Portal
          </span>
          <span className="w-px h-4 bg-surface-200" />
          <span className="text-sm font-semibold text-surface-900">{PROTOCOL.id}</span>
          <span className="text-xs text-surface-400">{PROTOCOL.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-surface-400">Submitted {PROTOCOL.submitted}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-surface-600 bg-surface-100 border border-surface-200 px-2 py-0.5 rounded-full">
            🔒 {PROTOCOL.privacy}
          </span>
          <span className="inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Pending Review
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-[1400px] mx-auto px-6 py-8 grid grid-cols-[1fr_420px] gap-6 items-start">

        {/* ── LEFT: Protocol ──────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Header card */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-surface-100 bg-gradient-to-r from-accent-50/60 to-white">
              <p className="text-[10px] font-medium uppercase tracking-widest text-accent mb-1">
                {PROTOCOL.program}
              </p>
              <h1 className="text-lg font-semibold text-surface-900 leading-snug mb-1">
                {PROTOCOL.title}
              </h1>
              <div className="flex flex-wrap gap-3 mt-2.5">
                {[
                  { label: "Assay", value: PROTOCOL.assayType },
                  { label: "Target", value: PROTOCOL.target },
                  { label: "Budget", value: `$${PROTOCOL.budget.toLocaleString()}` },
                  { label: "Turnaround", value: PROTOCOL.turnaround },
                  { label: "BSL", value: PROTOCOL.bsl },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-baseline gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-surface-400">{label}</span>
                    <span className="text-xs font-medium text-surface-700">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4">
              <SectionLabel>Objective</SectionLabel>
              <p className="text-sm text-surface-700 leading-relaxed">{PROTOCOL.objective}</p>
            </div>
          </div>

          {/* Enzyme panel */}
          <div className="card p-0">
            <div className="px-6 pt-5 pb-3 border-b border-surface-100">
              <SectionLabel>Enzyme Panel</SectionLabel>
              <div className="text-sm text-surface-500">4 isoforms · fluorescence-based deacetylase assay</div>
            </div>
            <div className="divide-y divide-surface-100">
              {PROTOCOL.enzymePanel.map((e) => (
                <div key={e.name} className="px-6 py-3 flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-accent/40 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-surface-800">{e.name}</span>
                  </div>
                  <span className="text-xs text-surface-500 bg-surface-50 border border-surface-100 px-2 py-0.5 rounded-full">
                    {e.role}
                  </span>
                  <span className="text-xs text-surface-400 hidden lg:block">{e.source}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Assay details */}
          <div className="card p-0">
            <div className="px-6 pt-5 pb-3 border-b border-surface-100">
              <SectionLabel>Assay Configuration</SectionLabel>
            </div>
            <div className="px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-3">
              {Object.entries(PROTOCOL.assayDetails).map(([k, v]) => {
                const labels: Record<string, string> = {
                  format: "Plate format",
                  substrate: "Substrate",
                  detection: "Detection",
                  concentrationPoints: "Concentration points",
                  topConcentration: "Top concentration",
                  replicates: "Replicates",
                  incubation: "Incubation",
                };
                return (
                  <div key={k} className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-surface-400">{labels[k] ?? k}</span>
                    <span className="text-sm text-surface-700">{v}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Controls */}
          <div className="card p-0">
            <div className="px-6 pt-5 pb-3 border-b border-surface-100">
              <SectionLabel>Controls</SectionLabel>
            </div>
            <div className="divide-y divide-surface-100">
              {PROTOCOL.controls.map((c) => (
                <div key={c.name} className="px-6 py-3 grid grid-cols-[1fr_1.5fr_auto] gap-4 items-center">
                  <span className="text-sm font-medium text-surface-800">{c.name}</span>
                  <span className="text-xs text-surface-500">{c.role}</span>
                  <span className="text-xs font-mono text-surface-600 bg-surface-50 border border-surface-100 px-2 py-0.5 rounded">
                    {c.concentration}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Deliverables */}
          <div className="card px-6 py-5">
            <SectionLabel>Deliverables</SectionLabel>
            <ul className="space-y-1.5">
              {PROTOCOL.deliverables.map((d) => (
                <li key={d} className="flex items-center gap-2 text-sm text-surface-700">
                  <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── RIGHT: Feasibility + Actions ────────────────────────── */}
        <div className="space-y-4 sticky top-[61px]">

          {/* Feasibility header */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-surface-100">
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400">
                Feasibility Assessment
              </p>
            </div>

            {/* Assay support */}
            <div className="px-5 py-4 border-b border-surface-100">
              <div className="flex items-start justify-between gap-3 mb-1">
                <span className="text-sm font-medium text-surface-800">{FEASIBILITY.assaySupport.label}</span>
                <StatusPip status={FEASIBILITY.assaySupport.status} />
              </div>
              <p className="text-xs text-surface-500">{FEASIBILITY.assaySupport.note}</p>
            </div>

            {/* Isoform coverage */}
            <div className="px-5 py-4 border-b border-surface-100">
              <div className="flex items-start justify-between gap-3 mb-1">
                <span className="text-sm font-medium text-surface-800">{FEASIBILITY.isoformCoverage.label}</span>
                <StatusPip status={FEASIBILITY.isoformCoverage.status} />
              </div>
              <p className="text-xs text-surface-500">{FEASIBILITY.isoformCoverage.note}</p>
            </div>

            {/* Reagent availability */}
            <div className="px-5 py-4 border-b border-surface-100">
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-3">
                Reagent Availability
              </p>
              <div className="space-y-2.5">
                {FEASIBILITY.reagentAvailability.map((r) => (
                  <div key={r.item} className="flex items-start gap-2">
                    {r.status === "pass" ? (
                      <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                    )}
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-surface-700 block">{r.item}</span>
                      <span className={`text-[11px] ${r.status === "warn" ? "text-amber-600" : "text-surface-400"}`}>
                        {r.note}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="px-5 py-4 border-b border-surface-100">
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-3">
                Timeline Estimate
              </p>
              <div className="space-y-1.5">
                {[
                  ["Lab setup", FEASIBILITY.timeline.labSetup],
                  ["Assay execution", FEASIBILITY.timeline.assayExecution],
                  ["Data analysis", FEASIBILITY.timeline.dataAnalysis],
                  ["Report writing", FEASIBILITY.timeline.reportWriting],
                ].map(([phase, dur]) => (
                  <div key={phase} className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">{phase}</span>
                    <span className="text-xs font-medium text-surface-700">{dur}</span>
                  </div>
                ))}
                <div className="mt-2 pt-2 border-t border-surface-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-surface-700">Total</span>
                  <span className="text-xs font-semibold text-accent">{FEASIBILITY.timeline.totalCalendar}</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="bg-surface-50 border border-surface-100 rounded px-2.5 py-2">
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-0.5">Earliest start</p>
                  <p className="text-xs font-medium text-surface-700">{FEASIBILITY.timeline.startAvailable}</p>
                </div>
                <div className="bg-surface-50 border border-surface-100 rounded px-2.5 py-2">
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-0.5">Est. delivery</p>
                  <p className="text-xs font-medium text-surface-700">{FEASIBILITY.timeline.deliveryEstimate}</p>
                </div>
              </div>
            </div>

            {/* Cost */}
            <div className="px-5 py-4 border-b border-surface-100">
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-3">
                Cost Estimate
              </p>
              <div className="space-y-1.5">
                {[
                  ["Enzymes & biologics", FEASIBILITY.cost.enzymes],
                  ["Reagents & consumables", FEASIBILITY.cost.reagentsConsumables],
                  ["Labour (est. hours)", FEASIBILITY.cost.labourHours],
                  ["Instrument time", FEASIBILITY.cost.instrumentTime],
                  ["QC & reporting", FEASIBILITY.cost.qcReport],
                ].map(([item, cost]) => (
                  <div key={item as string} className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">{item as string}</span>
                    <span className="text-xs font-medium text-surface-700">${(cost as number).toLocaleString()}</span>
                  </div>
                ))}
                <div className="mt-2 pt-2 border-t border-surface-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-surface-700">CRO estimate</span>
                  <span className="text-xs font-semibold text-surface-900">${FEASIBILITY.cost.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-surface-400">Sponsor budget</span>
                  <span className="text-xs text-surface-500">${PROTOCOL.budget.toLocaleString()}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span className="text-xs text-amber-700">
                  +${FEASIBILITY.cost.delta} over budget · minor flex required
                </span>
              </div>
            </div>

            {/* CRO notes */}
            <div className="px-5 py-4">
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-2">
                Reviewer Notes
              </p>
              <p className="text-xs text-surface-600 leading-relaxed">{FEASIBILITY.notes}</p>
            </div>
          </div>

          {/* ── Action panel ── */}
          {!submitted ? (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-surface-100">
                <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400">
                  CRO Decision
                </p>
              </div>

              {/* Action buttons */}
              <div className="px-5 py-4 grid grid-cols-2 gap-2">
                {(
                  [
                    { key: "approved" as const, label: "Approve as-is", icon: "✅", base: "border-emerald-200 text-emerald-700 hover:bg-emerald-50", active: "bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300" },
                    { key: "changes" as const, label: "Propose changes", icon: "✏️", base: "border-surface-200 text-surface-700 hover:bg-surface-50", active: "bg-accent/5 border-accent ring-1 ring-accent/40" },
                    { key: "rejected" as const, label: "Reject", icon: "❌", base: "border-red-100 text-red-600 hover:bg-red-50", active: "bg-red-50 border-red-400 ring-1 ring-red-300" },
                    { key: "clarify" as const, label: "Request clarification", icon: "🔁", base: "border-amber-100 text-amber-700 hover:bg-amber-50", active: "bg-amber-50 border-amber-400 ring-1 ring-amber-300" },
                  ] as const
                ).map((btn) => (
                  <button
                    key={btn.key}
                    onClick={() => setAction((a) => (a === btn.key ? "idle" : btn.key))}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                      action === btn.key ? btn.active : btn.base
                    }`}
                  >
                    <span>{btn.icon}</span>
                    <span>{btn.label}</span>
                  </button>
                ))}
              </div>

              {/* Note textarea */}
              {action !== "idle" && (
                <div className="px-5 pb-4 space-y-3">
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-1.5">
                      {actionMeta[action].icon} {actionMeta[action].label} — Note
                      {action !== "approved" && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={actionMeta[action].placeholder}
                      className="w-full text-xs text-surface-800 placeholder:text-surface-400 border border-surface-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                    />
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={action !== "approved" && !note.trim()}
                    className="w-full btn text-xs py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Submit decision
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Submitted confirmation */
            <div className="card px-5 py-6 text-center">
              <div className="text-3xl mb-3">{actionMeta[action as Exclude<ActionState, "idle">].icon}</div>
              <p className="text-sm font-semibold text-surface-900 mb-1">
                Decision submitted
              </p>
              <p className={`text-xs font-medium ${actionMeta[action as Exclude<ActionState, "idle">].color} mb-3`}>
                {actionMeta[action as Exclude<ActionState, "idle">].label}
              </p>
              {note && (
                <p className="text-xs text-surface-500 bg-surface-50 border border-surface-100 rounded-lg px-3 py-2 text-left leading-relaxed">
                  {note}
                </p>
              )}
              <p className="text-[11px] text-surface-400 mt-3">
                Researcher has been notified. EXP-2847 updated.
              </p>
              <button
                onClick={() => { setSubmitted(false); setAction("idle"); setNote(""); }}
                className="btn-ghost text-xs mt-3 px-3 py-1.5"
              >
                Revise decision
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
