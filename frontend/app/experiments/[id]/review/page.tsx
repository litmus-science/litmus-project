"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getExperiment, listNotes, createNote, type ActivityNote, type NoteKind } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ExperimentProgressRail } from "@/components/ExperimentProgressRail";
import type { Experiment } from "@/lib/types";

// ── Activity log helpers ──────────────────────────────────────────────────────

const KIND_META: Record<NoteKind, { label: string; color: string; icon: string }> = {
  note:      { label: "Note",      color: "bg-surface-100 text-surface-600",  icon: "📝" },
  call:      { label: "Call",      color: "bg-blue-50 text-blue-600",         icon: "📞" },
  email:     { label: "Email",     color: "bg-violet-50 text-violet-600",     icon: "📧" },
  agreement: { label: "Agreement", color: "bg-emerald-50 text-emerald-700",   icon: "✅" },
  file:      { label: "File",      color: "bg-amber-50 text-amber-700",       icon: "📎" },
};

const KIND_OPTIONS: { value: NoteKind; label: string }[] = [
  { value: "note",      label: "📝 Note" },
  { value: "call",      label: "📞 Call" },
  { value: "email",     label: "📧 Email" },
  { value: "agreement", label: "✅ Agreement" },
  { value: "file",      label: "📎 File" },
];

function formatTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const experimentId = params.id as string;

  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [notes, setNotes]           = useState<ActivityNote[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  // Compose state
  const [kind, setKind]         = useState<NoteKind>("note");
  const [content, setContent]   = useState("");
  const [url, setUrl]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const logBottomRef            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) { router.push("/login"); return; }

    Promise.all([getExperiment(experimentId), listNotes(experimentId)])
      .then(([exp, n]) => { setExperiment(exp); setNotes(n); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [authChecked, isAuthenticated, router, experimentId]);

  useEffect(() => {
    if (!loading) logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes, loading]);

  const handleLog = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const note = await createNote(experimentId, kind, content.trim(), url.trim() || undefined);
      setNotes((prev) => [...prev, note]);
      setContent(""); setUrl(""); setKind("note");
      setTimeout(() => logBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <ExperimentProgressRail experimentId={experimentId} currentStep="review" />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      </>
    );
  }

  const spec = (experiment?.specification ?? {}) as Record<string, unknown>;
  const title = (spec.title as string) || "Untitled Experiment";
  const expType = (spec.experiment_type as string) ?? "";
  const objective = (spec.hypothesis as Record<string, string> | undefined)?.statement ?? "";
  const target = (spec.metadata as Record<string, string> | undefined)?.target_compound ?? "";
  const program = (spec.program as string) ?? "";
  const budget = (spec.turnaround_budget as Record<string, number> | undefined)?.budget_max_usd;

  return (
    <div className="flex flex-col h-screen bg-surface-50 overflow-hidden">

      {/* Progress rail */}
      <ExperimentProgressRail experimentId={experimentId} currentStep="review" />

      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-surface-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] font-mono text-surface-400 uppercase tracking-widest flex-shrink-0">
            Review
          </span>
          <span className="w-px h-4 bg-surface-200 flex-shrink-0" />
          <span className="text-sm font-semibold text-surface-900 truncate">{title}</span>
          {program && (
            <span className="text-xs text-surface-400 hidden md:block flex-shrink-0">· {program}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {budget && (
            <span className="text-xs text-surface-500">${budget.toLocaleString()}</span>
          )}
          <span className="inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            In Review
          </span>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex-1 grid grid-cols-2 divide-x divide-surface-200 overflow-hidden">

        {/* ── LEFT: Protocol (read-only) ── */}
        <div className="overflow-y-auto p-6 space-y-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-widest">
            Protocol
          </h2>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* Objective */}
          {objective && (
            <div className="bg-white border border-surface-200 rounded-xl p-5">
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-2">
                Objective
              </p>
              <p className="text-sm text-surface-700 leading-relaxed">{objective}</p>
            </div>
          )}

          {/* Key details */}
          <div className="bg-white border border-surface-200 rounded-xl p-5">
            <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-3">
              Details
            </p>
            <div className="space-y-2.5">
              {([
                ["Experiment type", expType.replace(/_/g, " ")],
                ["Target / compound", target],
                ["Program", program],
                ["Budget", budget ? `$${budget.toLocaleString()}` : ""],
                ["BSL", (spec.compliance as Record<string, string> | undefined)?.bsl_level ?? ""],
                ["Privacy", String(spec.privacy ?? "")],
              ] as [string, string][])
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="text-xs text-surface-400 flex-shrink-0 w-36">{label}</span>
                    <span className="text-xs font-medium text-surface-800 text-right capitalize">{String(value)}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Null hypothesis */}
          {(spec.hypothesis as Record<string, string> | undefined)?.null_hypothesis && (
            <div className="bg-white border border-surface-200 rounded-xl p-5">
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-2">
                Null Hypothesis
              </p>
              <p className="text-sm text-surface-500 leading-relaxed italic">
                {(spec.hypothesis as Record<string, string>).null_hypothesis}
              </p>
            </div>
          )}

          {/* Notes */}
          {typeof spec.notes === "string" && spec.notes && (
            <div className="bg-white border border-surface-200 rounded-xl p-5">
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mb-2">
                Notes
              </p>
              <p className="text-sm text-surface-600 leading-relaxed">{spec.notes}</p>
            </div>
          )}
        </div>

        {/* ── RIGHT: Activity log ── */}
        <div className="flex flex-col overflow-hidden">
          <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-surface-100">
            <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-widest">
              Activity Log
            </h2>
            <p className="text-[11px] text-surface-400 mt-0.5">
              Calls, emails, agreements — captured here.
            </p>
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {notes.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-surface-400">No activity yet. Log your first entry below.</p>
              </div>
            ) : (
              <div>
                {notes.map((note, i) => {
                  const meta = KIND_META[note.kind];
                  const isLast = i === notes.length - 1;
                  return (
                    <div key={note.id} className="flex gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${meta.color}`}>
                          {meta.icon}
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-surface-100 mt-1" />}
                      </div>
                      <div className={`min-w-0 ${isLast ? "pb-2" : "pb-5"}`}>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${meta.color}`}>
                            {meta.label}
                          </span>
                          <span className="text-[11px] text-surface-400">{formatTs(note.created_at)}</span>
                          <span className="text-[11px] text-surface-400">· {note.author}</span>
                        </div>
                        <p className="text-xs text-surface-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                        {note.url && (
                          <a
                            href={note.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1.5 text-xs text-accent hover:text-accent-dim font-medium"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            View recording
                          </a>
                        )}
                        {note.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {note.attachments.map((a) => (
                              <a key={a.url} href={`http://localhost:8000${a.url}`} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs bg-surface-50 border border-surface-200 rounded px-2 py-0.5 text-surface-600 hover:text-accent transition-colors">
                                📎 {a.name}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={logBottomRef} />
              </div>
            )}
          </div>

          {/* Compose */}
          <div className="flex-shrink-0 border-t border-surface-200 px-5 py-4 space-y-3 bg-white">
            <div className="flex gap-1.5 flex-wrap">
              {KIND_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setKind(o.value)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    kind === o.value
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
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleLog(); }}
              placeholder={
                kind === "call"      ? "Who was on the call? What was discussed? Decisions made?" :
                kind === "email"     ? "Paste or summarise the email thread…" :
                kind === "agreement" ? "What was agreed? Price, timeline, scope…" :
                kind === "file"      ? "Describe the file…" : "Add a note…"
              }
              className="w-full text-xs text-surface-800 placeholder:text-surface-400 border border-surface-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />

            {(kind === "call" || kind === "email") && (
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Recording or link — optional (Loom, Zoom…)"
                className="w-full text-xs border border-surface-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            )}

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-surface-300">⌘ + Enter to log</span>
              <button
                onClick={handleLog}
                disabled={submitting || !content.trim()}
                className="btn-primary text-xs px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {submitting && (
                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                Log
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
