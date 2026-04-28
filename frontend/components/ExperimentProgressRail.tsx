"use client";

import Link from "next/link";

type Step = "detail" | "matching" | "lab-packet" | "review" | "results";

interface ExperimentProgressRailProps {
  experimentId: string;
  currentStep: Step;
  /** Optional experiment status — used to keep completed checkmarks when navigating backwards */
  experimentStatus?: string;
}


const STEPS: { key: Step; label: string; href: (id: string) => string }[] = [
  { key: "detail",   label: "Protocol", href: (id) => `/experiments/${id}` },
  { key: "matching", label: "Send",     href: (id) => `/experiments/${id}/matching` },
  { key: "review",   label: "Review",   href: (id) => `/experiments/${id}/review` },
  { key: "results",  label: "Results",  href: (id) => `/experiments/${id}/results` },
];

/** Maps experiment status → the index of the step the workflow has reached.
 *  Returns -1 for draft/unknown (fall back to currentIndex). */
function statusToWorkflowIndex(status?: string): number {
  if (!status) return -1;
  if (status === "completed")                                return STEPS.length; // all done
  if (status === "in_progress")                             return 2; // on Review
  if (status === "claimed" || status === "design_finalized") return 2; // on Review
  if (status === "open")                                    return 2; // on Review
  return -1; // draft / pending_review — use currentStep as floor
}

export function ExperimentProgressRail({
  experimentId,
  currentStep,
  experimentStatus,
}: ExperimentProgressRailProps) {
  const currentIndex  = STEPS.findIndex((s) => s.key === currentStep);
  const workflowIndex = statusToWorkflowIndex(experimentStatus);
  // Checkmarks reflect the furthest step reached, regardless of which page is open
  const completedFloor = Math.max(currentIndex, workflowIndex);

  return (
    <div className="sticky top-14 z-40 bg-white border-b border-surface-200">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        <nav className="flex items-center h-11 gap-0.5">
          {STEPS.map((step, i) => {
            const isCurrent   = step.key === currentStep;
            const isCompleted = i < completedFloor;

            return (
              <div key={step.key} className="flex items-center gap-0.5">
                {i > 0 && (
                  <svg
                    className="w-3 h-3 text-surface-300 flex-shrink-0 mx-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
                <Link
                  href={step.href(experimentId)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    isCurrent
                      ? "bg-accent/10 text-accent"
                      : isCompleted
                      ? "text-surface-600 hover:text-surface-900 hover:bg-surface-100"
                      : "text-surface-400 hover:text-surface-600 hover:bg-surface-50"
                  }`}
                >
                  {isCompleted ? (
                    <svg
                      className="w-3 h-3 text-accent flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                        isCurrent
                          ? "border-accent text-accent"
                          : "border-surface-300 text-surface-400"
                      }`}
                    >
                      {i + 1}
                    </span>
                  )}
                  {step.label}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
