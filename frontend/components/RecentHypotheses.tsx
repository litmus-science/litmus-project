"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { listHypotheses, deleteHypothesis } from "@/lib/api";
import type { HypothesisListItem } from "@/lib/types";
import { getExperimentTypeLabel } from "@/lib/experimentTypeLabels";
import { useAuth } from "@/lib/auth";
import { usePaginatedList } from "@/lib/usePaginatedList";

interface RecentHypothesesProps {
  onSelect: (hypothesis: HypothesisListItem) => void;
  onDelete?: (id: string) => void;
  selectedId?: string | null;
  pageSize?: number;
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
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function RecentHypotheses({
  onSelect,
  onDelete,
  selectedId,
  pageSize = 10,
  className = "",
}: RecentHypothesesProps) {
  const { authChecked, isAuthenticated } = useAuth();
  const [actionError, setActionError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (cursorParam?: string) => {
      const response = await listHypotheses({
        limit: pageSize,
        cursor: cursorParam,
      });
      return {
        items: response.hypotheses,
        cursor: response.pagination?.cursor,
        hasMore: response.pagination?.has_more ?? false,
      };
    },
    [pageSize],
  );

  const {
    items: hypotheses,
    status,
    error: paginationError,
    hasMore,
    loadInitial,
    loadMore,
    updateItems,
  } = usePaginatedList<HypothesisListItem>({
    loadPage,
    getErrorMessage: (err, mode) => {
      if (err instanceof Error) {
        return err.message;
      }
      return mode === "more" ? "Failed to load more" : "Failed to load hypotheses";
    },
    initialStatus: "loading",
  });

  const error = actionError || paginationError;
  const isLoading = status === "loading";
  const isLoadingMore = status === "loadingMore";

  useEffect(() => {
    if (!authChecked || !isAuthenticated()) {
      return;
    }
    void loadInitial();
  }, [authChecked, isAuthenticated, loadInitial]);

  useEffect(() => {
    if (status === "loading" || status === "loadingMore") {
      setActionError("");
    }
  }, [status]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore || status === "error") return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "100px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, loadMore, status]);

  const handleDelete = useCallback(
    async (id: string, event: React.MouseEvent) => {
      event.stopPropagation();

      if (!confirm("Delete this hypothesis?")) return;

      setDeletingId(id);
      setActionError("");
      try {
        await deleteHypothesis(id);
        updateItems((prev) => prev.filter((h) => h.id !== id));
        onDelete?.(id);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to delete hypothesis",
        );
      } finally {
        setDeletingId(null);
      }
    },
    [onDelete, updateItems],
  );

  if (isLoading) {
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

  if (error && hypotheses.length === 0) {
    return (
      <div className={className}>
        <p className="text-xs text-red-500">{error}</p>
      </div>
    );
  }

  if (hypotheses.length === 0) {
    return (
      <div className={className}>
        <p className="text-xs text-surface-400 text-center py-4">
          No saved hypotheses
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-0.5">
        {hypotheses.map((hypothesis) => {
          const isSelected = selectedId === hypothesis.id;
          return (
            <div
              key={hypothesis.id}
              className="group flex items-start"
            >
              <button
                type="button"
                onClick={() => onSelect(hypothesis)}
                className={`flex-1 min-w-0 text-left px-3 py-2 rounded-r transition-colors border-l-2 ${
                  isSelected
                    ? "border-l-accent bg-surface-200/60"
                    : "border-l-accent/40 hover:bg-surface-200/40"
                }`}
              >
                <p className={`text-sm truncate ${isSelected ? "text-surface-900" : "text-surface-700"}`}>
                  {hypothesis.title}
                </p>
                <p className="text-xs text-surface-500 mt-0.5">
                  {hypothesis.experiment_type &&
                    getExperimentTypeLabel(hypothesis.experiment_type, "short")}
                  {hypothesis.experiment_type && " · "}
                  {formatRelativeTime(hypothesis.created_at)}
                </p>
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => handleDelete(hypothesis.id, e)}
                  disabled={deletingId === hypothesis.id}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-surface-400 hover:text-red-500 transition-all disabled:opacity-50 p-2"
                  aria-label="Delete hypothesis"
                >
                  {deletingId === hypothesis.id ? (
                    <div className="w-3.5 h-3.5 animate-spin rounded-full border-b-2 border-surface-400" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading more indicator */}
      {isLoadingMore && (
        <div className="flex justify-center py-2">
          <div className="w-4 h-4 animate-spin rounded-full border-b-2 border-surface-400" />
        </div>
      )}

      {/* Error loading more */}
      {error && hypotheses.length > 0 && (
        <p className="text-xs text-red-500 text-center py-2">{error}</p>
      )}
    </div>
  );
}
