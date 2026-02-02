"use client";

import { useMemo } from "react";
import type { EdisonReasoningTrace, EdisonPaperResult, EdisonEvidence, EdisonPlanStep } from "@/lib/types";

interface PlanTableProps {
  plan: EdisonPlanStep[];
}

function PlanTable({ plan }: PlanTableProps) {
  if (plan.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-surface-700 mb-3">Execution Plan</h3>
      <div className="overflow-x-auto border border-surface-200 rounded-lg">
        <table className="min-w-full divide-y divide-surface-200" aria-label="Edison execution plan steps">
          <thead className="bg-surface-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">ID</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Objective</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Rationale</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Result</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-surface-100">
            {plan.map((step) => (
              <tr key={step.id} className="hover:bg-surface-50">
                <td className="px-3 py-2 text-xs font-mono text-surface-500">{step.id}</td>
                <td className="px-3 py-2 text-sm text-surface-800">{step.objective}</td>
                <td className="px-3 py-2 text-sm text-surface-600 max-w-xs truncate" title={step.rationale}>{step.rationale}</td>
                <td className="px-3 py-2">
                  <span className={`
                    inline-flex items-center px-2 py-0.5 text-xs font-mono rounded
                    ${step.status === "completed"
                      ? "bg-emerald-100 text-emerald-700"
                      : step.status === "in_progress"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-surface-100 text-surface-500"
                    }
                  `}>
                    {step.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm text-surface-600 max-w-xs truncate" title={step.result || ""}>
                  {step.result || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PaperCardProps {
  paper: EdisonPaperResult;
}

function PaperCard({ paper }: PaperCardProps) {
  return (
    <div className="border border-surface-200 rounded-lg p-4 hover:border-surface-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-surface-800 line-clamp-2 flex-1">
          {paper.url ? (
            <a href={paper.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent-600 hover:underline">
              {paper.title}
            </a>
          ) : (
            paper.title
          )}
        </h4>
        {paper.is_peer_reviewed && (
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
            Peer Reviewed
          </span>
        )}
      </div>

      {paper.authors.length > 0 && (
        <p className="text-xs text-surface-500 mt-1 truncate">
          {paper.authors.slice(0, 3).join(", ")}
          {paper.authors.length > 3 && ` +${paper.authors.length - 3} more`}
        </p>
      )}

      <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
        {paper.journal && <span>{paper.journal}</span>}
        {paper.year && <span>{paper.year}</span>}
        {paper.citation_count != null && (
          <span className="flex items-center gap-1">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {paper.citation_count}
          </span>
        )}
      </div>
    </div>
  );
}

interface PapersGridProps {
  papers: EdisonPaperResult[];
}

function PapersGrid({ papers }: PapersGridProps) {
  if (papers.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-surface-700 mb-3">
        Papers Found ({papers.length})
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {papers.map((paper) => (
          <PaperCard key={paper.doc_id} paper={paper} />
        ))}
      </div>
    </div>
  );
}

interface EvidenceItemProps {
  evidence: EdisonEvidence;
}

function EvidenceItem({ evidence }: EvidenceItemProps) {
  return (
    <div className="border-l-2 border-accent-300 pl-4 py-2">
      <p className="text-sm text-surface-700">{evidence.context}</p>
      {evidence.summary && (
        <p className="text-xs text-surface-500 mt-1 italic">{evidence.summary}</p>
      )}
      {evidence.relevance != null && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-surface-400">Relevance:</span>
          <div className="flex-1 max-w-24 h-1.5 bg-surface-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-500 rounded-full"
              style={{ width: `${Math.min(100, evidence.relevance * 10)}%` }}
            />
          </div>
          <span className="text-xs text-surface-500">{evidence.relevance}/10</span>
        </div>
      )}
    </div>
  );
}

interface EvidenceListProps {
  evidence: EdisonEvidence[];
}

function EvidenceList({ evidence }: EvidenceListProps) {
  if (evidence.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-surface-700 mb-3">
        Evidence Gathered ({evidence.length})
      </h3>
      <div className="space-y-3">
        {evidence.map((ev, index) => (
          <EvidenceItem key={`${ev.doc_id}-${index}`} evidence={ev} />
        ))}
      </div>
    </div>
  );
}

export interface ReasoningTraceProps {
  trace: EdisonReasoningTrace | null | undefined;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function ReasoningTrace({ trace, isLoading = false, error, onRetry }: ReasoningTraceProps) {
  const hasContent = useMemo(() => {
    if (!trace) return false;
    return (
      trace.plan.length > 0 ||
      trace.papers.length > 0 ||
      trace.evidence.length > 0
    );
  }, [trace]);

  if (!trace && !isLoading) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-surface-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-surface-800">Edison Analysis</h2>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-accent-600">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Processing...</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-red-500 shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-red-800 mb-1">Analysis Failed</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="shrink-0 px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {trace && (
        <>
          <PlanTable plan={trace.plan} />

          <PapersGrid papers={trace.papers} />

          <EvidenceList evidence={trace.evidence} />
        </>
      )}

      {!hasContent && isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <svg
              className="animate-spin h-8 w-8 mx-auto text-accent-500 mb-3"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="text-sm text-surface-500">Initializing Edison analysis...</p>
            <p className="text-xs text-surface-400 mt-1">This may take 3-10 minutes</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReasoningTrace;
