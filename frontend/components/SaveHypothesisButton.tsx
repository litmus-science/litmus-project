"use client";

import { useState, useCallback } from "react";
import { createHypothesis } from "@/lib/api";

interface SaveHypothesisButtonProps {
  hypothesis: {
    title: string;
    statement: string;
    nullHypothesis: string;
    experimentType: string;
  };
  edisonContext?: {
    agent: string;
    query: string;
    response: Record<string, unknown>;
    intakeDraft: Record<string, unknown>;
  };
  onSaved?: (id: string) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  className?: string;
}

type SaveState = "idle" | "saving" | "success" | "error";

export function SaveHypothesisButton({
  hypothesis,
  edisonContext,
  onSaved,
  onError,
  disabled = false,
  className = "",
}: SaveHypothesisButtonProps) {
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const isValid = hypothesis.statement.length >= 20;
  const isDisabled = disabled || !isValid || saveState === "saving";

  const handleSave = useCallback(async () => {
    if (isDisabled) return;

    setSaveState("saving");

    try {
      const payload = {
        title: hypothesis.title,
        statement: hypothesis.statement,
        null_hypothesis: hypothesis.nullHypothesis,
        experiment_type: hypothesis.experimentType,
        edison_agent: edisonContext?.agent,
        edison_query: edisonContext?.query,
        edison_response: edisonContext?.response,
        intake_draft: edisonContext?.intakeDraft,
      };

      const result = await createHypothesis(payload);
      setSaveState("success");

      if (onSaved) {
        onSaved(result.id);
      }

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveState("idle");
      }, 2000);
    } catch (err) {
      setSaveState("error");
      const error = err instanceof Error ? err : new Error("Failed to save hypothesis");

      if (onError) {
        onError(error);
      }

      // Reset to idle after 3 seconds
      setTimeout(() => {
        setSaveState("idle");
      }, 3000);
    }
  }, [hypothesis, edisonContext, onSaved, onError, isDisabled]);

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={isDisabled}
      className={`btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      aria-label={
        !isValid
          ? "Hypothesis must be at least 20 characters"
          : saveState === "saving"
          ? "Saving hypothesis..."
          : saveState === "success"
          ? "Hypothesis saved successfully"
          : "Save hypothesis as draft"
      }
    >
      {saveState === "saving" ? (
        <>
          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-surface-600" />
          <span>Saving...</span>
        </>
      ) : saveState === "success" ? (
        <>
          <svg
            className="h-4 w-4 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span>Saved</span>
        </>
      ) : (
        <>
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
          <span>Save Draft</span>
        </>
      )}
    </button>
  );
}
