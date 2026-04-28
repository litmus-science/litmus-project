"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getExperiment, matchLabs, submitForQuote, finalizeDesign, createNote, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Experiment, LabMatch, RoutingResult } from "@/lib/types";
import { ExperimentProgressRail } from "@/components/ExperimentProgressRail";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "loading" | "analyzing" | "searching" | "matched" | "error";

interface CheckItem {
  label: string;
  value: string;
  icon: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCheckItems(experiment: Experiment, result: RoutingResult): CheckItem[] {
  const spec = (experiment.specification ?? {}) as Record<string, unknown>;
  const budget = (spec.turnaround_budget as Record<string, number> | undefined)?.budget_max_usd;
  const tat    = (spec.turnaround_budget as Record<string, number> | undefined)?.desired_turnaround_days;
  const bsl    = (spec.compliance as Record<string, string> | undefined)?.bsl_level ?? "BSL1";
  const expType = (spec.experiment_type as string ?? "Custom").replace(/_/g, " ");

  return [
    { label: "Experiment type",   value: expType,                                       icon: "🧪" },
    { label: "Safety level",      value: bsl,                                            icon: "🛡️" },
    { label: "Budget",            value: budget ? `$${budget.toLocaleString()}` : "Flexible", icon: "💰" },
    { label: "Turnaround window", value: tat ? `${tat} days` : "Flexible",               icon: "📅" },
    { label: "Assay complexity",  value: result.all_matches_count > 5 ? "Standard" : "Specialised", icon: "🔬" },
    { label: "Data package",      value: "L1 — processed + QC report",                  icon: "📦" },
  ];
}

function stars(rating: number) {
  const full = Math.round(rating);
  return Array.from({ length: 5 }, (_, i) => (
    <svg
      key={i}
      className={`w-4 h-4 ${i < full ? "text-amber-400" : "text-surface-200"}`}
      fill="currentColor" viewBox="0 0 20 20"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  ));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckRow({ item, visible, checked }: { item: CheckItem; visible: boolean; checked: boolean }) {
  return (
    <div
      className={`flex items-center gap-4 transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
    >
      {/* Check circle */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
        checked
          ? "bg-accent scale-100"
          : "border-2 border-surface-200 bg-white scale-90"
      }`}>
        {checked ? (
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <div className="w-2 h-2 rounded-full bg-surface-200" />
        )}
      </div>

      {/* Label + value */}
      <div className="flex-1 flex items-center justify-between min-w-0">
        <span className="text-sm text-surface-600">{item.icon} {item.label}</span>
        <span className={`text-sm font-medium transition-colors duration-300 ${
          checked ? "text-surface-900" : "text-surface-300"
        }`}>
          {item.value}
        </span>
      </div>
    </div>
  );
}

function SearchingPulse() {
  const [dot, setDot] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setDot(d => (d + 1) % 4), 380);
    return () => clearInterval(id);
  }, []);

  const labels = [
    "Scanning 200+ certified labs",
    "Scoring on capabilities & compliance",
    "Weighing cost and turnaround fit",
    "Verifying availability",
    "Running compatibility analysis",
  ];
  const [labelIdx, setLabelIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setLabelIdx(i => (i + 1) % labels.length), 1500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Animated rings */}
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-accent/20 animate-ping" />
        <div className="absolute inset-2 rounded-full border-4 border-accent/40 animate-ping" style={{ animationDelay: "200ms" }} />
        <div className="absolute inset-0 rounded-full border-4 border-accent/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
          </svg>
        </div>
      </div>

      <div className="text-center space-y-1.5">
        <p className="text-sm font-medium text-surface-800">
          {labels[labelIdx]}{"".padEnd(dot, ".")}
        </p>
        <p className="text-xs text-surface-400">Running matching engine</p>
      </div>

      {/* Progress bar */}
      <div className="w-64 h-1 bg-surface-100 rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full animate-[progress_4.5s_ease-in-out_forwards]" />
      </div>
    </div>
  );
}

function MatchReveal({
  match,
  onSend,
  sending,
  sendError,
}: {
  match: LabMatch;
  onSend: () => void;
  sending: boolean;
  sendError: string;
}) {
  const [visible, setVisible] = useState(false);
  const pct = Math.round(match.score * 100);
  const city = match.location.split(",")[0].trim();

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>

      {/* Headline */}
      <div className="text-center mb-8 space-y-2">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Match found
        </div>
        <h2 className="text-2xl font-semibold text-surface-900">
          We found the right lab for this experiment.
        </h2>
        <p className="text-sm text-surface-500">
          Our engine ranked {match.lab_name ? "qualified" : "available"} labs on 7 criteria.
          Here&apos;s your best fit.
        </p>
      </div>

      {/* Match card */}
      <div className="bg-white border border-surface-200 rounded-2xl shadow-sm overflow-hidden max-w-md mx-auto">

        {/* Score banner */}
        <div className="bg-accent px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-white/70 uppercase tracking-widest">Compatibility score</p>
            <p className="text-3xl font-bold text-white mt-0.5">{pct}%</p>
          </div>
          <div className="text-right">
            <div className="flex justify-end gap-0.5 mb-1">{stars(match.quality_metrics.average_rating)}</div>
            <p className="text-xs text-white/70">{match.quality_metrics.average_rating.toFixed(1)} / 5 · {Math.round(match.quality_metrics.on_time_rate * 100)}% on-time</p>
          </div>
        </div>

        {/* Details grid */}
        <div className="divide-y divide-surface-100">
          {[
            {
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ),
              label: "Location",
              value: city,
            },
            {
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              label: "Turnaround",
              value: match.estimated_tat_days ? `${match.estimated_tat_days} business days` : "To be confirmed",
            },
            ...(match.capabilities.length > 0 ? [{
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ),
              label: "Specialisations",
              value: match.capabilities.slice(0, 2).join(", "),
            }] : []),
            {
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              ),
              label: "Availability",
              value: "Confirmed for your timeline",
            },
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-center gap-4 px-6 py-3.5">
              <span className="text-surface-400 flex-shrink-0">{icon}</span>
              <span className="text-sm text-surface-500 w-32 flex-shrink-0">{label}</span>
              <span className="text-sm font-medium text-surface-800">{value}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="px-6 py-5 bg-surface-50 border-t border-surface-100 space-y-2">
          <button
            onClick={onSend}
            disabled={sending}
            className="w-full py-3 bg-accent hover:bg-accent-dim text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending…
              </>
            ) : (
              <>
                Send email
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </>
            )}
          </button>
          {sendError && (
            <p className="text-[11px] text-red-500 text-center">{sendError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MatchingPage() {
  const router   = useRouter();
  const params   = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const experimentId = params.id as string;

  const [phase, setPhase]           = useState<Phase>("loading");
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [result, setResult]         = useState<RoutingResult | null>(null);
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState("");

  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) { router.push("/login"); return; }

    Promise.all([getExperiment(experimentId), matchLabs(experimentId)])
      .then(([exp, res]) => {
        setExperiment(exp);
        setResult(res);
        const items = buildCheckItems(exp, res);
        setCheckItems(items);
        setPhase("analyzing");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setPhase("error");
      });
  }, [authChecked, isAuthenticated, router, experimentId]);

  // ── Animate checklist (analyzing → searching) ───────────────────────────────
  useEffect(() => {
    if (phase !== "analyzing" || checkItems.length === 0) return;

    const REVEAL_INTERVAL = 520;  // ms between each item appearing
    const CHECK_DELAY     = 200;  // ms after reveal before checkmark fills

    const schedule = (step: number) => {
      timerRef.current = setTimeout(() => {
        if (step < checkItems.length) {
          setVisibleCount(step + 1);
          timerRef.current = setTimeout(() => {
            setCheckedCount(step + 1);
            schedule(step + 1);
          }, CHECK_DELAY);
        } else {
          // All checked — brief pause then enter searching phase
          timerRef.current = setTimeout(() => setPhase("searching"), 700);
        }
      }, REVEAL_INTERVAL);
    };

    schedule(0);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, checkItems.length]);

  // ── Transition searching → matched (separate ref to survive cleanup) ─────────
  useEffect(() => {
    if (phase !== "searching") return;
    matchTimerRef.current = setTimeout(() => setPhase("matched"), 4800);
    return () => { if (matchTimerRef.current) clearTimeout(matchTimerRef.current); };
  }, [phase]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    setSending(true);
    setError("");
    try {
      // Transition experiment status — 409 means already past this state, which is fine
      const ignore409 = (e: unknown) => {
        if (e instanceof ApiError && e.status === 409) return;
        throw e;
      };
      await submitForQuote(experimentId).catch(ignore409);
      await finalizeDesign(experimentId).catch(ignore409);

      // Build and log the outbound email into the activity log
      const spec      = (experiment?.specification ?? {}) as Record<string, unknown>;
      const title     = (spec.title as string) || "Untitled Experiment";
      const expType   = (spec.experiment_type as string ?? "").replace(/_/g, " ");
      const objective = (spec.hypothesis as Record<string, string> | undefined)?.statement ?? "";
      const budget    = (spec.turnaround_budget as Record<string, number> | undefined)?.budget_max_usd;
      const tat       = (spec.turnaround_budget as Record<string, number> | undefined)?.desired_turnaround_days;
      const bsl       = (spec.compliance as Record<string, string> | undefined)?.bsl_level ?? "BSL1";

      const emailBody = [
        `To: Lab Partner Network`,
        `Subject: New experiment submission — ${title}`,
        ``,
        `Hi,`,
        ``,
        `We'd like to submit the following experiment for your review and quote:`,
        ``,
        `  Title:       ${title}`,
        expType   ? `  Type:        ${expType}`   : null,
        objective ? `  Objective:   ${objective}` : null,
        budget    ? `  Budget:      $${budget.toLocaleString()}` : null,
        tat       ? `  Turnaround:  ${tat} days`  : null,
        `  BSL level:   ${bsl}`,
        ``,
        `The full protocol and lab packet are attached. Please reply with your availability and a quote at your earliest convenience.`,
        ``,
        `Thank you,`,
        `Andy`,
      ].filter((l): l is string => l !== null).join("\n");

      await createNote(experimentId, "email", emailBody);

      router.push(`/experiments/${experimentId}/review`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
      setSending(false);
    }
  };

  const topMatch = result?.top_matches[0] ?? null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <ExperimentProgressRail experimentId={experimentId} currentStep="matching" />

      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">

          {/* ── Loading ── */}
          {phase === "loading" && (
            <div className="flex flex-col items-center gap-4 text-surface-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
              <p className="text-sm">Preparing analysis…</p>
            </div>
          )}

          {/* ── Error ── */}
          {phase === "error" && (
            <div className="text-center space-y-3">
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={() => router.back()} className="btn-secondary text-xs">Go back</button>
            </div>
          )}

          {/* ── Analyzing ── */}
          {(phase === "analyzing" || phase === "searching") && (
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center space-y-1 mb-8">
                <p className="text-[11px] font-medium uppercase tracking-widest text-surface-400">
                  Matching engine
                </p>
                <h1 className="text-2xl font-semibold text-surface-900">
                  {phase === "searching" ? "Searching the network…" : "Analysing your requirements"}
                </h1>
              </div>

              {/* Checklist */}
              <div className="space-y-3">
                {checkItems.map((item, i) => (
                  <CheckRow
                    key={item.label}
                    item={item}
                    visible={i < visibleCount}
                    checked={i < checkedCount}
                  />
                ))}
              </div>

              {/* Searching pulse appears after all checked */}
              {phase === "searching" && (
                <div className="pt-4">
                  <SearchingPulse />
                </div>
              )}
            </div>
          )}

          {/* ── Matched ── */}
          {phase === "matched" && topMatch && (
            <MatchReveal match={topMatch} onSend={handleSend} sending={sending} sendError={error} />
          )}

          {phase === "matched" && !topMatch && (
            <div className="text-center space-y-3">
              <p className="text-sm text-surface-500">No matches found for this experiment type.</p>
              <button onClick={() => router.back()} className="btn-secondary text-xs">Go back</button>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
