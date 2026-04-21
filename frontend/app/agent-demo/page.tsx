"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createExperiment, generateLabPacket, matchLabs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { experimentTypeMap, type ExperimentTypeValue } from "@/lib/experimentSamples";
import type { RoutingResult } from "@/lib/types";

// ── Parsing ───────────────────────────────────────────────────────────────────

const TYPE_PATTERNS: [RegExp, ExperimentTypeValue][] = [
  [/enzyme|inhibit|kinase|protease|bace|ache|acetylcholin/i, "enzyme_inhibition"],
  [/cell.viab|cytotox|mtt|mts|resazur|ic.?50.*cell|viability/i, "cell_viability"],
  [/qpcr|q-pcr|mrna|expression|transcript|gene.*express/i, "qpcr"],
  [/\bmic\b|\bmbc\b|minimum inhibit|minimum bactericid/i, "mic_mbc"],
  [/zone.*inhibit|disk.diffus|kirby|agar.diffus/i, "zone_of_inhibition"],
  [/microbial.growth|growth.curve|od600|biofilm/i, "microbial_growth"],
  [/sanger|sequenc|plasmid|junction/i, "sanger"],
];

const TYPE_LABELS: Record<ExperimentTypeValue, string> = {
  enzyme_inhibition: "ENZYME_INHIBITION_IC50",
  cell_viability:    "CELL_VIABILITY_IC50",
  qpcr:              "QPCR_EXPRESSION",
  mic_mbc:           "MIC_MBC_ASSAY",
  zone_of_inhibition:"ZONE_OF_INHIBITION",
  microbial_growth:  "MICROBIAL_GROWTH_MATRIX",
  sanger:            "SANGER_PLASMID_VERIFICATION",
  custom_protocol:   "CUSTOM",
};

const TYPE_FRIENDLY: Record<ExperimentTypeValue, string> = {
  enzyme_inhibition: "Enzyme Inhibition IC₅₀",
  cell_viability:    "Cell Viability IC₅₀",
  qpcr:              "qPCR Expression",
  mic_mbc:           "MIC / MBC",
  zone_of_inhibition:"Zone of Inhibition",
  microbial_growth:  "Microbial Growth",
  sanger:            "Sanger / Plasmid",
  custom_protocol:   "Custom Protocol",
};

function detectType(text: string): ExperimentTypeValue {
  for (const [re, t] of TYPE_PATTERNS) if (re.test(text)) return t;
  return "custom_protocol";
}

interface Parsed {
  assayType: ExperimentTypeValue;
  title: string;
  program: string;
  compound: string;
  budgetUsd: number;
}

function parseRequest(text: string): Parsed {
  const assayType = detectType(text);

  // Budget: $400, 400, 1.2k
  const budgetMatch = text.match(/\$?([\d,]+\.?\d*)\s*k?\b/i);
  let budgetUsd = 500;
  if (budgetMatch) {
    const raw = budgetMatch[0].replace(/[$,\s]/g, "");
    budgetUsd = raw.toLowerCase().endsWith("k")
      ? parseFloat(raw) * 1000
      : parseInt(raw, 10) || 500;
  }

  // Compound: "X vs Y", "X against Y", "for X"
  const compoundMatch =
    text.match(/([A-Z][A-Za-z0-9-]+)\s+(?:vs\.?|against|inhibit)/i) ||
    text.match(/(?:for|testing|compound)\s+([A-Z][A-Za-z0-9-]+)/i);
  const compound = compoundMatch ? compoundMatch[1] : "compound";

  // Program: "GAL-5 Series", "LIT-2847 Program", "program X"
  const programMatch =
    text.match(/\b([A-Z]{2,}[-\s]?\d+[A-Za-z0-9\s-]*(?:Series|Program|Kinase|Antimicrobial)?)/i) ||
    text.match(/program\s+([A-Za-z0-9\s-]+?)(?:,|\.|$)/i);
  const program = programMatch ? programMatch[1].trim() : "Research Program";

  const title = `${compound} — ${TYPE_FRIENDLY[assayType]}`;

  return { assayType, title, program, compound, budgetUsd };
}

// ── Message model ─────────────────────────────────────────────────────────────

type Role    = "agent" | "user";
type MsgKind = "text" | "tool" | "done";

interface ToolCall {
  name: string;
  params: Record<string, unknown>;
  status: "running" | "done" | "error";
  result?: Record<string, unknown>;
  error?: string;
}

interface Msg {
  id: number;
  role: Role;
  kind: MsgKind;
  text?: string;
  tool?: ToolCall;
  experimentId?: string;
  labCount?: number;
}

let _id = 0;
const nextId = () => ++_id;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Tool-call block ───────────────────────────────────────────────────────────

function ToolBlock({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-50 overflow-hidden text-xs font-mono min-w-0 w-full">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-surface-100 transition-colors"
      >
        {tool.status === "running" ? (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
        ) : tool.status === "done" ? (
          <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        <span className="text-surface-700 font-semibold tracking-tight">{tool.name}</span>
        <span className={`ml-auto text-[10px] font-sans ${
          tool.status === "running" ? "text-accent" :
          tool.status === "done"    ? "text-emerald-600" : "text-red-500"
        }`}>
          {tool.status === "running" ? "running…" : tool.status === "done" ? "done" : "error"}
        </span>
        <svg className={`w-3 h-3 text-surface-400 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-surface-200">
          {/* Input params */}
          <div className="px-4 py-3 space-y-1">
            <p className="text-[10px] font-sans text-surface-400 uppercase tracking-wider mb-2">Input</p>
            {Object.entries(tool.params).map(([k, v]) => (
              <div key={k} className="flex gap-3 min-w-0">
                <span className="text-surface-400 w-36 flex-shrink-0">{k}</span>
                <span className="text-surface-700 break-all">{String(v)}</span>
              </div>
            ))}
          </div>

          {/* Result */}
          {tool.result && (
            <div className="border-t border-surface-200 px-4 py-3 space-y-1 bg-white">
              <p className="text-[10px] font-sans text-surface-400 uppercase tracking-wider mb-2">Output</p>
              {Object.entries(tool.result).map(([k, v]) => (
                <div key={k} className="flex gap-3 min-w-0">
                  <span className="text-emerald-600 w-36 flex-shrink-0">{k}</span>
                  <span className="text-surface-700 break-all">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
          {tool.error && (
            <div className="border-t border-surface-200 px-4 py-3 bg-red-50">
              <span className="text-red-600">{tool.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Suggestions ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "IC50 assay for GAL-5c vs AChE, GAL-5 Series program, $350",
  "Cell viability for LIT-2847 in A549 lung cancer cells, $600",
  "MIC/MBC panel for ZL-9 compound against MRSA, $400",
  "qPCR expression profiling for kinase targets, LIT-2847 program, $450",
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgentDemoPage() {
  const router = useRouter();
  const { isAuthenticated, authChecked } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [started, setStarted]   = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) { router.push("/login"); return; }
  }, [authChecked, isAuthenticated, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addMsg(msg: Omit<Msg, "id">) {
    setMessages((p) => [...p, { ...msg, id: nextId() }]);
  }

  function updateTool(toolId: number, patch: Partial<ToolCall>) {
    setMessages((p) =>
      p.map((m) => m.id === toolId ? { ...m, tool: { ...m.tool!, ...patch } } : m)
    );
  }

  async function run(userText: string) {
    if (busy) return;
    setBusy(true);
    setStarted(true);
    addMsg({ role: "user", kind: "text", text: userText });

    const parsed = parseRequest(userText);
    await wait(600);

    // ── Agent acknowledges ──
    addMsg({ role: "agent", kind: "text",
      text: `Running ${TYPE_FRIENDLY[parsed.assayType]} for **${parsed.compound}** (${parsed.program}).\nCalling Litmus tools now.`,
    });
    await wait(700);

    // ── Tool 1: create_experiment ──
    const t1Id = nextId();
    setMessages((p) => [...p, {
      id: t1Id, role: "agent", kind: "tool",
      tool: {
        name: "litmus_create_experiment",
        params: {
          experiment_type: TYPE_LABELS[parsed.assayType],
          title:           parsed.title,
          program:         parsed.program,
          budget_max_usd:  parsed.budgetUsd,
          bsl_level:       "BSL1",
          privacy:         "confidential",
        },
        status: "running",
      },
    }]);

    let experimentId = "";
    try {
      const result = await createExperiment({
        experiment_type: experimentTypeMap[parsed.assayType],
        title:           parsed.title,
        program:         parsed.program,
        hypothesis:      { statement: userText },
        turnaround_budget: { budget_max_usd: parsed.budgetUsd },
        deliverables:    { minimum_package_level: "standard" },
        compliance:      { bsl_level: "BSL1" },
        privacy:         "confidential",
        metadata:        { target_compound: parsed.compound },
        [parsed.assayType]: {},
      });
      experimentId = result.experiment_id;
      updateTool(t1Id, {
        status: "done",
        result: { experiment_id: experimentId, status: result.status, estimated_cost_usd: String(result.estimated_cost_usd ?? "—") },
      });
    } catch (err) {
      updateTool(t1Id, { status: "error", error: err instanceof Error ? err.message : "Failed" });
      setBusy(false);
      return;
    }

    await wait(500);

    // ── Tool 2: generate_lab_packet ──
    const t2Id = nextId();
    setMessages((p) => [...p, {
      id: t2Id, role: "agent", kind: "tool",
      tool: {
        name: "litmus_generate_lab_packet",
        params: { experiment_id: experimentId },
        status: "running",
      },
    }]);

    try {
      await generateLabPacket(experimentId);
      updateTool(t2Id, {
        status: "done",
        result: { protocol: "generated", reagents: "listed", work_packages: "defined" },
      });
    } catch {
      updateTool(t2Id, { status: "error", error: "Lab packet generation failed" });
    }

    await wait(500);

    // ── Tool 3: match_labs ──
    const t3Id = nextId();
    setMessages((p) => [...p, {
      id: t3Id, role: "agent", kind: "tool",
      tool: {
        name: "litmus_match_labs",
        params: { experiment_id: experimentId, budget_max_usd: parsed.budgetUsd },
        status: "running",
      },
    }]);

    let labCount = 0;
    let topLab = "";
    try {
      const routing: RoutingResult = await matchLabs(experimentId);
      labCount = routing.top_matches?.length ?? 0;
      topLab = routing.top_matches?.[0]?.lab_name ?? "";
      updateTool(t3Id, {
        status: "done",
        result: {
          matches_found: labCount,
          top_match:     topLab || "—",
          all_in_budget: routing.top_matches?.filter(
            (m) => (m.pricing_band_usd?.max ?? Infinity) <= parsed.budgetUsd * 1.2
          ).length ?? 0,
        },
      });
    } catch {
      updateTool(t3Id, { status: "error", error: "Lab matching unavailable" });
    }

    await wait(600);

    // ── Done ──
    addMsg({
      role: "agent", kind: "done",
      experimentId,
      labCount,
      text: `Done. Experiment created, lab packet generated, and ${labCount} matched lab${labCount !== 1 ? "s" : ""} found${topLab ? ` — top match: **${topLab}**` : ""}.`,
    });

    setBusy(false);
  }

  async function handleSend() {
    const value = input.trim();
    if (!value || busy) return;
    setInput("");
    await run(value);
  }

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-surface-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-surface-400">MCP server</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            connected
          </span>
        </div>
        <Link href="/dashboard" className="text-xs text-surface-400 hover:text-surface-600 transition-colors">
          ← Dashboard
        </Link>
      </div>

      {/* ── Thread ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-5 min-w-0">

          {/* Empty state */}
          {!started && (
            <div className="pt-8 pb-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.575 1.575a2.25 2.25 0 01-2.651.42L12 15m0 0l-3.574 1.995a2.25 2.25 0 01-2.651-.42L4.2 15m15.6 0a2.25 2.25 0 00.659-1.591V8.818m-15.6 6.182a2.25 2.25 0 01-.659-1.591V8.818m0 0c.31-.293.647-.555 1.001-.784M19.8 8.818c-.31-.293-.647-.555-1.001-.784" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-surface-900 mb-1">Litmus MCP Agent</h2>
              <p className="text-sm text-surface-500 mb-8 max-w-sm mx-auto leading-relaxed">
                Describe an experiment in plain English. The agent will call Litmus tools to create it, generate a lab packet, and match labs — all in one shot.
              </p>
              <div className="grid grid-cols-1 gap-2 text-left max-w-md mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="text-left text-xs text-surface-600 bg-surface-50 hover:bg-surface-100 border border-surface-200 rounded-lg px-3 py-2.5 transition-colors leading-relaxed"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="bg-surface-100 text-surface-800 rounded-2xl px-4 py-2.5 text-sm leading-relaxed max-w-[80%]">
                    {m.text}
                  </div>
                </div>
              );
            }

            if (m.kind === "tool") {
              return (
                <div key={m.id} className="pl-0">
                  <ToolBlock tool={m.tool!} />
                </div>
              );
            }

            if (m.kind === "done") {
              return (
                <div key={m.id} className="flex gap-3 items-start">
                  <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-sm text-surface-800 leading-relaxed mb-3">
                      {m.text!.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                        part.startsWith("**")
                          ? <strong key={i} className="font-semibold text-surface-900">{part.slice(2, -2)}</strong>
                          : part
                      )}
                    </p>
                    <Link
                      href={`/experiments/${m.experimentId}`}
                      className="btn-primary text-xs inline-flex"
                    >
                      Open in Litmus →
                    </Link>
                  </div>
                </div>
              );
            }

            // agent text
            return (
              <div key={m.id} className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="flex-1 text-sm text-surface-800 leading-relaxed pt-0.5 whitespace-pre-line">
                  {m.text!.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                    part.startsWith("**")
                      ? <strong key={i} className="font-semibold text-surface-900">{part.slice(2, -2)}</strong>
                      : part
                  )}
                </p>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 border-t border-surface-100 bg-white px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <div className={`flex items-end gap-2 rounded-2xl border px-4 py-3 transition-colors ${
            busy
              ? "bg-surface-50 border-surface-100"
              : "bg-white border-surface-300 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20"
          }`}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={busy ? "Running tools…" : "Describe an experiment and I'll set it up in Litmus…"}
              disabled={busy}
              className="flex-1 resize-none bg-transparent text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none disabled:cursor-not-allowed leading-relaxed"
              style={{ minHeight: "24px" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || busy}
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent-dim transition-colors disabled:opacity-30"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
          <p className="text-[11px] text-surface-300 text-center mt-2">
            3 Litmus tools available · Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
