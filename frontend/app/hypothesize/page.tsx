"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Suspense,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  startEdisonRun,
  getEdisonRunStatus,
  getActiveEdisonRun,
  listEdisonRuns,
  updateEdisonRunDraft,
  clearEdisonHistory,
  createExperiment,
  estimateCost,
  getHypothesis,
  ApiError,
  type RateLimitInfo,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatUsd } from "@/lib/format";
import type {
  EdisonJobType,
  EdisonTranslateResponse,
  EdisonIntake,
  EdisonTranslationResult,
  EdisonReasoningTrace,
  EdisonRunSummary,
  HypothesisResponse,
  HypothesisListItem,
} from "@/lib/types";
import { ReasoningTrace } from "@/components/hypothesize/ReasoningTrace";
import { SaveHypothesisButton } from "@/components/SaveHypothesisButton";
import { RecentHypotheses } from "@/components/RecentHypotheses";
import { MIN_HYPOTHESIS_LENGTH } from "@/lib/hypothesisValidation";
import { getExperimentTypeLabel } from "@/lib/experimentTypeLabels";
import { usePaginatedList } from "@/lib/usePaginatedList";

type FlowState =
  | "INITIAL"
  | "PROCESSING"
  | "HYPOTHESIS_REVIEW"
  | "EXPERIMENT_FORM";

interface ChatSession {
  id: string;
  query: string;
  agent: EdisonJobType;
  timestamp: Date;
  experimentType?: string;
}

type TimeGroup = "Today" | "Yesterday" | "Previous 7 days" | "Older";
const timeGroupOrder: TimeGroup[] = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Older",
];

function getTimeGroup(date: Date): TimeGroup {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "Previous 7 days";
  return "Older";
}

function groupByTime(sessions: ChatSession[]): Map<TimeGroup, ChatSession[]> {
  const groups = new Map<TimeGroup, ChatSession[]>();
  for (const session of sessions) {
    const group = getTimeGroup(session.timestamp);
    const existing = groups.get(group);
    if (existing) {
      existing.push(session);
    } else {
      groups.set(group, [session]);
    }
  }
  return groups;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.substring(0, maxLength)}...`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const agentCards: {
  value: EdisonJobType;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    value: "literature",
    label: "Literature",
    description: "Research literature, patents, clinical trials, and more.",
    icon: (
      <svg
        className="h-5 w-5 text-surface-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    value: "analysis",
    label: "Analysis",
    description: "Upload or ask to find public data and do analysis.",
    icon: (
      <svg
        className="h-5 w-5 text-surface-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 3v18h18M7 14l4-4 4 4 5-5"
        />
      </svg>
    ),
  },
  {
    value: "molecules",
    label: "Molecules",
    description: "Design new molecules, predict chemical properties, and more.",
    icon: (
      <svg
        className="h-5 w-5 text-surface-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 3h6m-3 0v4m0 0l5.2 9.1a2 2 0 01-1.74 2.99H8.54a2 2 0 01-1.74-2.99L12 7m0 0H9"
        />
      </svg>
    ),
  },
  {
    value: "precedent",
    label: "Precedent",
    description: 'Use this agent to answer: "has anyone...?"',
    icon: (
      <svg
        className="h-5 w-5 text-surface-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M11 4a7 7 0 015.27 11.59l3.07 3.07-1.41 1.41-3.07-3.07A7 7 0 1111 4z"
        />
      </svg>
    ),
  },
];

const sidebarItems = [
  {
    label: "Docs",
    icon: (
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
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    label: "Feedback",
    icon: (
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
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
  {
    label: "Data Storage",
    icon: (
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
          d="M4 6c0-1.105 3.582-2 8-2s8 .895 8 2-3.582 2-8 2-8-.895-8-2zm16 4c0 1.105-3.582 2-8 2s-8-.895-8-2m16 4c0 1.105-3.582 2-8 2s-8-.895-8-2"
        />
      </svg>
    ),
  },
  {
    label: "Theme",
    icon: (
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
          d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414m0-11.314 1.414 1.414m10.9 10.9 1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z"
        />
      </svg>
    ),
  },
  {
    label: "Account",
    icon: (
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
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20a7.5 7.5 0 0115 0"
        />
      </svg>
    ),
  },
];

const chatHistoryPageSize = 20;
const edisonEditsPersistDelayMs = 300;
const edisonRunPollIntervalMs = 3000;

interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
}

interface ExperimentForm {
  title: string;
  hypothesis_statement: string;
  hypothesis_null: string;
  budget_max_usd: number;
  bsl_level: "BSL1" | "BSL2";
  privacy: string;
  notes: string;
}

const buildFallbackEdisonResponse = (
  hypothesis: HypothesisResponse,
): EdisonTranslateResponse => {
  const experimentType = hypothesis.experiment_type || "CUSTOM";

  return {
    success: true,
    experiment_type: experimentType,
    intake: {
      experiment_type: experimentType,
      title: hypothesis.title || "Untitled Hypothesis",
      hypothesis: {
        statement: hypothesis.statement,
        null_hypothesis: hypothesis.null_hypothesis ?? undefined,
      },
      compliance: {
        bsl: "BSL1",
      },
    },
    suggestions: [],
    warnings: [],
  };
};

function HypothesizePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const continueId = useMemo(
    () => new URLSearchParams(searchKey).get("continue"),
    [searchKey],
  );
  const { isAuthenticated, authChecked } = useAuth();

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const historySentinelRef = useRef<HTMLDivElement>(null);
  const loadHistoryPage = useCallback(
    async (cursorParam?: string) => {
      const response = await listEdisonRuns({
        status: "completed",
        limit: chatHistoryPageSize,
        cursor: cursorParam,
      });
      return {
        items: response.runs.map((run) => ({
          id: run.run_id,
          query: run.query,
          agent: run.job_type,
          timestamp: new Date(run.started_at),
          experimentType: run.experiment_type,
        })),
        cursor: response.pagination?.cursor,
        hasMore: response.pagination?.has_more ?? false,
      };
    },
    [],
  );
  const {
    items: chatHistory,
    status: historyStatus,
    hasMore: historyHasMore,
    loadInitial: loadHistory,
    loadMore: loadMoreHistory,
    reset: resetHistory,
    updateItems: updateChatHistory,
  } = usePaginatedList<ChatSession>({
    loadPage: loadHistoryPage,
    getErrorMessage: () => "Failed to load history",
  });

  const isHistoryLoading = historyStatus === "loading";
  const isHistoryLoadingMore = historyStatus === "loadingMore";

  // Flow state
  const [flowState, setFlowState] = useState<FlowState>("INITIAL");

  // Data state
  const [selectedAgent, setSelectedAgent] =
    useState<EdisonJobType>("literature");
  const [query, setQuery] = useState("");
  const [edisonResponse, setEdisonResponse] =
    useState<EdisonTranslateResponse | null>(null);
  const [edisonRunId, setEdisonRunId] = useState<string | null>(null);
  const [edisonRunInfo, setEdisonRunInfo] = useState<EdisonRunSummary | null>(
    null,
  );
  const [reasoningTrace, setReasoningTrace] =
    useState<EdisonReasoningTrace | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(
    null,
  );
  const [intakeId, setIntakeId] = useState<string | null>(null);

  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Editable hypothesis
  const [editedHypothesis, setEditedHypothesis] = useState("");
  const [editedNullHypothesis, setEditedNullHypothesis] = useState("");

  // Cost estimate
  const [estimate, setEstimate] = useState<{
    low: number;
    typical: number;
    high: number;
  } | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

  // Protocol preview
  const [showProtocol, setShowProtocol] = useState(false);

  const experimentForm = useForm<ExperimentForm>({
    defaultValues: {
      title: "",
      hypothesis_statement: "",
      hypothesis_null: "",
      budget_max_usd: 500,
      bsl_level: "BSL1",
      privacy: "open",
      notes: "",
    },
  });

  // Auth check
  useEffect(() => {
    if (!authChecked) {
      return;
    }
    if (!isAuthenticated()) {
      router.push("/login");
    }
  }, [authChecked, isAuthenticated, router]);

  // Handle ?continue={id} URL parameter
  useEffect(() => {
    if (!authChecked || !isAuthenticated()) {
      return;
    }
    if (!continueId) return;

    const loadHypothesis = async () => {
      try {
        setLoading(true);
        setError("");
        const hypothesis = await getHypothesis(continueId);

        // Reconstruct EdisonTranslateResponse if we have valid Edison data
        if (hypothesis.edison_response && hypothesis.intake_draft) {
          setEdisonResponse(hypothesis.edison_response);
          setEditedHypothesis(hypothesis.statement);
          setEditedNullHypothesis(hypothesis.null_hypothesis || "");
          setFlowState("HYPOTHESIS_REVIEW");
          return;
        }

        const fallbackResponse = buildFallbackEdisonResponse(hypothesis);
        setEdisonResponse(fallbackResponse);
        setEditedHypothesis(hypothesis.statement);
        setEditedNullHypothesis(hypothesis.null_hypothesis || "");
        setFlowState("HYPOTHESIS_REVIEW");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load hypothesis",
        );
        setFlowState("INITIAL");
      } finally {
        setLoading(false);
      }
    };

    loadHypothesis();
  }, [authChecked, continueId, isAuthenticated]);

  // Load chat history from server
  useEffect(() => {
    if (!authChecked || !isAuthenticated()) {
      return;
    }
    resetHistory();
    void loadHistory();
  }, [authChecked, isAuthenticated, loadHistory, resetHistory, searchKey]);
  
  // Load more history on scroll

  // Intersection observer for history infinite scroll
  useEffect(() => {
    if (
      !historyHasMore ||
      isHistoryLoading ||
      isHistoryLoadingMore ||
      historyStatus === "error"
    )
      return;

    const sentinel = historySentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void loadMoreHistory();
        }
      },
      { rootMargin: "100px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    historyHasMore,
    isHistoryLoading,
    isHistoryLoadingMore,
    loadMoreHistory,
    historyStatus,
  ]);

  // Load active Edison run from server (SSOT), fall back to latest completed run
  useEffect(() => {
    if (!authChecked || !isAuthenticated()) {
      return;
    }
    if (continueId) {
      return;
    }

    let cancelled = false;

    const loadFromServer = async () => {
      const activeRun = await getActiveEdisonRun();
      if (cancelled) return;
      if (activeRun) {
        setEdisonRunId(activeRun.run_id);
        setEdisonRunInfo(activeRun);
        setQuery(activeRun.query);
        setSelectedAgent(activeRun.job_type);
        if (activeRun.draft?.hypothesis !== undefined) {
          setEditedHypothesis(activeRun.draft.hypothesis ?? "");
        }
        if (activeRun.draft?.null_hypothesis !== undefined) {
          setEditedNullHypothesis(activeRun.draft.null_hypothesis ?? "");
        }
        if (activeRun.draft?.intake_id !== undefined) {
          setIntakeId(activeRun.draft.intake_id ?? null);
        }
        setFlowState("PROCESSING");
        return;
      }

      const listResponse = await listEdisonRuns({
        status: "completed",
        limit: 1,
      });
      if (cancelled) return;
      const latest = listResponse.runs[0];
      if (!latest) return;

      setEdisonRunId(latest.run_id);
      setEdisonRunInfo(latest);
      setQuery(latest.query);
      setSelectedAgent(latest.job_type);

      const statusResponse = await getEdisonRunStatus(latest.run_id);
      if (cancelled) return;
      if (statusResponse.result) {
        setEdisonResponse(statusResponse.result);
        setEditedHypothesis(
          statusResponse.draft?.hypothesis ??
            statusResponse.result.intake.hypothesis.statement ??
            "",
        );
        setEditedNullHypothesis(
          statusResponse.draft?.null_hypothesis ??
            statusResponse.result.intake.hypothesis.null_hypothesis ??
            "",
        );
        setIntakeId(statusResponse.draft?.intake_id ?? null);
        setFlowState("HYPOTHESIS_REVIEW");
      }
    };

    loadFromServer().catch((err) => {
      if (cancelled) return;
      setError(
        err instanceof Error ? err.message : "Failed to load Edison history",
      );
    });

    return () => {
      cancelled = true;
    };
  }, [authChecked, continueId, isAuthenticated, searchKey]);

  // Persist edits with debounce (server)
  useEffect(() => {
    if (!edisonResponse || !edisonRunId) {
      return;
    }

    const timeoutId = setTimeout(() => {
      updateEdisonRunDraft(edisonRunId, {
        hypothesis: editedHypothesis,
        null_hypothesis: editedNullHypothesis,
        intake_id: intakeId ?? undefined,
      }).catch((err) => {
        if (err instanceof ApiError) {
          setRateLimitInfo(err.rateLimit ?? null);
        }
        setError(err instanceof Error ? err.message : "Failed to save edits");
      });
    }, edisonEditsPersistDelayMs);

    return () => clearTimeout(timeoutId);
  }, [
    edisonResponse,
    edisonRunId,
    editedHypothesis,
    editedNullHypothesis,
    intakeId,
  ]);

  // Update cost estimate when we have experiment type
  useEffect(() => {
    if (!edisonResponse?.experiment_type) {
      setEstimate(null);
      setEstimateError(null);
      return;
    }

    const controller = new AbortController();
    setEstimateLoading(true);
    setEstimateError(null);
    setRateLimitInfo(null);

    estimateCost(
      { experiment_type: edisonResponse.experiment_type },
      { signal: controller.signal },
    )
      .then((data) => setEstimate(data.estimated_cost_usd))
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setEstimate(null);
        setEstimateError(
          err instanceof Error ? err.message : "Failed to estimate cost",
        );
        if (err instanceof ApiError) {
          setRateLimitInfo(err.rateLimit ?? null);
        }
      })
      .finally(() => {
        if (controller.signal.aborted) {
          return;
        }
        setEstimateLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [edisonResponse?.experiment_type]);

  const addChatHistorySession = useCallback(
    (session: ChatSession) => {
      updateChatHistory((prev) => [session, ...prev]);
    },
    [updateChatHistory],
  );

  const handleHistorySelect = useCallback(async (session: ChatSession) => {
    setError("");
    setEdisonRunId(session.id);
    setQuery(session.query);
    setSelectedAgent(session.agent);

    try {
      const statusResponse = await getEdisonRunStatus(session.id);
      if (!statusResponse.result) {
        const message =
          statusResponse.status === "failed"
            ? statusResponse.error || "Edison run failed"
            : statusResponse.status === "completed"
              ? "Edison run completed without a result"
              : "Edison run is not ready yet";
        setError(message);
        setFlowState("INITIAL");
        setEdisonResponse(null);
        setEditedHypothesis("");
        setEditedNullHypothesis("");
        setIntakeId(null);
        setEdisonRunId(null);
        setEdisonRunInfo(null);
        setReasoningTrace(null);
        return;
      }
      setEdisonResponse(statusResponse.result);
      setEditedHypothesis(
        statusResponse.draft?.hypothesis ??
          statusResponse.result.intake.hypothesis.statement ??
          "",
      );
      setEditedNullHypothesis(
        statusResponse.draft?.null_hypothesis ??
          statusResponse.result.intake.hypothesis.null_hypothesis ??
          "",
      );
      setIntakeId(statusResponse.draft?.intake_id ?? null);
      setFlowState("HYPOTHESIS_REVIEW");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load saved hypothesis",
      );
      setFlowState("INITIAL");
      setEdisonResponse(null);
      setEditedHypothesis("");
      setEditedNullHypothesis("");
      setIntakeId(null);
      setEdisonRunId(null);
      setEdisonRunInfo(null);
      setReasoningTrace(null);
    }
  }, []);

  // Poll Edison run status while processing
  useEffect(() => {
    if (!edisonRunId || flowState !== "PROCESSING") return;

    let cancelled = false;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const pollStatus = () => {
      getEdisonRunStatus(edisonRunId)
        .then((status) => {
          if (cancelled) return;
          // Update reasoning trace if available
          if (status.reasoning_trace) {
            setReasoningTrace(status.reasoning_trace);
          }

          if (status.status === "completed") {
            if (!status.result) {
              setError("Edison run completed without a result");
              setFlowState("INITIAL");
              setEdisonRunInfo(null);
              setReasoningTrace(null);
              return;
            }

            setEdisonResponse(status.result);

            const intake = status.result.intake;
            setEditedHypothesis(
              status.draft?.hypothesis ?? intake.hypothesis.statement ?? "",
            );
            setEditedNullHypothesis(
              status.draft?.null_hypothesis ??
                intake.hypothesis.null_hypothesis ??
                "",
            );
            setIntakeId(status.draft?.intake_id ?? null);

            if (edisonRunInfo) {
              const newSession: ChatSession = {
                id: edisonRunId,
                query: edisonRunInfo.query,
                agent: edisonRunInfo.job_type,
                timestamp: new Date(edisonRunInfo.started_at),
                experimentType: status.result.experiment_type,
              };
              addChatHistorySession(newSession);
            }

            setFlowState("HYPOTHESIS_REVIEW");
            setEdisonRunInfo(null);
            setReasoningTrace(null);
            return;
          }

          if (status.status === "failed") {
            setError(status.error || "Edison run failed");
            setFlowState("INITIAL");
            setEdisonRunId(null);
            setEdisonRunInfo(null);
            setReasoningTrace(null);
            return;
          }

          if (!cancelled) {
            pollTimeoutId = setTimeout(pollStatus, edisonRunPollIntervalMs);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ApiError) {
            setRateLimitInfo(err.rateLimit ?? null);
          }
          setError(
            err instanceof Error
              ? err.message
              : "Failed to fetch Edison status",
          );
          setFlowState("INITIAL");
          setEdisonRunId(null);
          setEdisonRunInfo(null);
          setReasoningTrace(null);
        });
    };

    pollStatus();

    return () => {
      cancelled = true;
      if (pollTimeoutId !== null) {
        clearTimeout(pollTimeoutId);
      }
    };
  }, [edisonRunId, edisonRunInfo, addChatHistorySession, flowState]);

  // File drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const newFiles: UploadedFile[] = files.map((f) => ({
      file: f,
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    setUploadedFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files);
        const newFiles: UploadedFile[] = files.map((f) => ({
          file: f,
          name: f.name,
          size: f.size,
          type: f.type,
        }));
        setUploadedFiles((prev) => [...prev, ...newFiles]);
      }
    },
    [],
  );

  const removeFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  const clearHistory = useCallback(() => {
    clearEdisonHistory()
      .then((result) => {
        if (result.success) {
          resetHistory();
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to clear history",
        );
      });
  }, [resetHistory]);

  const handleGenerate = useCallback(async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError("Please enter a research query");
      return;
    }

    setError("");
    setRateLimitInfo(null);
    setEdisonRunId(null);
    setEdisonRunInfo(null);
    setFlowState("PROCESSING");
    setEdisonResponse(null);
    setEditedHypothesis("");
    setEditedNullHypothesis("");
    setIntakeId(null);
    setEstimate(null);
    setEstimateError(null);
    setReasoningTrace(null);

    try {
      const result = await startEdisonRun({
        query: trimmedQuery,
        job_type: selectedAgent,
        files: uploadedFiles.map((file) => file.file),
      });

      setEdisonRunId(result.run_id);
      setIntakeId(result.intake_id);
      setEdisonRunInfo({
        run_id: result.run_id,
        status: result.status,
        query: trimmedQuery,
        job_type: selectedAgent,
        started_at: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setRateLimitInfo(err.rateLimit ?? null);
      }
      setError(
        err instanceof Error ? err.message : "Failed to generate hypothesis",
      );
      setFlowState("INITIAL");
    }
  }, [query, selectedAgent, uploadedFiles]);

  const handleProceedToExperiment = useCallback(() => {
    if (!edisonResponse) return;

    const trimmedHypothesis = editedHypothesis.trim();
    if (trimmedHypothesis.length < MIN_HYPOTHESIS_LENGTH) {
      setError(
        `Hypothesis must be at least ${MIN_HYPOTHESIS_LENGTH} characters`,
      );
      return;
    }

    setError("");

    const intake: EdisonIntake = edisonResponse.intake;
    const title = intake.title || "";
    const compliance = intake.compliance;
    const turnaround = intake.turnaround_budget;
    const metadata = intake.metadata;
    experimentForm.reset({
      title,
      hypothesis_statement: editedHypothesis,
      hypothesis_null: editedNullHypothesis,
      budget_max_usd: turnaround?.budget_max_usd || 500,
      bsl_level: compliance?.bsl || "BSL1",
      privacy: intake.privacy || "open",
      notes: metadata?.notes || "",
    });

    setFlowState("EXPERIMENT_FORM");
  }, [edisonResponse, editedHypothesis, editedNullHypothesis, experimentForm]);

  const handleSubmitExperiment = useCallback(
    async (data: ExperimentForm) => {
      if (!edisonResponse) return;

      setLoading(true);
      setError("");
      setRateLimitInfo(null);

      try {
        const intake: EdisonIntake = edisonResponse.intake;
        const privacy =
          data.privacy === "confidential" ? "private" : data.privacy;
        const deliverables = intake.deliverables ?? {
          minimum_package_level: "L1_BASIC_QC",
        };
        const payload = {
          ...intake,
          experiment_type: edisonResponse.experiment_type,
          title: data.title,
          hypothesis: {
            ...intake.hypothesis,
            statement: data.hypothesis_statement,
            null_hypothesis: data.hypothesis_null,
          },
          turnaround_budget: {
            ...intake.turnaround_budget,
            budget_max_usd: data.budget_max_usd,
          },
          deliverables,
          compliance: {
            ...intake.compliance,
            bsl: data.bsl_level,
          },
          privacy,
          metadata: {
            ...intake.metadata,
            notes: data.notes,
            edison_generated: true,
            ...(intakeId ? { intake_id: intakeId } : {}),
          },
        };

        const result = await createExperiment(payload);
        router.push(`/experiments/${result.experiment_id}`);
      } catch (err) {
        if (err instanceof ApiError) {
          setRateLimitInfo(err.rateLimit ?? null);
        }
        setError(
          err instanceof Error ? err.message : "Failed to create experiment",
        );
      } finally {
        setLoading(false);
      }
    },
    [edisonResponse, intakeId, router],
  );

  const handleStartOver = useCallback(() => {
    setFlowState("INITIAL");
    setEdisonResponse(null);
    setEditedHypothesis("");
    setEditedNullHypothesis("");
    setError("");
    setRateLimitInfo(null);
    setEstimate(null);
    setEstimateError(null);
    setQuery("");
    setUploadedFiles([]);
    setIntakeId(null);
    setEdisonRunId(null);
    setEdisonRunInfo(null);
    experimentForm.reset();
  }, [experimentForm]);

  const charCount = query.length;
  const selectedAgentCard = agentCards.find(
    (agent) => agent.value === selectedAgent,
  );
  const overlayTabIndex = sidebarOpen ? undefined : -1;
  const groupedHistory = useMemo(
    () => groupByTime(chatHistory),
    [chatHistory],
  );

  // Get confidence color based on intake - memoized
  const confidenceBadge = useMemo(() => {
    if (!edisonResponse?.intake) return null;
    const intake = edisonResponse.intake;
    const confidence = intake.metadata?.confidence ?? 0.7;

    if (confidence >= 0.8) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-mono uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
          High Confidence
        </span>
      );
    } else if (confidence >= 0.5) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-mono uppercase tracking-wider bg-accent-50 text-accent-700 border border-accent-200">
          Medium Confidence
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-mono uppercase tracking-wider bg-surface-100 text-surface-600 border border-surface-200">
          Low Confidence
        </span>
      );
    }
  }, [edisonResponse?.intake]);

  const rateLimitSummary = useMemo(() => {
    if (!rateLimitInfo) return null;
    const remaining = rateLimitInfo.remaining ?? "?";
    const limit = rateLimitInfo.limit ?? "?";
    const reset = rateLimitInfo.reset ? ` · Reset: ${rateLimitInfo.reset}` : "";
    return `Rate limit: ${remaining}/${limit} remaining${reset}`;
  }, [rateLimitInfo]);

  return (
    <div className="relative min-h-screen">
      {/* Sidebar Rail - fixed to viewport, above navbar */}
      <aside className="fixed left-0 inset-y-0 z-[60] w-20 bg-surface-100 border-r border-surface-200 flex flex-col">
        <div className="p-4 flex items-center justify-between">
          <div className="w-9 h-9 bg-surface-900 flex items-center justify-center">
            <span className="text-accent font-display text-lg">L</span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="text-surface-400 hover:text-surface-600 transition-colors"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </button>
        </div>

        <div className="mt-auto border-t border-surface-200 px-2 py-3 space-y-1">
          {sidebarItems.map((item) => (
            <button
              key={item.label}
              type="button"
              title={item.label}
              aria-label={item.label}
              className="w-full flex items-center justify-center py-2 text-surface-500 hover:text-surface-700 hover:bg-surface-200 rounded transition-colors"
            >
              {item.icon}
            </button>
          ))}
        </div>
      </aside>

      {/* Overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/10"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sliding Sidebar Panel - fixed to viewport, above navbar */}
      <aside
        className={`fixed left-0 inset-y-0 z-[60] w-72 bg-[#f7f7f7] border-r border-black/[0.06] flex flex-col transition-transform duration-150 ease-out motion-reduce:transition-none ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full pointer-events-none"
        }`}
        aria-hidden={!sidebarOpen}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="w-8 h-8 bg-surface-900 flex items-center justify-center">
            <span className="text-accent font-display text-base">L</span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="text-surface-400 hover:text-surface-600 transition-colors p-1"
            aria-label="Collapse sidebar"
            tabIndex={overlayTabIndex}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* New Hypothesis Button */}
        <div className="px-3 pb-4">
          <button
            type="button"
            onClick={() => {
              handleStartOver();
              if (searchParams.get("continue")) {
                router.replace("/hypothesize");
              }
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-600 hover:text-surface-900 hover:bg-black/[0.04] rounded-md transition-colors"
            tabIndex={overlayTabIndex}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
            New hypothesis
          </button>
        </div>

        {/* Saved Section */}
        <div className="px-4 pb-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-surface-400">
            Saved
          </span>
        </div>
        <div className="px-2 pb-3">
          <RecentHypotheses
            onSelect={(hypothesis: HypothesisListItem) => {
              router.push(`/hypothesize?continue=${hypothesis.id}`);
            }}
            onDelete={() => {}}
            pageSize={10}
          />
        </div>

        {/* Divider */}
        <div className="mx-3 border-t border-black/[0.06]" />

        {/* History Section */}
        <div className="flex-1 overflow-y-auto">
          {chatHistory.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-6">
              No history yet
            </p>
          ) : (
            <div className="py-2">
              {timeGroupOrder.map((group) => {
                const sessions = groupedHistory.get(group);
                if (!sessions || sessions.length === 0) return null;
                return (
                  <div key={group} className="mb-2">
                    <div className="px-4 py-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-surface-400">
                        {group}
                      </span>
                    </div>
                    <div className="px-2 space-y-0.5">
                      {sessions.map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => handleHistorySelect(session)}
                          className={`w-full text-left px-3 py-2 rounded transition-colors ${
                            edisonRunId === session.id
                              ? "bg-black/[0.06]"
                              : "hover:bg-black/[0.04]"
                          }`}
                          tabIndex={overlayTabIndex}
                        >
                          <p className="text-sm text-surface-700 truncate">
                            {truncateText(session.query, 100)}
                          </p>
                          <p className="text-xs text-surface-400 mt-0.5">
                            {
                              agentCards.find(
                                (a) => a.value === session.agent,
                              )?.label
                            }
                            {group === "Today" &&
                              ` · ${formatTime(session.timestamp)}`}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Sentinel for infinite scroll */}
              <div ref={historySentinelRef} className="h-1" />

              {/* Loading more indicator */}
              {isHistoryLoadingMore && (
                <div className="flex justify-center py-3">
                  <div className="w-4 h-4 animate-spin rounded-full border-b-2 border-surface-400" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-black/[0.06] px-2 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {sidebarItems.slice(0, 3).map((item) => (
              <button
                key={item.label}
                type="button"
                title={item.label}
                aria-label={item.label}
                className="p-2 text-surface-400 hover:text-surface-600 hover:bg-black/[0.04] rounded transition-colors"
                tabIndex={overlayTabIndex}
              >
                {item.icon}
              </button>
            ))}
          </div>
          {chatHistory.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              title="Clear history"
              className="p-2 text-surface-400 hover:text-red-500 hover:bg-black/[0.04] rounded transition-colors"
              tabIndex={overlayTabIndex}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content - offset by fixed sidebar rail width */}
      <div className="ml-20 min-h-screen overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-display text-surface-900">
                  Hypothesize
                </h1>
                <p className="text-sm text-surface-500 mt-1">
                  An AI scientist for complex questions.
                </p>
                <a
                  href="https://platform.edisonscientific.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-xs text-surface-400 hover:text-surface-600 transition-colors group"
                >
                  <span className="font-mono uppercase tracking-wide">
                    Powered by
                  </span>
                  <span className="font-medium text-surface-500 group-hover:text-accent transition-colors">
                    Edison Scientific
                  </span>
                  <svg
                    className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono uppercase tracking-wide text-surface-400">
                  Credits: <span className="text-surface-700">∞</span>
                </span>
                <button type="button" className="btn-primary text-xs px-4 py-2">
                  Get more
                </button>
              </div>
            </div>
          </div>

          {/* INITIAL: Query Input (Edison-style layout) */}
          {flowState === "INITIAL" && (
            <div className="space-y-6">
              {/* Main Query Card */}
              <div className="bg-surface-100 border border-surface-200 rounded-2xl p-6 space-y-6">
                {error && (
                  <div className="alert-error mb-6">
                    <div className="flex justify-between items-start">
                      <span>{error}</span>
                      <button
                        type="button"
                        onClick={() => setError("")}
                        className="text-red-500 hover:text-red-700 ml-4"
                        aria-label="Dismiss error"
                      >
                        ×
                      </button>
                    </div>
                    {rateLimitSummary && (
                      <p className="mt-2 text-xs font-mono text-surface-500">
                        {rateLimitSummary}
                      </p>
                    )}
                  </div>
                )}

                {/* Query Textarea */}
                <div className="relative">
                  <label
                    htmlFor="hypothesize-query"
                    className="text-xs font-mono uppercase tracking-wide text-surface-500 mb-2 block"
                  >
                    Research Query
                  </label>
                  <textarea
                    id="hypothesize-query"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        (e.metaKey || e.ctrlKey) &&
                        e.key === "Enter" &&
                        query.trim()
                      ) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                    rows={5}
                    maxLength={10000}
                    placeholder='e.g., "What compounds show promise for treating antibiotic-resistant bacteria?"'
                    className="w-full min-h-[160px] resize-none rounded-lg bg-transparent px-4 py-3 pr-20 text-lg text-surface-800 placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-100"
                  />
                  <span
                    className={`absolute right-4 top-10 text-xs font-mono ${charCount > 9000 ? "text-accent" : "text-surface-400"}`}
                  >
                    {charCount.toLocaleString()} / 10,000
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
                  {/* File Upload Area */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border border-dashed rounded-lg p-4 transition-colors ${
                      isDragging
                        ? "border-accent bg-accent-50"
                        : "border-surface-300 bg-surface-50/50 hover:border-surface-400 hover:bg-surface-50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-white rounded border border-surface-200">
                        <svg
                          className="w-5 h-5 text-surface-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                          />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <label className="cursor-pointer">
                          <span className="text-sm text-surface-600">
                            Attach files
                          </span>
                          <span className="text-xs text-surface-400 ml-1">
                            (optional)
                          </span>
                          <input
                            type="file"
                            multiple
                            onChange={handleFileSelect}
                            className="hidden"
                            accept=".pdf,.doc,.docx,.txt,.csv,.png,.jpg,.jpeg"
                          />
                        </label>
                        <p className="text-[10px] text-surface-400 font-mono mt-0.5">
                          PDF, DOC, CSV, images · Max 15GB
                        </p>
                      </div>
                    </div>

                    {/* Uploaded Files List */}
                    {uploadedFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {uploadedFiles.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between bg-white border border-surface-200 p-2 rounded"
                          >
                            <div className="flex items-center gap-2">
                              <svg
                                className="w-4 h-4 text-surface-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                              <span className="text-sm text-surface-700 truncate max-w-[200px]">
                                {file.name}
                              </span>
                              <span className="text-xs text-surface-400">
                                {formatFileSize(file.size)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="text-surface-400 hover:text-red-500 transition-colors"
                              aria-label={`Remove ${file.name}`}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Agent + Start */}
                  <div className="border border-surface-200 bg-surface-50 rounded-lg p-4 flex flex-col justify-center gap-2 min-h-[88px]">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-mono uppercase tracking-wide text-surface-400">
                          Agent
                        </span>
                        <p className="text-sm font-medium text-surface-800 mt-0.5">
                          {selectedAgentCard?.label || "Literature"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={!query.trim()}
                        className="btn-primary px-5 py-2.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                      >
                        <span>Start</span>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-surface-400 text-right">
                      ⌘ + Enter
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-surface-500 text-center">
                New to Edison Scientific? Check out our{" "}
                <button
                  type="button"
                  onClick={() => router.push("/templates")}
                  className="underline decoration-surface-400 hover:text-surface-700 transition-colors"
                >
                  Best Practices Guide
                </button>{" "}
                or{" "}
                <button
                  type="button"
                  onClick={() => router.push("/templates")}
                  className="underline decoration-surface-400 hover:text-surface-700 transition-colors"
                >
                  Example Queries
                </button>
              </p>

              {/* Agent Cards */}
              <div>
                <p className="text-xs font-mono font-medium uppercase tracking-wide text-surface-500 mb-4">
                  Other Edison Agents
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {agentCards.map((agent) => (
                    <button
                      key={agent.value}
                      type="button"
                      onClick={() => setSelectedAgent(agent.value)}
                      aria-pressed={selectedAgent === agent.value}
                      className={`p-4 text-left transition-colors duration-100 border rounded-xl min-h-[120px] flex flex-col ${
                        selectedAgent === agent.value
                          ? "border-accent bg-white shadow-sm"
                          : "border-surface-200 bg-surface-100 hover:border-surface-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="mb-3 flex-shrink-0">{agent.icon}</div>
                      <div className="text-sm font-medium text-surface-900 mb-1">
                        {agent.label}
                      </div>
                      <div className="text-xs text-surface-500 leading-relaxed">
                        {agent.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PROCESSING: Reasoning Trace / Loading State */}
          {flowState === "PROCESSING" && (
            <div className="space-y-4">
              {/* Query summary */}
              {edisonRunInfo && (
                <div className="bg-surface-50 border border-surface-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 text-accent-600">
                      {
                        agentCards.find(
                          (a) => a.value === edisonRunInfo.job_type,
                        )?.icon
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono uppercase tracking-wider text-surface-500 mb-1">
                        {agentCards.find(
                          (a) => a.value === edisonRunInfo.job_type,
                        )?.label || edisonRunInfo.job_type}
                      </p>
                      <p className="text-sm text-surface-700 truncate">
                        {edisonRunInfo.query}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFlowState("INITIAL");
                        setEdisonRunId(null);
                        setEdisonRunInfo(null);
                        setReasoningTrace(null);
                      }}
                      className="text-xs text-surface-400 hover:text-surface-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Reasoning Trace component */}
              <ReasoningTrace trace={reasoningTrace} isLoading={true} />
            </div>
          )}

          {/* HYPOTHESIS_REVIEW: Show & Edit Hypothesis */}
          {flowState === "HYPOTHESIS_REVIEW" && edisonResponse && (
            <div className="space-y-6">
              <div className="card p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="font-mono text-xs uppercase tracking-wide text-surface-500">
                      Experiment Type
                    </span>
                    <p className="text-lg font-medium text-surface-900">
                      {getExperimentTypeLabel(edisonResponse.experiment_type)}
                    </p>
                  </div>
                  {confidenceBadge}
                </div>

                {error && (
                  <div className="alert-error mb-6">
                    {error}
                    {rateLimitSummary && (
                      <p className="mt-2 text-xs font-mono text-surface-500">
                        {rateLimitSummary}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <label className="form-label">Hypothesis Statement</label>
                    <textarea
                      value={editedHypothesis}
                      onChange={(e) => setEditedHypothesis(e.target.value)}
                      rows={3}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="form-label">Null Hypothesis</label>
                    <textarea
                      value={editedNullHypothesis}
                      onChange={(e) => setEditedNullHypothesis(e.target.value)}
                      rows={3}
                      className="input"
                    />
                  </div>

                  {/* Edison Insights */}
                  {(edisonResponse.suggestions.length > 0 ||
                    edisonResponse.warnings.length > 0) && (
                    <div className="bg-surface-50 border-l-2 border-accent p-4 space-y-4">
                      <p className="font-mono text-xs uppercase tracking-wide text-surface-600">
                        Edison Insights
                      </p>

                      {edisonResponse.suggestions.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-surface-700 mb-2">
                            Suggestions:
                          </p>
                          <ul className="text-sm text-surface-600 space-y-1">
                            {edisonResponse.suggestions.map((s, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-emerald-600">+</span>
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {edisonResponse.warnings.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-surface-700 mb-2">
                            Warnings:
                          </p>
                          <ul className="text-sm text-surface-600 space-y-1">
                            {edisonResponse.warnings.map((w, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-amber-600">!</span>
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-6 mt-6 border-t border-surface-200">
                  <button
                    type="button"
                    onClick={handleStartOver}
                    className="btn-secondary flex-1 flex items-center justify-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    New Hypothesis
                  </button>

                  <SaveHypothesisButton
                    hypothesis={{
                      title:
                        edisonResponse.intake?.title || "Untitled Hypothesis",
                      statement: editedHypothesis,
                      nullHypothesis: editedNullHypothesis,
                      experimentType: edisonResponse.experiment_type,
                    }}
                    edisonContext={{
                      agent: selectedAgent,
                      query: query,
                      response: edisonResponse,
                      intakeDraft: edisonResponse.intake,
                    }}
                    onSaved={(id) => {
                      console.log("Hypothesis saved with ID:", id);
                    }}
                    className="flex-1"
                  />

                  <button
                    type="button"
                    onClick={handleProceedToExperiment}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 whitespace-nowrap"
                    disabled={
                      editedHypothesis.trim().length < MIN_HYPOTHESIS_LENGTH
                    }
                  >
                    Proceed to Experiment
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* EXPERIMENT_FORM: Pre-filled Experiment Form */}
          {flowState === "EXPERIMENT_FORM" && edisonResponse && (
            <div className="card p-8">
              <div className="mb-6">
                <span className="font-mono text-xs uppercase tracking-wide text-surface-500">
                  Creating Experiment
                </span>
                <p className="text-lg font-medium text-surface-900">
                  {getExperimentTypeLabel(edisonResponse.experiment_type)}
                </p>
              </div>

              <form
                onSubmit={experimentForm.handleSubmit(handleSubmitExperiment)}
                className="space-y-6"
              >
                {error && (
                  <div className="alert-error">
                    {error}
                    {rateLimitSummary && (
                      <p className="mt-2 text-xs font-mono text-surface-500">
                        {rateLimitSummary}
                      </p>
                    )}
                  </div>
                )}

                {estimateLoading && (
                  <div className="bg-surface-50 border border-surface-200 px-4 py-3 flex items-center gap-3">
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-accent"></div>
                    <p className="text-sm text-surface-600">
                      Estimating cost...
                    </p>
                  </div>
                )}

                {estimate && (
                  <div className="bg-accent-50 border-l-2 border-accent px-4 py-3">
                    <p className="text-sm text-surface-700">
                      <span className="font-medium">Estimated cost:</span>{" "}
                      <span className="font-mono">
                        {formatUsd(estimate.low)} - {formatUsd(estimate.high)}
                      </span>{" "}
                      <span className="text-surface-500">
                        (typical: {formatUsd(estimate.typical)})
                      </span>
                    </p>
                  </div>
                )}

                {estimateError && (
                  <div className="alert-error">
                    {estimateError}
                    {rateLimitSummary && (
                      <p className="mt-2 text-xs font-mono text-surface-500">
                        {rateLimitSummary}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="form-label">
                    Title <span className="text-accent">*</span>
                  </label>
                  <input
                    {...experimentForm.register("title", {
                      required: "Title is required",
                    })}
                    type="text"
                    className="input"
                  />
                  {experimentForm.formState.errors.title && (
                    <p className="form-error">
                      {experimentForm.formState.errors.title.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="form-label">
                    Hypothesis Statement <span className="text-accent">*</span>
                  </label>
                  <textarea
                    {...experimentForm.register("hypothesis_statement", {
                      required: "Hypothesis is required",
                      minLength: {
                        value: MIN_HYPOTHESIS_LENGTH,
                        message: `Hypothesis must be at least ${MIN_HYPOTHESIS_LENGTH} characters`,
                      },
                    })}
                    rows={3}
                    className="input"
                  />
                  {experimentForm.formState.errors.hypothesis_statement && (
                    <p className="form-error">
                      {
                        experimentForm.formState.errors.hypothesis_statement
                          .message
                      }
                    </p>
                  )}
                </div>

                <div>
                  <label className="form-label">
                    Null Hypothesis <span className="text-accent">*</span>
                  </label>
                  <textarea
                    {...experimentForm.register("hypothesis_null", {
                      required: "Null hypothesis is required",
                    })}
                    rows={2}
                    className="input"
                  />
                  {experimentForm.formState.errors.hypothesis_null && (
                    <p className="form-error">
                      {experimentForm.formState.errors.hypothesis_null.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="form-label">Maximum Budget (USD)</label>
                    <input
                      {...experimentForm.register("budget_max_usd", {
                        valueAsNumber: true,
                      })}
                      type="number"
                      min="50"
                      max="10000"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="form-label">BSL Level</label>
                    <select
                      {...experimentForm.register("bsl_level")}
                      className="input"
                    >
                      <option value="BSL1">BSL-1</option>
                      <option value="BSL2">BSL-2</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label">Privacy</label>
                  <select
                    {...experimentForm.register("privacy")}
                    className="input"
                  >
                    <option value="open">Open (results may be shared)</option>
                    <option value="confidential">
                      Confidential (NDA required)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Additional Notes</label>
                  <textarea
                    {...experimentForm.register("notes")}
                    rows={2}
                    placeholder="Any additional information for the operator..."
                    className="input"
                  />
                </div>

                {/* Protocol Preview */}
                {edisonResponse.translations && (
                  <div className="border-t border-surface-200 pt-6">
                    <button
                      type="button"
                      onClick={() => setShowProtocol(!showProtocol)}
                      className="flex items-center gap-2 text-sm font-mono uppercase tracking-wide text-surface-600 hover:text-accent transition-colors"
                    >
                      <span>{showProtocol ? "−" : "+"}</span>
                      <span>Protocol Preview</span>
                    </button>

                    {showProtocol && (
                      <div className="mt-4 space-y-3">
                        {Object.entries(edisonResponse.translations).map(
                          ([provider, result]) => {
                            const translation: EdisonTranslationResult = result;
                            return (
                              <div
                                key={provider}
                                className="border border-surface-200 overflow-hidden"
                              >
                                <div className="bg-surface-100 px-4 py-2 flex items-center justify-between">
                                  <span className="text-xs font-mono uppercase tracking-wide text-surface-700">
                                    {provider}{" "}
                                    {translation.format &&
                                      `(${translation.format})`}
                                  </span>
                                  {translation.success !== undefined && (
                                    <span
                                      className={`text-xs font-mono ${translation.success ? "text-emerald-600" : "text-red-600"}`}
                                    >
                                      {translation.success ? "Valid" : "Errors"}
                                    </span>
                                  )}
                                </div>
                                {translation.protocol_readable && (
                                  <pre className="p-4 text-xs font-mono text-surface-600 overflow-x-auto max-h-48 bg-white">
                                    {translation.protocol_readable}
                                  </pre>
                                )}
                              </div>
                            );
                          },
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-4 pt-6">
                  <button
                    type="button"
                    onClick={() => setFlowState("HYPOTHESIS_REVIEW")}
                    className="flex-1 btn-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 btn-primary disabled:opacity-50"
                  >
                    {loading ? "Submitting..." : "Submit to Lab"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HypothesizePage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen">
          <div className="ml-20 min-h-screen overflow-y-auto flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          </div>
        </div>
      }
    >
      <HypothesizePageContent />
    </Suspense>
  );
}
