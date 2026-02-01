"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { listHypotheses, ApiError } from "@/lib/api";
import type { HypothesisListItem } from "@/lib/types";

interface HypothesisPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (hypothesis: HypothesisListItem) => void;
}

const experimentTypeLabels: Record<string, string> = {
  SANGER_PLASMID_VERIFICATION: "Sanger Sequencing",
  QPCR_EXPRESSION: "qPCR Expression",
  CELL_VIABILITY_IC50: "Cell Viability IC50",
  ENZYME_INHIBITION_IC50: "Enzyme Inhibition IC50",
  MICROBIAL_GROWTH_MATRIX: "Microbial Growth",
  MIC_MBC_ASSAY: "MIC/MBC Assay",
  ZONE_OF_INHIBITION: "Zone of Inhibition",
  CUSTOM: "Custom Protocol",
};

const experimentTypeColors: Record<string, string> = {
  SANGER_PLASMID_VERIFICATION: "bg-blue-50 text-blue-700 border-blue-200",
  QPCR_EXPRESSION: "bg-violet-50 text-violet-700 border-violet-200",
  CELL_VIABILITY_IC50: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ENZYME_INHIBITION_IC50: "bg-amber-50 text-amber-700 border-amber-200",
  MICROBIAL_GROWTH_MATRIX: "bg-rose-50 text-rose-700 border-rose-200",
  MIC_MBC_ASSAY: "bg-cyan-50 text-cyan-700 border-cyan-200",
  ZONE_OF_INHIBITION: "bg-purple-50 text-purple-700 border-purple-200",
  CUSTOM: "bg-surface-100 text-surface-700 border-surface-200",
};

const truncate = (text: string, maxLength: number): string =>
  text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;

const formatDate = (date: string): string => new Date(date).toLocaleDateString();

export function HypothesisPicker({ isOpen, onClose, onSelect }: HypothesisPickerProps) {
  const [hypotheses, setHypotheses] = useState<HypothesisListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const fetchHypotheses = useCallback(async (reset = false) => {
    setLoading(true);
    setError("");

    try {
      const params: { experiment_type?: string; limit: number; cursor?: string } = { limit: 10 };
      if (filterType !== "all") {
        params.experiment_type = filterType;
      }
      if (!reset && cursor) {
        params.cursor = cursor;
      }

      const response = await listHypotheses(params);

      if (reset) {
        setHypotheses(response.hypotheses);
      } else {
        setHypotheses((prev) => [...prev, ...response.hypotheses]);
      }

      setHasMore(response.pagination.has_more);
      setCursor(response.pagination.cursor);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load hypotheses");
      }
    } finally {
      setLoading(false);
    }
  }, [filterType, cursor]);

  useEffect(() => {
    if (isOpen) {
      fetchHypotheses(true);
    }
  }, [isOpen, filterType]);

  const handleSelect = useCallback(
    (hypothesis: HypothesisListItem) => {
      onSelect(hypothesis);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchHypotheses(false);
    }
  }, [loading, hasMore, fetchHypotheses]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-200 px-6 py-4">
          <h2 className="text-xl font-display text-surface-900">Select Hypothesis</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-surface-400 hover:text-surface-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="border-b border-surface-200 px-6 py-3">
          <label htmlFor="experiment-type-filter" className="sr-only">
            Filter by experiment type
          </label>
          <select
            id="experiment-type-filter"
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setCursor(undefined);
            }}
            className="input text-sm py-2"
          >
            <option value="all">All Experiment Types</option>
            {Object.entries(experimentTypeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="alert-error mb-4">
              {error}
            </div>
          )}

          {loading && hypotheses.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : hypotheses.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 border-2 border-surface-200 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <p className="text-surface-500 mb-4">No saved hypotheses</p>
              <Link
                href="/hypothesize"
                onClick={onClose}
                className="text-accent hover:text-accent-dim font-medium transition-colors"
              >
                Create your first hypothesis
              </Link>
            </div>
          ) : (
            <div className="space-y-0 -mx-6">
              {hypotheses.map((hypothesis) => (
                <button
                  key={hypothesis.id}
                  type="button"
                  onClick={() => handleSelect(hypothesis)}
                  className="w-full text-left px-6 py-4 hover:bg-surface-50 transition-colors border-b border-surface-200 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="font-medium text-surface-900 flex-1">
                      {hypothesis.title}
                    </h3>
                    {hypothesis.experiment_type && (
                      <span
                        className={`inline-flex items-center px-2 py-1 text-xs font-mono uppercase tracking-wider border flex-shrink-0 ${
                          experimentTypeColors[hypothesis.experiment_type] ||
                          experimentTypeColors.CUSTOM
                        }`}
                      >
                        {experimentTypeLabels[hypothesis.experiment_type] || hypothesis.experiment_type}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-surface-600 mb-2">
                    {truncate(hypothesis.statement, 120)}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-surface-400">
                    <span>{formatDate(hypothesis.created_at)}</span>
                    <span>•</span>
                    <span className="capitalize">{hypothesis.status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Load More */}
        {hasMore && !loading && hypotheses.length > 0 && (
          <div className="border-t border-surface-200 px-6 py-4">
            <button
              type="button"
              onClick={handleLoadMore}
              className="w-full btn-secondary text-sm py-2"
            >
              Load more
            </button>
          </div>
        )}

        {loading && hypotheses.length > 0 && (
          <div className="border-t border-surface-200 px-6 py-4 flex justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent"></div>
          </div>
        )}
      </div>
    </div>
  );
}
