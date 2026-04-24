"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { startExecution } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StudyContext {
  id: string;
  title: string;
  assayType: string;
  compound: string;
  enzymes: string[];
  submitted: string;
  privacy: string;
  budget?: number;
  turnaroundWeeks?: number;
  bsl?: "BSL1" | "BSL2";
}

interface Capabilities {
  hdac6SopValidated: boolean;
  hdac1InStock: boolean;
  hdac3LowStock: boolean;
  hdac3LeadTimeDays: number;
  hdac8InStock: boolean;
  substrateAvailability: "sufficient" | "low" | "unavailable";
}

interface Constraints {
  budget: number;
  turnaroundWeeks: number;
  bsl: "BSL1" | "BSL2";
  requiredControls: string;
}

interface StructuredAssumptions {
  // Assay Constraints
  panelComplexity: "simple" | "standard" | "complex";
  assayTypes: { enzymatic: boolean; cellBased: boolean; binding: boolean };
  // Reagent Constraints
  enzymeAvailability: "in_stock" | "low" | "unavailable";
  leadTimeSensitivity: "none" | "moderate" | "high";
  // Execution Constraints
  throughputLoad: "low" | "medium" | "high";
  instrumentAvailability: "available" | "limited";
  // Commercial Constraints
  budgetFlex: boolean;
  billingModel: "milestone" | "upfront" | "hybrid";
  // Overrides
  laborRateMultiplier: number;
  qcOverheadPct: number;
  reagentWastageFactor: number;
  bufferTimeDays: number;
  // Notes
  additionalNotes: string;
}

type ActionState = "idle" | "approved" | "changes" | "rejected" | "clarify";

// ── Activity log types ────────────────────────────────────────────────────────

type NoteKind = "note" | "call" | "email" | "agreement" | "file";

interface LogEntry {
  id: number;
  kind: NoteKind;
  content: string;
  url: string;
  author: string;
  timestamp: string;
}

const KIND_META: Record<NoteKind, { label: string; color: string; icon: React.ReactNode }> = {
  note:      { label: "Note",      color: "bg-surface-100 text-surface-600",   icon: "📝" },
  call:      { label: "Call",      color: "bg-blue-50 text-blue-600",          icon: "📞" },
  email:     { label: "Email",     color: "bg-violet-50 text-violet-600",      icon: "📧" },
  agreement: { label: "Agreement", color: "bg-emerald-50 text-emerald-700",    icon: "✅" },
  file:      { label: "File",      color: "bg-amber-50 text-amber-700",        icon: "📎" },
};

const KIND_OPTIONS: { value: NoteKind; label: string }[] = [
  { value: "note",      label: "📝 Note" },
  { value: "call",      label: "📞 Call" },
  { value: "email",     label: "📧 Email" },
  { value: "agreement", label: "✅ Agreement" },
  { value: "file",      label: "📎 File" },
];

function formatTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Mock computation ──────────────────────────────────────────────────────────

function computeFeasibility(caps: Capabilities, constraints: Constraints, assumptions: StructuredAssumptions) {
  // Base costs
  let enzymes = 620;
  let reagents = 340;
  let labor = 580;
  let instrument = 180;
  let qc = 120;

  // Caps adjustments
  if (caps.hdac3LowStock) enzymes += 40;
  if (caps.substrateAvailability === "low") reagents += 60;
  if (caps.substrateAvailability === "unavailable") reagents += 180;

  // Panel complexity multiplier
  const complexityMult = { simple: 0.85, standard: 1.0, complex: 1.2 }[assumptions.panelComplexity];
  enzymes = Math.round(enzymes * complexityMult);

  // Cell-based assay premium
  if (assumptions.assayTypes.cellBased) { reagents += 150; labor += 80; }

  // Enzyme availability assumption
  if (assumptions.enzymeAvailability === "low") reagents += 50;
  if (assumptions.enzymeAvailability === "unavailable") reagents += 160;

  // Throughput load
  if (assumptions.throughputLoad === "medium") instrument += 80;
  if (assumptions.throughputLoad === "high") { instrument += 200; }

  // Override multipliers
  labor = Math.round(labor * assumptions.laborRateMultiplier);
  reagents = Math.round(reagents * assumptions.reagentWastageFactor);
  qc = Math.round(qc * (1 + assumptions.qcOverheadPct / 100));

  const total = enzymes + reagents + labor + instrument + qc;
  const delta = total - constraints.budget;

  // Timeline
  let setup = 2;
  if (caps.hdac3LowStock && caps.hdac3LeadTimeDays > 0) {
    setup += Math.ceil(caps.hdac3LeadTimeDays / 5);
  }
  if (caps.substrateAvailability === "low") setup += 1;
  if (caps.substrateAvailability === "unavailable") setup += 3;
  if (assumptions.enzymeAvailability === "low") setup += 1;
  if (assumptions.enzymeAvailability === "unavailable") setup += 3;
  if (assumptions.leadTimeSensitivity === "moderate") setup += 1;
  if (assumptions.leadTimeSensitivity === "high") setup += 3;
  if (assumptions.instrumentAvailability === "limited") setup += 2;
  if (assumptions.throughputLoad === "high") setup += 2;
  setup += assumptions.bufferTimeDays;

  const execution = 3;
  const analysis = 4;
  const reporting = 3;
  const totalDays = setup + execution + analysis + reporting;
  const totalWeeks = Math.ceil(totalDays / 5);

  // Start / delivery (anchor: Apr 28 2026)
  const startMs = new Date("2026-04-28").getTime();
  const deliveryMs = startMs + totalDays * 24 * 60 * 60 * 1000;
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Risk flags
  const risks: Array<{ level: "warn" | "error"; message: string }> = [];
  if (caps.hdac3LowStock && caps.hdac3LeadTimeDays > 0)
    risks.push({ level: "warn", message: `HDAC3/NCoR2 low stock — ${caps.hdac3LeadTimeDays}-day lead time adds schedule risk` });
  if (delta > 0 && !assumptions.budgetFlex)
    risks.push({ level: "warn", message: `CRO estimate $${total.toLocaleString()} exceeds sponsor budget by $${delta.toLocaleString()} (no flex)` });
  if (delta > 0 && assumptions.budgetFlex)
    risks.push({ level: "warn", message: `CRO estimate $${total.toLocaleString()} is +$${delta.toLocaleString()} over budget — flex approved` });
  if (caps.substrateAvailability === "low")
    risks.push({ level: "warn", message: "Substrate supply is low — potential 1-day setup delay" });
  if (caps.substrateAvailability === "unavailable")
    risks.push({ level: "error", message: "Substrate unavailable — 3+ day procurement delay, feasibility at risk" });
  if (!caps.hdac6SopValidated)
    risks.push({ level: "error", message: "HDAC6 SOP not validated — cannot proceed without validation step" });
  if (totalWeeks > constraints.turnaroundWeeks)
    risks.push({ level: "warn", message: `Estimated ${totalWeeks}w exceeds ${constraints.turnaroundWeeks}w requested turnaround` });
  if (assumptions.enzymeAvailability === "unavailable")
    risks.push({ level: "error", message: "Assumed enzyme panel unavailable — procurement required before start" });
  else if (assumptions.enzymeAvailability === "low")
    risks.push({ level: "warn", message: "Enzyme panel availability is low — adds 1-day setup buffer" });
  if (assumptions.instrumentAvailability === "limited")
    risks.push({ level: "warn", message: "Limited instrument slots — adds 2-day scheduling buffer" });
  if (assumptions.throughputLoad === "high")
    risks.push({ level: "warn", message: "High throughput load — elevated instrument cost and 2-day execution buffer" });
  if (assumptions.leadTimeSensitivity === "high")
    risks.push({ level: "warn", message: "High lead-time sensitivity — 3-day schedule buffer applied" });

  // Verdict
  let verdict: "feasible" | "constrained" | "at_risk" | "infeasible" = "feasible";
  const hasError = risks.some((r) => r.level === "error");
  const hardOverBudget = delta > 0 && !assumptions.budgetFlex;
  if (hasError || hardOverBudget) verdict = "infeasible";
  else if (risks.length >= 2) verdict = "at_risk";
  else if (risks.length === 1) verdict = "constrained";

  return {
    cost: { enzymes, reagents, labor, instrument, qc, total, delta },
    timeline: { setup, execution, analysis, reporting, totalDays, totalWeeks, start: fmt(startMs), delivery: fmt(deliveryMs) },
    risks,
    verdict,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-2">
      {children}
    </p>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-surface-200 rounded-xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className="px-5 pt-4 pb-3 border-b border-surface-100">
      <Label>{title}</Label>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  sublabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-9 h-5 rounded-full transition-colors ${checked ? "bg-accent" : "bg-surface-200"}`}
        />
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </div>
      <div>
        <span className="text-sm font-medium text-surface-800 group-hover:text-surface-900 transition-colors">
          {label}
        </span>
        {sublabel && <p className="text-xs text-surface-400 mt-0.5">{sublabel}</p>}
      </div>
    </label>
  );
}

function VerdictBadge({ verdict }: { verdict: ReturnType<typeof computeFeasibility>["verdict"] }) {
  const map = {
    feasible: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", dot: "bg-emerald-500", label: "Feasible" },
    constrained: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", dot: "bg-amber-500", label: "Feasible with minor constraints" },
    at_risk: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", dot: "bg-orange-500", label: "Feasible — at risk" },
    infeasible: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", dot: "bg-red-500", label: "Not feasible as-is" },
  };
  const s = map[verdict];
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.bg} ${s.border}`}>
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot} animate-pulse`} />
      <span className={`text-sm font-semibold ${s.text}`}>{s.label}</span>
    </div>
  );
}

function RiskFlag({ level, message }: { level: "warn" | "error"; message: string }) {
  if (level === "error") {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
        <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span className="text-xs text-red-700">{message}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
      <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <span className="text-xs text-amber-700">{message}</span>
    </div>
  );
}

// ── Main cockpit component ────────────────────────────────────────────────────

export default function CroReviewCockpit({ study }: { study: StudyContext }) {
  // ── Left side state ──────────────────────────────────────────────────────────
  const [caps, setCaps] = useState<Capabilities>({
    hdac6SopValidated: true,
    hdac1InStock: true,
    hdac3LowStock: true,
    hdac3LeadTimeDays: 7,
    hdac8InStock: true,
    substrateAvailability: "sufficient",
  });

  const [constraints, setConstraints] = useState<Constraints>({
    budget: study.budget ?? 1800,
    turnaroundWeeks: study.turnaroundWeeks ?? 3,
    bsl: study.bsl ?? "BSL1",
    requiredControls: "Tubacin",
  });

  const [assumptions, setAssumptions] = useState<StructuredAssumptions>({
    panelComplexity: "standard",
    assayTypes: { enzymatic: true, cellBased: false, binding: false },
    enzymeAvailability: "in_stock",
    leadTimeSensitivity: "none",
    throughputLoad: "medium",
    instrumentAvailability: "available",
    budgetFlex: false,
    billingModel: "milestone",
    laborRateMultiplier: 1.0,
    qcOverheadPct: 0,
    reagentWastageFactor: 1.0,
    bufferTimeDays: 0,
    additionalNotes: "",
  });
  const [overridesOpen, setOverridesOpen] = useState(false);

  // ── Activity log state ───────────────────────────────────────────────────────
  const [logEntries, setLogEntries] = useState<LogEntry[]>([
    { id: 1, kind: "email", content: "Sent lab packet to Arctoris. Included full protocol, enzyme panel requirements, and timeline ask of 3 weeks.", url: "", author: "litmus@litmus.bio", timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 2, kind: "call",  content: "Intro call with Sarah @ Arctoris. They can run HDAC6 + panel but HDAC3/NCoR2 needs reorder (~7 days). Suggested starting Apr 28. Budget is tight — they need $1,840 minimum.", url: "https://loom.com/share/example", author: "arun@litmus.bio", timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
  ]);
  const [logKind, setLogKind]       = useState<NoteKind>("note");
  const [logContent, setLogContent] = useState("");
  const [logUrl, setLogUrl]         = useState("");
  const logBottomRef                = useRef<HTMLDivElement>(null);

  function addLogEntry() {
    if (!logContent.trim()) return;
    setLogEntries((prev) => [...prev, {
      id: Date.now(),
      kind: logKind,
      content: logContent.trim(),
      url: logUrl.trim(),
      author: "you",
      timestamp: new Date().toISOString(),
    }]);
    setLogContent("");
    setLogUrl("");
    setLogKind("note");
    setTimeout(() => logBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  // ── Decision state ───────────────────────────────────────────────────────────
  const [action, setAction] = useState<ActionState>("idle");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const router = useRouter();

  // ── Computed right side ──────────────────────────────────────────────────────
  const feas = useMemo(() => computeFeasibility(caps, constraints, assumptions), [caps, constraints, assumptions]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function setCap<K extends keyof Capabilities>(key: K, val: Capabilities[K]) {
    setCaps((prev) => ({ ...prev, [key]: val }));
  }

  function setConstraint<K extends keyof Constraints>(key: K, val: Constraints[K]) {
    setConstraints((prev) => ({ ...prev, [key]: val }));
  }

  function setAssumption<K extends keyof StructuredAssumptions>(key: K, val: StructuredAssumptions[K]) {
    setAssumptions((prev) => ({ ...prev, [key]: val }));
  }

  const actionMeta = {
    approved: { label: "Approve as-is", color: "text-emerald-700", icon: "✅", placeholder: "Optional note to researcher (e.g. confirm kickoff date)…" },
    changes:  { label: "Propose changes", color: "text-accent", icon: "✏️", placeholder: "Describe proposed changes…" },
    rejected: { label: "Reject", color: "text-red-700", icon: "❌", placeholder: "Reason for rejection…" },
    clarify:  { label: "Request clarification", color: "text-amber-700", icon: "🔁", placeholder: "What do you need clarified?" },
  };

  // ── Recommended options ──────────────────────────────────────────────────────
  const options = [
    {
      key: "A",
      label: "Approve as-is",
      description: `Accept minor budget flex (+$${Math.max(0, feas.cost.delta).toLocaleString()}). Proceed with full 4-isoform panel.`,
      color: "border-emerald-200 bg-emerald-50 text-emerald-800",
      badge: "bg-emerald-100 text-emerald-700",
    },
    {
      key: "B",
      label: "Remove HDAC3",
      description: "Drop HDAC3/NCoR2 from selectivity panel. Reduces enzyme cost ~$120 and eliminates lead-time risk.",
      color: "border-accent/30 bg-accent/5 text-accent",
      badge: "bg-accent/10 text-accent",
    },
    {
      key: "C",
      label: `Delay start ${caps.hdac3LeadTimeDays} days`,
      description: `Buffer for reagent procurement. Delivery shifts to ~${feas.timeline.delivery}. No scope changes.`,
      color: "border-surface-200 bg-surface-50 text-surface-700",
      badge: "bg-surface-100 text-surface-600",
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-surface-50">
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-surface-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-surface-400 uppercase tracking-widest">CRO Review Portal</span>
          <span className="w-px h-4 bg-surface-200" />
          <span className="text-sm font-semibold text-surface-900 font-mono">{study.id}</span>
          <span className="text-xs text-surface-400 truncate max-w-xs hidden md:block">{study.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-surface-400">Submitted {study.submitted}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-surface-600 bg-surface-100 border border-surface-200 px-2 py-0.5 rounded-full">
            🔒 {study.privacy}
          </span>
          <span className="inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Pending Review
          </span>
        </div>
      </div>

      {/* ── Main two-column body ──────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-2 divide-x divide-surface-200 overflow-hidden">

        {/* ════════════ LEFT — CRO REALITY (editable) ════════════ */}
        <div className="overflow-y-auto p-6 space-y-5 pb-32">
          <div>
            <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-widest mb-4">
              CRO Reality — Editable Inputs
            </h2>

            {/* Section 1: Study Context */}
            <Card>
              <CardHeader title="Study Context" />
              <div className="px-5 py-4 space-y-3">
                {[
                  { label: "Study ID", value: study.id },
                  { label: "Assay type", value: study.assayType },
                  { label: "Compound", value: study.compound },
                  { label: "Enzyme panel", value: study.enzymes.join(", ") },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="text-xs text-surface-400 flex-shrink-0 w-28">{label}</span>
                    <span className="text-xs font-medium text-surface-800 text-right">{value}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Section 2: Constraints */}
            <Card className="mt-4">
              <CardHeader title="Constraints" />
              <div className="px-5 py-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-surface-500 block mb-1.5">Sponsor budget ($)</label>
                  <input
                    type="number"
                    value={constraints.budget}
                    onChange={(e) => setConstraint("budget", parseInt(e.target.value) || 0)}
                    className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-surface-500 block mb-1.5">Turnaround request (weeks)</label>
                  <input
                    type="number"
                    min={1}
                    value={constraints.turnaroundWeeks}
                    onChange={(e) => setConstraint("turnaroundWeeks", parseInt(e.target.value) || 1)}
                    className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-surface-500 block mb-1.5">Biosafety level</label>
                  <select
                    value={constraints.bsl}
                    onChange={(e) => setConstraint("bsl", e.target.value as "BSL1" | "BSL2")}
                    className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white"
                  >
                    <option value="BSL1">BSL-1</option>
                    <option value="BSL2">BSL-2</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-surface-500 block mb-1.5">Required controls</label>
                  <input
                    type="text"
                    value={constraints.requiredControls}
                    onChange={(e) => setConstraint("requiredControls", e.target.value)}
                    className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                    placeholder="e.g. Tubacin, SAHA"
                  />
                </div>
              </div>
            </Card>

            {/* Section 3: CRO Capabilities */}
            <Card className="mt-4">
              <CardHeader title="CRO Capabilities" />
              <div className="px-5 py-4 space-y-4">
                <Toggle
                  checked={caps.hdac6SopValidated}
                  onChange={(v) => setCap("hdac6SopValidated", v)}
                  label="HDAC6 assay SOP validated"
                  sublabel="Validated fluorogenic deacetylase protocol on file"
                />
                <Toggle
                  checked={caps.hdac1InStock}
                  onChange={(v) => setCap("hdac1InStock", v)}
                  label="HDAC1 enzyme in stock"
                  sublabel="BPS Bioscience #50051"
                />
                <div className="space-y-2">
                  <Toggle
                    checked={caps.hdac3LowStock}
                    onChange={(v) => setCap("hdac3LowStock", v)}
                    label="HDAC3/NCoR2 low stock"
                    sublabel="Requires reorder before assay start"
                  />
                  {caps.hdac3LowStock && (
                    <div className="ml-12 flex items-center gap-2">
                      <label className="text-xs text-surface-500 flex-shrink-0">Lead time (days)</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={caps.hdac3LeadTimeDays}
                        onChange={(e) => setCap("hdac3LeadTimeDays", Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 text-xs border border-surface-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                      />
                    </div>
                  )}
                </div>
                <Toggle
                  checked={caps.hdac8InStock}
                  onChange={(v) => setCap("hdac8InStock", v)}
                  label="HDAC8 enzyme in stock"
                  sublabel="BPS Bioscience #50020"
                />
                <div>
                  <label className="text-xs text-surface-500 block mb-1.5">Substrate availability</label>
                  <select
                    value={caps.substrateAvailability}
                    onChange={(e) => setCap("substrateAvailability", e.target.value as Capabilities["substrateAvailability"])}
                    className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white"
                  >
                    <option value="sufficient">Sufficient — on hand</option>
                    <option value="low">Low — need to reorder</option>
                    <option value="unavailable">Unavailable — must procure</option>
                  </select>
                </div>
              </div>
            </Card>

            {/* Section 3: Constraints */}
            <Card className="mt-4">
              <CardHeader title="Constraints" />
              <div className="px-5 py-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-surface-500 block mb-1.5">Sponsor budget ($)</label>
                  <input
                    type="number"
                    value={constraints.budget}
                    onChange={(e) => setConstraint("budget", parseInt(e.target.value) || 0)}
                    className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-surface-500 block mb-1.5">Turnaround request (weeks)</label>
                  <input
                    type="number"
                    min={1}
                    value={constraints.turnaroundWeeks}
                    onChange={(e) => setConstraint("turnaroundWeeks", parseInt(e.target.value) || 1)}
                    className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-surface-500 block mb-1.5">Biosafety level</label>
                  <select
                    value={constraints.bsl}
                    onChange={(e) => setConstraint("bsl", e.target.value as "BSL1" | "BSL2")}
                    className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white"
                  >
                    <option value="BSL1">BSL-1</option>
                    <option value="BSL2">BSL-2</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-surface-500 block mb-1.5">Required controls</label>
                  <input
                    type="text"
                    value={constraints.requiredControls}
                    onChange={(e) => setConstraint("requiredControls", e.target.value)}
                    className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                    placeholder="e.g. Tubacin, SAHA"
                  />
                </div>
              </div>
            </Card>

            {/* Section 4: Assumptions */}
            <Card className="mt-4">
              <CardHeader title="Assumptions" />
              <div className="px-5 py-4 space-y-5">

                {/* 🔬 Assay Constraints */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-500 mb-3 flex items-center gap-1.5">
                    <span>🔬</span> Assay Constraints
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-surface-400 block mb-1.5">Panel complexity</label>
                      <div className="flex gap-1.5">
                        {(["simple", "standard", "complex"] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => setAssumption("panelComplexity", v)}
                            className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors capitalize ${
                              assumptions.panelComplexity === v
                                ? "bg-accent text-white border-accent"
                                : "bg-white text-surface-600 border-surface-200 hover:border-accent/40"
                            }`}
                          >
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-surface-400 block mb-1.5">Assay type</label>
                      <div className="flex gap-4">
                        {([["enzymatic", "Enzymatic"], ["cellBased", "Cell-based"], ["binding", "Binding"]] as const).map(([key, label]) => (
                          <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={assumptions.assayTypes[key]}
                              onChange={(e) => setAssumption("assayTypes", { ...assumptions.assayTypes, [key]: e.target.checked })}
                              className="w-3.5 h-3.5 rounded"
                            />
                            <span className="text-xs text-surface-600">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-surface-100" />

                {/* 🧊 Reagent Constraints */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-500 mb-3 flex items-center gap-1.5">
                    <span>🧊</span> Reagent Constraints
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-surface-400 block mb-1.5">Enzyme panel availability</label>
                      <div className="flex gap-1.5">
                        {([["in_stock", "In stock"], ["low", "Low"], ["unavailable", "Unavailable"]] as const).map(([v, l]) => (
                          <button
                            key={v}
                            onClick={() => setAssumption("enzymeAvailability", v)}
                            className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${
                              assumptions.enzymeAvailability === v
                                ? "bg-accent text-white border-accent"
                                : "bg-white text-surface-600 border-surface-200 hover:border-accent/40"
                            }`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-surface-400 block mb-1.5">Lead time sensitivity</label>
                      <div className="flex gap-1.5">
                        {(["none", "moderate", "high"] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => setAssumption("leadTimeSensitivity", v)}
                            className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors capitalize ${
                              assumptions.leadTimeSensitivity === v
                                ? "bg-accent text-white border-accent"
                                : "bg-white text-surface-600 border-surface-200 hover:border-accent/40"
                            }`}
                          >
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-surface-100" />

                {/* 🧬 Execution Constraints */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-500 mb-3 flex items-center gap-1.5">
                    <span>🧬</span> Execution Constraints
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-surface-400 block mb-1.5">Throughput load</label>
                      <div className="flex gap-1.5">
                        {(["low", "medium", "high"] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => setAssumption("throughputLoad", v)}
                            className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors capitalize ${
                              assumptions.throughputLoad === v
                                ? "bg-accent text-white border-accent"
                                : "bg-white text-surface-600 border-surface-200 hover:border-accent/40"
                            }`}
                          >
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-surface-400 block mb-1.5">Instrument availability</label>
                      <div className="flex gap-1.5">
                        {([["available", "Available"], ["limited", "Limited slots"]] as const).map(([v, l]) => (
                          <button
                            key={v}
                            onClick={() => setAssumption("instrumentAvailability", v)}
                            className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${
                              assumptions.instrumentAvailability === v
                                ? "bg-accent text-white border-accent"
                                : "bg-white text-surface-600 border-surface-200 hover:border-accent/40"
                            }`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-surface-100" />

                {/* 💰 Commercial Constraints */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-500 mb-3 flex items-center gap-1.5">
                    <span>💰</span> Commercial Constraints
                  </p>
                  <div className="space-y-3">
                    <Toggle
                      checked={assumptions.budgetFlex}
                      onChange={(v) => setAssumption("budgetFlex", v)}
                      label="Budget flex allowed"
                      sublabel="Allow CRO estimate to exceed sponsor cap"
                    />
                    <div>
                      <label className="text-xs text-surface-400 block mb-1.5">Billing model</label>
                      <select
                        value={assumptions.billingModel}
                        onChange={(e) => setAssumption("billingModel", e.target.value as StructuredAssumptions["billingModel"])}
                        className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white"
                      >
                        <option value="milestone">Milestone-based</option>
                        <option value="upfront">Upfront</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="border-t border-surface-100" />

                {/* Assumption Overrides — expandable */}
                <div>
                  <button
                    onClick={() => setOverridesOpen((o) => !o)}
                    className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-surface-400 hover:text-surface-600 transition-colors w-full"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${overridesOpen ? "rotate-90" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Assumption Overrides
                  </button>
                  {overridesOpen && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {([
                        { key: "laborRateMultiplier" as const, label: "Labor rate multiplier", min: 0.5, max: 3, step: 0.05 },
                        { key: "qcOverheadPct" as const, label: "QC overhead (%)", min: 0, max: 100, step: 5 },
                        { key: "reagentWastageFactor" as const, label: "Reagent wastage factor", min: 1, max: 2, step: 0.05 },
                        { key: "bufferTimeDays" as const, label: "Buffer time (days)", min: 0, max: 14, step: 1 },
                      ]).map(({ key, label, min, max, step }) => (
                        <div key={key}>
                          <label className="text-xs text-surface-400 block mb-1">{label}</label>
                          <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            value={assumptions[key]}
                            onChange={(e) => setAssumption(key, parseFloat(e.target.value) || min)}
                            className="w-full text-xs border border-surface-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-surface-100" />

                {/* Free-text exception box */}
                <div>
                  <label className="text-xs text-surface-400 block mb-1.5">Additional notes / unusual constraints</label>
                  <textarea
                    rows={2}
                    value={assumptions.additionalNotes}
                    onChange={(e) => setAssumption("additionalNotes", e.target.value)}
                    placeholder="Any additional context, edge cases, or overrides not captured above…"
                    className="w-full text-xs border border-surface-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent placeholder:text-surface-300"
                  />
                </div>

              </div>
            </Card>
          </div>
        </div>

        {/* ════════════ RIGHT — ACTIVITY LOG ════════════ */}
        <div className="flex flex-col overflow-hidden">
          <div className="px-6 pt-6 pb-3 flex-shrink-0">
            <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-widest">
              Activity Log
            </h2>
            <p className="text-[11px] text-surface-400 mt-0.5">Calls, emails, agreements, notes — captured here.</p>
          </div>

          {/* Timeline — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 pb-4">
            {logEntries.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-surface-400">No activity yet.</p>
              </div>
            ) : (
              <div>
                {logEntries.map((entry, i) => {
                  const meta = KIND_META[entry.kind];
                  const isLast = i === logEntries.length - 1;
                  return (
                    <div key={entry.id} className="flex gap-3">
                      {/* Spine */}
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${meta.color}`}>
                          {meta.icon}
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-surface-100 mt-1" />}
                      </div>
                      {/* Body */}
                      <div className={`min-w-0 ${isLast ? "pb-2" : "pb-5"}`}>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${meta.color}`}>
                            {meta.label}
                          </span>
                          <span className="text-[11px] text-surface-400">{formatTs(entry.timestamp)}</span>
                          <span className="text-[11px] text-surface-400">· {entry.author}</span>
                        </div>
                        <p className="text-xs text-surface-700 leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                        {entry.url && (
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1.5 text-xs text-accent hover:text-accent-dim font-medium"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            View recording
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={logBottomRef} />
              </div>
            )}
          </div>

          {/* Compose box — pinned to bottom of right panel */}
          <div className="flex-shrink-0 border-t border-surface-200 px-5 py-4 space-y-3 bg-white">
            {/* Kind selector */}
            <div className="flex gap-1.5 flex-wrap">
              {KIND_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setLogKind(o.value)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    logKind === o.value
                      ? "bg-accent text-white"
                      : "text-surface-500 hover:text-surface-700 hover:bg-surface-100"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <textarea
              rows={2}
              value={logContent}
              onChange={(e) => setLogContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addLogEntry(); }}
              placeholder={
                logKind === "call"      ? "Who was on the call? What was discussed? Decisions made?" :
                logKind === "email"     ? "Paste or summarise the email thread…" :
                logKind === "agreement" ? "What was agreed? Price, timeline, scope…" :
                logKind === "file"      ? "Describe the file…" : "Add a note…"
              }
              className="w-full text-xs text-surface-800 placeholder:text-surface-400 border border-surface-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />

            {(logKind === "call" || logKind === "email") && (
              <input
                type="url"
                value={logUrl}
                onChange={(e) => setLogUrl(e.target.value)}
                placeholder="Recording or link — optional (Loom, Zoom…)"
                className="w-full text-xs border border-surface-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            )}

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-surface-300">⌘ + Enter to log</span>
              <button
                onClick={addLogEntry}
                disabled={!logContent.trim()}
                className="btn-primary text-xs px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Log
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════ BOTTOM — STICKY DECISION BAR ════════════ */}
      <div className="sticky bottom-0 z-30 bg-white border-t border-surface-200 px-6 py-4 flex-shrink-0">
        {!submitted ? (
          <div className="max-w-5xl mx-auto space-y-3">
            {/* Action buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-medium uppercase tracking-widest text-surface-400 flex-shrink-0 hidden sm:block">
                Decision
              </span>
              {(
                [
                  { key: "approved" as const, label: "Approve as-is", base: "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600", active: "ring-2 ring-emerald-400 ring-offset-1" },
                  { key: "changes" as const,  label: "Propose changes", base: "bg-white hover:bg-amber-50 text-amber-700 border-amber-300", active: "ring-2 ring-amber-400 ring-offset-1" },
                  { key: "rejected" as const, label: "Reject", base: "bg-white hover:bg-red-50 text-red-600 border-red-200", active: "ring-2 ring-red-400 ring-offset-1" },
                  { key: "clarify" as const,  label: "Request clarification", base: "bg-white hover:bg-surface-50 text-surface-600 border-surface-200", active: "ring-2 ring-surface-400 ring-offset-1" },
                ] as const
              ).map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => setAction((a) => (a === btn.key ? "idle" : btn.key))}
                  className={`px-4 py-2 rounded-lg border text-xs font-semibold transition-all ${btn.base} ${action === btn.key ? btn.active : ""}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Note + submit */}
            {action !== "idle" && (
              <div className="flex items-start gap-3">
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={actionMeta[action].placeholder}
                  className="flex-1 text-xs text-surface-800 placeholder:text-surface-400 border border-surface-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
                <button
                  onClick={async () => {
                    if (note.trim() || action === "approved") {
                      setSubmitted(true);
                      if (action === "approved") {
                        await startExecution(study.id).catch(() => {/* status already transitioned is fine */});
                        router.push(`/lab-packet/${study.id}`);
                      }
                    }
                  }}
                  disabled={action !== "approved" && !note.trim()}
                  className="btn text-xs py-2 px-5 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Submit
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg">{actionMeta[action as Exclude<ActionState, "idle">].icon}</span>
              <div>
                <p className="text-sm font-semibold text-surface-900">Decision submitted</p>
                <p className={`text-xs ${actionMeta[action as Exclude<ActionState, "idle">].color}`}>
                  {actionMeta[action as Exclude<ActionState, "idle">].label}
                </p>
              </div>
              {note && (
                <span className="text-xs text-surface-500 border border-surface-200 bg-surface-50 rounded-lg px-3 py-1.5 max-w-sm truncate hidden md:block">
                  {note}
                </span>
              )}
            </div>
            <button
              onClick={() => { setSubmitted(false); setAction("idle"); setNote(""); }}
              className="btn-ghost text-xs px-3 py-1.5"
            >
              Revise
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
