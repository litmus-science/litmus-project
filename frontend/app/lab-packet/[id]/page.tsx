"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { getLabPacket, generateLabPacket, getExperiment } from "@/lib/api";
import type { LabPacket, Experiment, ReagentItem } from "@/lib/types";

// ── Default mockup builder ────────────────────────────────────────────────────

function buildDefaultPacket(experimentId: string, experiment: Experiment | null): EditablePacket {
  const spec = (experiment?.specification ?? {}) as Record<string, unknown>;
  const hyp = (spec.hypothesis ?? {}) as Record<string, unknown>;
  const expType = typeof spec.experiment_type === "string" ? spec.experiment_type : "Custom Protocol";
  const title = typeof spec.title === "string" ? spec.title : `${expType.replace(/_/g, " ")} — ${experimentId.slice(0, 8)}`;
  const objective = typeof hyp.statement === "string" ? hyp.statement : "Characterize the dose-response relationship and determine IC₅₀ values across the target panel.";

  return {
    title,
    objective,
    study_parameters: [
      { key: "Experiment Type", value: expType.replace(/_/g, " ") },
      { key: "Replicates", value: "3 technical replicates" },
      { key: "Concentration Points", value: "10-point, 3-fold serial dilution" },
      { key: "Top Concentration", value: "100 µM" },
      { key: "Plate Format", value: "384-well, black polystyrene" },
    ],
    protocol_steps: [
      { step: 1, title: "Compound preparation", procedure: "Prepare 10 mM DMSO stock solutions. Perform 3-fold serial dilutions to generate 10-point concentration series.", critical_notes: "Keep compounds on ice and protected from light." },
      { step: 2, title: "Assay setup", procedure: "Dispense assay buffer into 384-well plate. Add enzyme/cells per the validated SOP. Pre-incubate for 30 min at 37°C.", critical_notes: "Ensure plate is equilibrated to room temperature before reading." },
      { step: 3, title: "Compound addition", procedure: "Transfer compounds to assay plate using acoustic dispensing (Echo) or manual multichannel pipette. Final DMSO ≤ 0.1%.", critical_notes: null },
      { step: 4, title: "Incubation", procedure: "Incubate plates for 60 min at 37°C, protected from light.", critical_notes: null },
      { step: 5, title: "Signal detection", procedure: "Read fluorescence or luminescence per assay protocol. Record raw values.", critical_notes: null },
      { step: 6, title: "Data analysis", procedure: "Fit dose-response curves using 4PL model. Calculate IC₅₀ values with 95% CI. Generate QC report.", critical_notes: "Flag curves with Hill slope > 3 or R² < 0.95 for review." },
    ],
    reagents: [
      { item: "Assay buffer", specification: "1× PBS + 0.01% Tween-20", supplier: "Sigma-Aldrich", catalog_or_id: "P3813", link: null },
      { item: "Positive control", specification: "1 µM reference inhibitor", supplier: "Cayman Chemical", catalog_or_id: "", link: null },
      { item: "DMSO (vehicle)", specification: "≥ 99.9% purity", supplier: "Sigma-Aldrich", catalog_or_id: "D8418", link: null },
      { item: "384-well plate", specification: "Black, non-binding surface", supplier: "Corning", catalog_or_id: "3573", link: null },
    ],
    acceptance_criteria: [
      { parameter: "Z′ factor", requirement: "≥ 0.5" },
      { parameter: "Positive control CV", requirement: "≤ 20%" },
      { parameter: "Signal:Background ratio", requirement: "≥ 3" },
      { parameter: "Curve R²", requirement: "≥ 0.95" },
    ],
    deliverables: [
      { name: "Raw data file", description: "Excel workbook with plate maps, raw fluorescence values, and normalized data." },
      { name: "IC₅₀ summary table", description: "Fitted IC₅₀ values ± 95% CI for all compounds and controls." },
      { name: "Dose-response curves", description: "PDF with 4PL-fitted curves for each compound, annotated with IC₅₀." },
      { name: "QC report", description: "Plate-level QC metrics (Z′, S:B, CV) confirming assay validity." },
    ],
    cost_low: 800,
    cost_high: 1200,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudyParam { key: string; value: string }

interface EditablePacket {
  title: string;
  objective: string;
  study_parameters: StudyParam[];
  protocol_steps: Array<{ step: number; title: string; procedure: string; critical_notes: string | null }>;
  reagents: Array<{ item: string; specification: string; supplier: string; catalog_or_id: string; link: string | null }>;
  acceptance_criteria: Array<{ parameter: string; requirement: string }>;
  deliverables: Array<{ name: string; description: string }>;
  cost_low: number;
  cost_high: number;
}

function fromLabPacket(p: LabPacket): EditablePacket {
  return {
    title: p.title ?? "",
    objective: p.objective ?? "",
    study_parameters: p.study_parameters
      ? Object.entries(p.study_parameters)
          .filter(([, v]) => v)
          .map(([k, v]) => ({ key: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), value: v as string }))
      : [],
    protocol_steps: (p.protocol_steps ?? []).map(s => ({
      step: s.step,
      title: s.title,
      procedure: s.procedure,
      critical_notes: s.critical_notes ?? null,
    })),
    reagents: (p.reagents_and_consumables ?? p.materials ?? []).map(r => ({
      item: r.item,
      specification: (r as ReagentItem).specification ?? "",
      supplier: r.supplier ?? "",
      catalog_or_id: r.catalog_or_id ?? "",
      link: r.link ?? null,
    })),
    acceptance_criteria: (p.acceptance_criteria ?? []).map(a => ({ parameter: a.parameter, requirement: a.requirement })),
    deliverables: (p.deliverables ?? []).map(d => ({ name: d.name, description: d.description })),
    cost_low: p.estimated_direct_cost_usd?.low ?? 0,
    cost_high: p.estimated_direct_cost_usd?.high ?? 0,
  };
}

// ── UI components ─────────────────────────────────────────────────────────────

function SectionHeader({ title, onAdd, addLabel }: { title: string; onAdd?: () => void; addLabel?: string }) {
  return (
    <div className="px-6 py-3 border-b border-surface-100 flex items-center justify-between">
      <h2 className="text-[10px] tracking-widest font-medium uppercase text-surface-400">{title}</h2>
      {onAdd && (
        <button onClick={onAdd} className="text-[10px] text-accent hover:text-accent/80 font-medium flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {addLabel ?? "Add row"}
        </button>
      )}
    </div>
  );
}

function Field({ value, onChange, multiline = false, mono = false, placeholder = "" }: {
  value: string; onChange: (v: string) => void; multiline?: boolean; mono?: boolean; placeholder?: string;
}) {
  const base = `w-full text-sm text-surface-800 placeholder:text-surface-300 bg-transparent border border-transparent rounded px-1 py-0.5 focus:outline-none focus:border-accent/40 focus:bg-accent/5 hover:border-surface-200 transition-colors resize-none ${mono ? "font-mono text-xs" : ""}`;
  if (multiline) {
    return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={base} />;
  }
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={base} />;
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-surface-300 hover:text-red-400 transition-colors flex-shrink-0 p-1">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LabPacketStandalonePage() {
  const params = useParams();
  const experimentId = params.id as string;

  const [packet, setPacket] = useState<EditablePacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const [expResult, lpResult] = await Promise.allSettled([
        getExperiment(experimentId),
        getLabPacket(experimentId),
      ]);
      const experiment = expResult.status === "fulfilled" ? expResult.value : null;
      setPacket(lpResult.status === "fulfilled"
        ? fromLabPacket(lpResult.value)
        : buildDefaultPacket(experimentId, experiment));
      setLoading(false);
    }
    load();
  }, [experimentId]);

  const update = useCallback(<K extends keyof EditablePacket>(key: K, val: EditablePacket[K]) => {
    setPacket(prev => prev ? { ...prev, [key]: val } : prev);
    setSaved(false);
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await generateLabPacket(experimentId, true);
      setPacket(fromLabPacket(data));
    } catch { /* keep current state */ }
    finally { setGenerating(false); }
  };

  if (loading || !packet) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  const steps = packet.protocol_steps;
  const reagents = packet.reagents;
  const criteria = packet.acceptance_criteria;
  const deliverables = packet.deliverables;
  const sparams = packet.study_parameters;

  const updateStep = (i: number, f: string, v: string) =>
    update("protocol_steps", steps.map((s, j) => j === i ? { ...s, [f]: v || null } : s));
  const updateReagent = (i: number, f: string, v: string) =>
    update("reagents", reagents.map((r, j) => j === i ? { ...r, [f]: v || null } : r));
  const updateCriterion = (i: number, f: string, v: string) =>
    update("acceptance_criteria", criteria.map((c, j) => j === i ? { ...c, [f]: v } : c));
  const updateDeliverable = (i: number, f: string, v: string) =>
    update("deliverables", deliverables.map((d, j) => j === i ? { ...d, [f]: v } : d));
  const updateParam = (i: number, f: string, v: string) =>
    update("study_parameters", sparams.map((p, j) => j === i ? { ...p, [f]: v } : p));

  const card = "bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm";

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-surface-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-surface-400 uppercase tracking-widest">Lab Packet</span>
          <span className="w-px h-4 bg-surface-200" />
          <span className="text-sm font-semibold text-surface-900 font-mono truncate max-w-xs">{experimentId}</span>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
          <button
            onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
            className="btn text-xs py-1.5 px-4"
          >
            Save
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-secondary text-xs py-1.5 px-4"
          >
            {generating ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-surface-600" />
                Generating…
              </span>
            ) : "Regenerate with AI"}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">

        {/* Header */}
        <div className={card}>
          <div className="px-6 pt-5 pb-4 border-b border-surface-100">
            <p className="text-[10px] tracking-widest font-medium uppercase text-surface-400 mb-1">Title</p>
            <input
              type="text"
              value={packet.title}
              onChange={e => update("title", e.target.value)}
              placeholder="Protocol title…"
              className="w-full text-xl font-semibold text-surface-900 bg-transparent border border-transparent rounded px-1 py-0.5 focus:outline-none focus:border-accent/40 focus:bg-accent/5 hover:border-surface-200 transition-colors"
            />
          </div>
          <div className="px-6 py-4">
            <p className="text-[10px] tracking-widest font-medium uppercase text-surface-400 mb-2">Objective</p>
            <textarea
              value={packet.objective}
              onChange={e => update("objective", e.target.value)}
              placeholder="Study objective…"
              rows={3}
              className="w-full text-sm text-surface-700 leading-relaxed bg-transparent border border-transparent rounded px-1 py-0.5 focus:outline-none focus:border-accent/40 focus:bg-accent/5 hover:border-surface-200 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Study Parameters */}
        <div className={card}>
          <SectionHeader title="Study Parameters" onAdd={() => update("study_parameters", [...sparams, { key: "", value: "" }])} addLabel="Add parameter" />
          <div className="divide-y divide-surface-50">
            {sparams.map((p, i) => (
              <div key={i} className="px-6 py-2.5 flex items-center gap-3">
                <div className="w-48 flex-shrink-0">
                  <Field value={p.key} onChange={v => updateParam(i, "key", v)} placeholder="Parameter name" />
                </div>
                <div className="flex-1">
                  <Field value={p.value} onChange={v => updateParam(i, "value", v)} placeholder="Value" />
                </div>
                <RemoveBtn onClick={() => update("study_parameters", sparams.filter((_, j) => j !== i))} />
              </div>
            ))}
            {sparams.length === 0 && <p className="px-6 py-4 text-xs text-surface-300">No parameters.</p>}
          </div>
        </div>

        {/* Protocol Steps */}
        <div className={card}>
          <SectionHeader
            title="Protocol — Step by Step"
            onAdd={() => update("protocol_steps", [...steps, { step: steps.length + 1, title: "", procedure: "", critical_notes: null }])}
            addLabel="Add step"
          />
          <div className="divide-y divide-surface-100">
            {steps.map((step, i) => (
              <div key={i} className="px-6 py-4 flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-surface-900 text-white text-xs font-bold flex items-center justify-center rounded-sm mt-0.5">
                  {step.step}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Field value={step.title} onChange={v => updateStep(i, "title", v)} placeholder="Step title…" />
                  <Field value={step.procedure} onChange={v => updateStep(i, "procedure", v)} multiline placeholder="Procedure…" />
                  <Field value={step.critical_notes ?? ""} onChange={v => updateStep(i, "critical_notes", v)} placeholder="Critical notes (optional)…" />
                </div>
                <RemoveBtn onClick={() => update("protocol_steps", steps.filter((_, j) => j !== i))} />
              </div>
            ))}
            {steps.length === 0 && <p className="px-6 py-4 text-xs text-surface-300">No steps yet.</p>}
          </div>
        </div>

        {/* Reagents */}
        <div className={card}>
          <SectionHeader title="Reagents and Consumables" onAdd={() => update("reagents", [...reagents, { item: "", specification: "", supplier: "", catalog_or_id: "", link: null }])} addLabel="Add reagent" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-[10px] tracking-widest uppercase text-surface-400">
                  <th className="text-left px-6 py-3 font-medium">Item</th>
                  <th className="text-left px-4 py-3 font-medium">Specification</th>
                  <th className="text-left px-4 py-3 font-medium">Supplier</th>
                  <th className="text-left px-4 py-3 font-medium">Catalog #</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {reagents.map((r, i) => (
                  <tr key={i}>
                    <td className="px-6 py-2"><Field value={r.item} onChange={v => updateReagent(i, "item", v)} placeholder="Item" /></td>
                    <td className="px-4 py-2"><Field value={r.specification} onChange={v => updateReagent(i, "specification", v)} placeholder="Spec" /></td>
                    <td className="px-4 py-2"><Field value={r.supplier} onChange={v => updateReagent(i, "supplier", v)} placeholder="Supplier" /></td>
                    <td className="px-4 py-2"><Field value={r.catalog_or_id} onChange={v => updateReagent(i, "catalog_or_id", v)} mono placeholder="Cat #" /></td>
                    <td className="px-2 py-2"><RemoveBtn onClick={() => update("reagents", reagents.filter((_, j) => j !== i))} /></td>
                  </tr>
                ))}
                {reagents.length === 0 && <tr><td colSpan={5} className="px-6 py-4 text-xs text-surface-300">No reagents yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Acceptance Criteria */}
        <div className={card}>
          <SectionHeader title="Acceptance Criteria" onAdd={() => update("acceptance_criteria", [...criteria, { parameter: "", requirement: "" }])} addLabel="Add criterion" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-[10px] tracking-widest uppercase text-surface-400">
                  <th className="text-left px-6 py-3 font-medium w-64">Parameter</th>
                  <th className="text-left px-4 py-3 font-medium">Requirement</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {criteria.map((c, i) => (
                  <tr key={i}>
                    <td className="px-6 py-2"><Field value={c.parameter} onChange={v => updateCriterion(i, "parameter", v)} placeholder="Parameter" /></td>
                    <td className="px-4 py-2"><Field value={c.requirement} onChange={v => updateCriterion(i, "requirement", v)} placeholder="Requirement" /></td>
                    <td className="px-2 py-2"><RemoveBtn onClick={() => update("acceptance_criteria", criteria.filter((_, j) => j !== i))} /></td>
                  </tr>
                ))}
                {criteria.length === 0 && <tr><td colSpan={3} className="px-6 py-4 text-xs text-surface-300">No criteria yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Deliverables */}
        <div className={card}>
          <SectionHeader title="Deliverables" onAdd={() => update("deliverables", [...deliverables, { name: "", description: "" }])} addLabel="Add deliverable" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-[10px] tracking-widest uppercase text-surface-400">
                  <th className="text-left px-6 py-3 font-medium w-48">Deliverable</th>
                  <th className="text-left px-4 py-3 font-medium">Description</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {deliverables.map((d, i) => (
                  <tr key={i}>
                    <td className="px-6 py-2 align-top"><Field value={d.name} onChange={v => updateDeliverable(i, "name", v)} placeholder="Name" /></td>
                    <td className="px-4 py-2"><Field value={d.description} onChange={v => updateDeliverable(i, "description", v)} multiline placeholder="Description…" /></td>
                    <td className="px-2 py-2 align-top"><RemoveBtn onClick={() => update("deliverables", deliverables.filter((_, j) => j !== i))} /></td>
                  </tr>
                ))}
                {deliverables.length === 0 && <tr><td colSpan={3} className="px-6 py-4 text-xs text-surface-300">No deliverables yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost Estimate */}
        <div className={card}>
          <SectionHeader title="Estimated Direct Cost" />
          <div className="px-6 py-4 flex items-center gap-6">
            <div className="flex items-center gap-3">
              <label className="text-xs text-surface-400 w-16">Low ($)</label>
              <input type="number" value={packet.cost_low} onChange={e => update("cost_low", parseInt(e.target.value) || 0)}
                className="w-28 text-sm border border-surface-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent" />
            </div>
            <span className="text-surface-300">—</span>
            <div className="flex items-center gap-3">
              <label className="text-xs text-surface-400 w-16">High ($)</label>
              <input type="number" value={packet.cost_high} onChange={e => update("cost_high", parseInt(e.target.value) || 0)}
                className="w-28 text-sm border border-surface-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent" />
            </div>
            {packet.cost_low > 0 && packet.cost_high > 0 && (
              <span className="text-sm font-semibold text-surface-800 ml-4">
                ${packet.cost_low.toLocaleString()} – ${packet.cost_high.toLocaleString()}
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
