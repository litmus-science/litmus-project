"use client";

import { useState, useEffect, useCallback } from "react";
import { listHypotheses, deleteHypothesis } from "@/lib/api";
import type { HypothesisListItem } from "@/lib/types";
import { getExperimentTypeLabel } from "@/lib/experimentTypeLabels";

interface RecentHypothesesProps {
  onSelect: (hypothesis: HypothesisListItem) => void;
  onDelete?: (id: string) => void;
  maxItems?: number;
  className?: string;
}

const formatRelativeTime = (date: string): string => {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;

  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function RecentHypotheses({
  onSelect,
  onDelete,
  maxItems = 5,
  className = "",
}: RecentHypothesesProps) {
  const [hypotheses, setHypotheses] = useState<HypothesisListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchHypotheses = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await listHypotheses({ limit: maxItems });
      setHypotheses(response.hypotheses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hypotheses");
    } finally {
      setLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    fetchHypotheses();
  }, [fetchHypotheses]);

  const handleDelete = useCallback(
    async (id: string, event: React.MouseEvent) => {
      event.stopPropagation();

      if (!confirm("Delete this hypothesis?")) return;

      try {
        setDeletingId(id);
        await deleteHypothesis(id);
        setHypotheses((prev) => prev.filter((h) => h.id !== id));
        onDelete?.(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete hypothesis");
      } finally {
        setDeletingId(null);
      }
    },
    [onDelete]
  );

  if (loading) {
    return (
      <div className={className}>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="py-2 space-y-2 animate-pulse">
              <div className="h-4 bg-surface-200 rounded w-3/4"></div>
              <div className="h-3 bg-surface-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <p className="text-xs text-red-500">{error}</p>
      </div>
    );
  }

  if (hypotheses.length === 0) {
    return (
      <div className={className}>
        <p className="text-xs text-surface-400 text-center py-4">No saved hypotheses</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-1">
        {hypotheses.map((hypothesis) => (
          <div key={hypothesis.id} className="group flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelect(hypothesis)}
              className="flex-1 min-w-0 text-left px-3 py-2 hover:bg-surface-50 transition-colors rounded"
            >
              <p className="text-sm text-surface-700 truncate mb-1">{hypothesis.title}</p>
              <div className="flex items-center gap-2">
                {hypothesis.experiment_type && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-mono uppercase tracking-wider bg-surface-100 text-surface-600 border border-surface-200">
                    {getExperimentTypeLabel(hypothesis.experiment_type, "short")}
                  </span>
                )}
                <span className="text-xs text-surface-500">
                  {formatRelativeTime(hypothesis.created_at)}
                </span>
              </div>
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => handleDelete(hypothesis.id, e)}
                disabled={deletingId === hypothesis.id}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-surface-400 hover:text-red-500 transition-all disabled:opacity-50 px-2 py-2"
                aria-label="Delete hypothesis"
              >
                {deletingId === hypothesis.id ? (
                  <div className="w-4 h-4 animate-spin rounded-full border-b-2 border-surface-400"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-surface-200">
        <button
          type="button"
          className="w-full text-xs font-mono uppercase tracking-wide text-surface-500 hover:text-accent transition-colors text-center"
        >
          View all
        </button>
      </div>
    </div>
  );
}
