"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { listNotes, createNote, type ActivityNote, type NoteKind } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ExperimentProgressRail } from "@/components/ExperimentProgressRail";

// ── Helpers ───────────────────────────────────────────────────────────────────

const KIND_META: Record<NoteKind, { label: string; icon: React.ReactNode; color: string }> = {
  note: {
    label: "Note",
    color: "bg-surface-100 text-surface-600",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  call: {
    label: "Call",
    color: "bg-blue-50 text-blue-600",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  email: {
    label: "Email",
    color: "bg-violet-50 text-violet-600",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  agreement: {
    label: "Agreement",
    color: "bg-emerald-50 text-emerald-700",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  file: {
    label: "File",
    color: "bg-amber-50 text-amber-700",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
    ),
  },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function isLoomOrZoom(url: string) {
  return /loom\.com|zoom\.us|meet\.google|teams\.microsoft/i.test(url);
}

// ── Note card ─────────────────────────────────────────────────────────────────

function NoteCard({ note }: { note: ActivityNote }) {
  const meta = KIND_META[note.kind];
  return (
    <div className="flex gap-4">
      {/* Timeline dot */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${meta.color}`}>
          {meta.icon}
        </div>
        <div className="w-px flex-1 bg-surface-100 mt-2" />
      </div>

      {/* Content */}
      <div className="pb-6 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${meta.color}`}>
            {meta.label}
          </span>
          <span className="text-[11px] text-surface-400">{formatDate(note.created_at)}</span>
          <span className="text-[11px] text-surface-400">· {note.author}</span>
        </div>

        <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>

        {/* URL / recording link */}
        {note.url && (
          <a
            href={note.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-2 text-xs text-accent hover:text-accent-dim font-medium transition-colors"
          >
            {isLoomOrZoom(note.url) ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            )}
            {isLoomOrZoom(note.url) ? "View recording" : note.url}
          </a>
        )}

        {/* Attachments */}
        {note.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {note.attachments.map((a) => (
              <a
                key={a.url}
                href={`http://localhost:8000${a.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs bg-surface-50 border border-surface-200 rounded px-2.5 py-1 text-surface-600 hover:text-accent hover:border-accent/40 transition-colors"
              >
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {a.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const KIND_OPTIONS: { value: NoteKind; label: string }[] = [
  { value: "note",      label: "📝  Note" },
  { value: "call",      label: "📞  Call" },
  { value: "email",     label: "📧  Email" },
  { value: "agreement", label: "✅  Agreement" },
  { value: "file",      label: "📎  File" },
];

export default function ActivityPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const experimentId = params.id as string;

  const [notes, setNotes] = useState<ActivityNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [kind, setKind] = useState<NoteKind>("note");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) { router.push("/login"); return; }

    listNotes(experimentId)
      .then(setNotes)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [authChecked, isAuthenticated, router, experimentId]);

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes, loading]);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const note = await createNote(experimentId, kind, content.trim(), url.trim() || undefined, files);
      setNotes((prev) => [...prev, note]);
      setContent("");
      setUrl("");
      setFiles([]);
      setKind("note");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ExperimentProgressRail experimentId={experimentId} currentStep="review" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-base font-semibold text-surface-900">Activity Log</h1>
          <p className="text-xs text-surface-400 mt-0.5">
            Calls, emails, agreements, and notes — all in one place.
          </p>
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 rounded-full bg-surface-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm text-surface-400">No activity yet. Log your first entry below.</p>
          </div>
        ) : (
          <div className="mb-4">
            {notes.map((n) => <NoteCard key={n.id} note={n} />)}
            <div ref={bottomRef} />
          </div>
        )}

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        {/* Compose */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-surface-100 flex items-center gap-2">
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

          <div className="p-4 space-y-3">
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
              placeholder={
                kind === "call"      ? "Who was on the call? What was discussed? What was decided?" :
                kind === "email"     ? "Paste or summarise the email thread…" :
                kind === "agreement" ? "What was agreed? Timeline, price, scope changes…" :
                kind === "file"      ? "Describe the file being attached…" :
                                       "Add a note…"
              }
              className="w-full text-sm text-surface-800 placeholder:text-surface-400 border border-surface-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />

            {/* URL field — shown for call / email */}
            {(kind === "call" || kind === "email" || kind === "note") && (
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={kind === "call" ? "Recording link (Loom, Zoom, etc.) — optional" : "Link — optional"}
                className="w-full text-sm text-surface-800 placeholder:text-surface-400 border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            )}

            {/* File picker */}
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-700 cursor-pointer transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                Attach file
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
                    e.target.value = "";
                  }}
                />
              </label>

              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-surface-50 border border-surface-200 rounded-full px-2 py-0.5 text-surface-600">
                  {f.name}
                  <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-surface-300 hover:text-red-400 ml-0.5">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}

              <button
                onClick={handleSubmit}
                disabled={submitting || !content.trim()}
                className="ml-auto btn-primary text-xs px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {submitting && (
                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {submitting ? "Saving…" : "Log"}
              </button>
            </div>

            <p className="text-[10px] text-surface-300">⌘ + Enter to submit</p>
          </div>
        </div>
      </div>
    </>
  );
}
