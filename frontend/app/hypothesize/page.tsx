"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { generateHypothesis, createExperiment, estimateCost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatUsd } from "@/lib/format";
import type { EdisonJobType, EdisonTranslateResponse } from "@/lib/types";

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

const agentCards: { value: EdisonJobType; label: string; description: string; icon: ReactNode }[] = [
  {
    value: "literature",
    label: "Literature",
    description: "Research literature, patents, clinical trials, and more.",
    icon: (
      <svg className="h-5 w-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    )
  },
  {
    value: "analysis",
    label: "Analysis",
    description: "Upload or ask to find public data and do analysis.",
    icon: (
      <svg className="h-5 w-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3v18h18M7 14l4-4 4 4 5-5" />
      </svg>
    )
  },
  {
    value: "molecules",
    label: "Molecules",
    description: "Design new molecules, predict chemical properties, and more.",
    icon: (
      <svg className="h-5 w-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3h6m-3 0v4m0 0l5.2 9.1a2 2 0 01-1.74 2.99H8.54a2 2 0 01-1.74-2.99L12 7m0 0H9" />
      </svg>
    )
  },
  {
    value: "precedent",
    label: "Precedent",
    description: "Use this agent to answer: \"has anyone...?\"",
    icon: (
      <svg className="h-5 w-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a7 7 0 015.27 11.59l3.07 3.07-1.41 1.41-3.07-3.07A7 7 0 1111 4z" />
      </svg>
    )
  },
];

const sidebarItems = [
  {
    label: "Docs",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    label: "Feedback",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    label: "Data Storage",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6c0-1.105 3.582-2 8-2s8 .895 8 2-3.582 2-8 2-8-.895-8-2zm16 4c0 1.105-3.582 2-8 2s-8-.895-8-2m16 4c0 1.105-3.582 2-8 2s-8-.895-8-2" />
      </svg>
    ),
  },
  {
    label: "Theme",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414m0-11.314 1.414 1.414m10.9 10.9 1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
      </svg>
    ),
  },
  {
    label: "Account",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20a7.5 7.5 0 0115 0" />
      </svg>
    ),
  },
];

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

const processingSteps = ["Querying Edison...", "Analyzing results...", "Generating hypothesis..."];

interface UploadedFile {
  name: string;
  size: number;
  type: string;
}

interface ExperimentForm {
  title: string;
  hypothesis_statement: string;
  hypothesis_null: string;
  budget_max_usd: number;
  bsl_level: string;
  privacy: string;
  notes: string;
}

export default function HypothesizePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);

  // Flow state
  const [flowState, setFlowState] = useState<FlowState>("INITIAL");
  const [processingStep, setProcessingStep] = useState(0);

  // Data state
  const [selectedAgent, setSelectedAgent] = useState<EdisonJobType>("literature");
  const [query, setQuery] = useState("");
  const [edisonResponse, setEdisonResponse] = useState<EdisonTranslateResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    if (!isAuthenticated()) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  // Load chat history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("hypothesize-history");
    if (saved) {
      const parsed = JSON.parse(saved);
      setChatHistory(parsed.map((s: ChatSession) => ({ ...s, timestamp: new Date(s.timestamp) })));
    }
  }, []);

  // Update cost estimate when we have experiment type
  useEffect(() => {
    if (edisonResponse?.experiment_type) {
      estimateCost({ experiment_type: edisonResponse.experiment_type })
        .then((data) => setEstimate(data.estimated_cost_usd))
        .catch(() => setEstimate(null));
    }
  }, [edisonResponse?.experiment_type]);

  // Processing animation
  useEffect(() => {
    if (flowState === "PROCESSING") {
      const interval = setInterval(() => {
        setProcessingStep((prev) => (prev + 1) % processingSteps.length);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [flowState]);

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
    const newFiles: UploadedFile[] = files.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newFiles: UploadedFile[] = files.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
      }));
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!query.trim()) {
      setError("Please enter a research query");
      return;
    }

    setError("");
    setFlowState("PROCESSING");
    setProcessingStep(0);

    try {
      const result = await generateHypothesis({
        query: query,
        job_type: selectedAgent,
      });

      if (!result.success) {
        setError(result.error || "Failed to generate hypothesis");
        setFlowState("INITIAL");
        return;
      }

      setEdisonResponse(result);

      // Save to chat history
      const newSession: ChatSession = {
        id: Date.now().toString(),
        query: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
        agent: selectedAgent,
        timestamp: new Date(),
        experimentType: result.experiment_type,
      };
      setChatHistory(prev => {
        const updatedHistory = [newSession, ...prev].slice(0, 20);
        localStorage.setItem("hypothesize-history", JSON.stringify(updatedHistory));
        return updatedHistory;
      });

      // Extract hypothesis from intake
      const intake = result.intake as Record<string, unknown>;
      const hypothesis = intake.hypothesis as { statement?: string; null_hypothesis?: string } | undefined;
      setEditedHypothesis(hypothesis?.statement || "");
      setEditedNullHypothesis(hypothesis?.null_hypothesis || "");

      setFlowState("HYPOTHESIS_REVIEW");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate hypothesis");
      setFlowState("INITIAL");
    }
  }, [query, selectedAgent]);

  const handleProceedToExperiment = useCallback(() => {
    if (!edisonResponse) return;

    const intake = edisonResponse.intake as Record<string, unknown>;
    const title = (intake.title as string) || "";
    const compliance = intake.compliance as { bsl?: string } | undefined;
    const turnaround = intake.turnaround_budget as { budget_max_usd?: number } | undefined;
    const metadata = intake.metadata as { notes?: string } | undefined;

    experimentForm.reset({
      title,
      hypothesis_statement: editedHypothesis,
      hypothesis_null: editedNullHypothesis,
      budget_max_usd: turnaround?.budget_max_usd || 500,
      bsl_level: compliance?.bsl || "BSL1",
      privacy: (intake.privacy as string) || "open",
      notes: metadata?.notes || "",
    });

    setFlowState("EXPERIMENT_FORM");
  }, [edisonResponse, editedHypothesis, editedNullHypothesis, experimentForm]);

  const handleSubmitExperiment = useCallback(async (data: ExperimentForm) => {
    if (!edisonResponse) return;

    setLoading(true);
    setError("");

    try {
      const payload = {
        experiment_type: edisonResponse.experiment_type,
        title: data.title,
        hypothesis: {
          statement: data.hypothesis_statement,
          null_hypothesis: data.hypothesis_null,
        },
        turnaround_budget: {
          budget_max_usd: data.budget_max_usd,
        },
        deliverables: {
          minimum_package_level: "standard",
        },
        compliance: {
          bsl_level: data.bsl_level,
        },
        privacy: data.privacy,
        metadata: {
          notes: data.notes,
          edison_generated: true,
        },
      };

      const result = await createExperiment(payload);
      router.push(`/experiments/${result.experiment_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create experiment");
    } finally {
      setLoading(false);
    }
  }, [edisonResponse, router]);

  const handleStartOver = useCallback(() => {
    setFlowState("INITIAL");
    setEdisonResponse(null);
    setEditedHypothesis("");
    setEditedNullHypothesis("");
    setError("");
    setEstimate(null);
    setQuery("");
    setUploadedFiles([]);
    experimentForm.reset();
  }, [experimentForm]);

  const charCount = query.length;
  const selectedAgentCard = agentCards.find((agent) => agent.value === selectedAgent);
  const overlayTabIndex = sidebarOpen ? undefined : -1;

  // Get confidence color based on intake - memoized
  const confidenceBadge = useMemo(() => {
    if (!edisonResponse?.intake) return null;
    const intake = edisonResponse.intake as Record<string, unknown>;
    const confidence = (intake.confidence as number) || 0.7;

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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
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
        className={`fixed left-0 inset-y-0 z-[60] w-64 bg-surface-100 border-r border-surface-200 flex flex-col shadow-lg transition-transform duration-150 ease-out motion-reduce:transition-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
        aria-hidden={!sidebarOpen}
      >
        <div className="p-4 flex items-center justify-between">
          <div className="w-9 h-9 bg-surface-900 flex items-center justify-center">
            <span className="text-accent font-display text-lg">L</span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="text-surface-400 hover:text-surface-600 transition-colors"
            aria-label="Collapse sidebar"
            tabIndex={overlayTabIndex}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-2">
          <span className="font-mono text-xs uppercase tracking-wide text-surface-500">History</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {chatHistory.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">No history yet</p>
          ) : (
            <div className="space-y-1">
              {chatHistory.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="w-full text-left p-3 hover:bg-surface-200 transition-colors rounded text-sm"
                  tabIndex={overlayTabIndex}
                >
                  <p className="text-surface-700 truncate">{session.query}</p>
                  <p className="text-xs text-surface-400 mt-1">
                    {agentCards.find(a => a.value === session.agent)?.label} · {session.timestamp.toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto border-t border-surface-200 px-2 py-3 space-y-1">
          {sidebarItems.map((item) => (
            <button
              key={item.label}
              type="button"
              title={item.label}
              aria-label={item.label}
              className="w-full flex items-center gap-3 px-2 py-2 text-sm text-surface-500 hover:text-surface-700 hover:bg-surface-200 rounded transition-colors"
              tabIndex={overlayTabIndex}
            >
              {item.icon}
              <span className="text-xs font-mono uppercase tracking-wide">{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content - offset by fixed sidebar rail width */}
      <div className="ml-20 min-h-screen overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-display text-surface-900">Hypothesize</h1>
                <p className="text-sm text-surface-500 mt-1">
                  An AI scientist for complex questions.
                </p>
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
                  </div>
                )}

                {/* Query Textarea */}
                <div className="relative">
                  <label htmlFor="hypothesize-query" className="sr-only">
                    Enter your query
                  </label>
                  <textarea
                    id="hypothesize-query"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    rows={7}
                    maxLength={10000}
                    placeholder="Enter your query..."
                    className="w-full min-h-[220px] resize-none rounded-lg bg-transparent px-4 py-3 pr-20 text-lg text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-100"
                  />
                  <span className={`absolute right-4 top-4 text-xs font-mono ${charCount > 9000 ? "text-accent" : "text-surface-400"}`}>
                    {charCount.toLocaleString()} / 10,000
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,240px)] gap-4">
                  {/* File Upload Area */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border rounded-lg p-4 transition-colors ${
                      isDragging
                        ? "border-accent bg-accent-50"
                        : "border-surface-200 bg-surface-50 hover:border-surface-300"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-white rounded border border-surface-200">
                        <svg className="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <label className="cursor-pointer">
                          <span className="font-medium text-surface-700">Drag Here or Click to Upload</span>
                          <input
                            type="file"
                            multiple
                            onChange={handleFileSelect}
                            className="hidden"
                            accept=".pdf,.doc,.docx,.txt,.csv,.png,.jpg,.jpeg"
                          />
                        </label>
                        <p className="text-xs text-surface-400 font-mono mt-1">Max 15GB in total</p>
                      </div>
                    </div>

                    {/* Uploaded Files List */}
                    {uploadedFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {uploadedFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between bg-white border border-surface-200 p-2 rounded">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-sm text-surface-700 truncate max-w-[200px]">{file.name}</span>
                              <span className="text-xs text-surface-400">{formatFileSize(file.size)}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="text-surface-400 hover:text-red-500 transition-colors"
                              aria-label={`Remove ${file.name}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cost + Start */}
                  <div className="border border-surface-200 bg-surface-50 rounded-lg p-4 flex items-center justify-between gap-4 min-h-[88px]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-mono font-medium uppercase tracking-wide text-surface-500">
                        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-2.5 0-4.5-1-4.5-2.5S9.5 3 12 3s4.5 1 4.5 2.5S14.5 8 12 8zm-4.5 2.5C7.5 12 9.5 13 12 13s4.5-1 4.5-2.5m-9 5C7.5 17 9.5 18 12 18s4.5-1 4.5-2.5" />
                        </svg>
                        <span>Cost</span>
                      </div>
                      <p className="text-xs text-surface-500 mt-1.5 leading-tight">
                        <span className="font-mono">Agent:</span>{" "}
                        <span className="text-surface-800 font-medium">
                          {selectedAgentCard?.label || "Agent"}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={!query.trim()}
                      className="btn-primary px-5 py-2.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                    >
                      <span>Start</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-sm text-surface-500 text-center">
                New to our Edison agent? Check out our{" "}
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
                      <div className="text-sm font-medium text-surface-900 mb-1">{agent.label}</div>
                      <div className="text-xs text-surface-500 leading-relaxed">{agent.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PROCESSING: Loading State */}
          {flowState === "PROCESSING" && (
            <div className="bg-surface-100 border border-surface-200 rounded-2xl p-8">
              <div className="flex flex-col items-center justify-center py-16 space-y-6" role="status" aria-live="polite">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
                <p className="text-lg font-medium text-surface-700">
                  {processingSteps[processingStep]}
                </p>
                <div className="w-full max-w-md space-y-3">
                  <div className="h-4 bg-surface-200 animate-pulse rounded"></div>
                  <div className="h-4 bg-surface-200 animate-pulse rounded w-3/4"></div>
                  <div className="h-4 bg-surface-200 animate-pulse rounded w-1/2"></div>
                </div>
              </div>
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
                      {experimentTypeLabels[edisonResponse.experiment_type] || edisonResponse.experiment_type}
                    </p>
                  </div>
                  {confidenceBadge}
                </div>

                {error && (
                  <div className="alert-error mb-6">
                    {error}
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <label className="form-label">
                      Hypothesis Statement
                    </label>
                    <textarea
                      value={editedHypothesis}
                      onChange={(e) => setEditedHypothesis(e.target.value)}
                      rows={3}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="form-label">
                      Null Hypothesis
                    </label>
                    <textarea
                      value={editedNullHypothesis}
                      onChange={(e) => setEditedNullHypothesis(e.target.value)}
                      rows={2}
                      className="input"
                    />
                  </div>

                  {/* Edison Insights */}
                  {(edisonResponse.suggestions.length > 0 || edisonResponse.warnings.length > 0) && (
                    <div className="bg-surface-50 border-l-2 border-accent p-4 space-y-4">
                      <p className="font-mono text-xs uppercase tracking-wide text-surface-600">
                        Edison Insights
                      </p>

                      {edisonResponse.suggestions.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-surface-700 mb-2">Suggestions:</p>
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
                          <p className="text-sm font-medium text-surface-700 mb-2">Warnings:</p>
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

                <div className="flex gap-4 pt-6 mt-6 border-t border-surface-200">
                  <button
                    type="button"
                    onClick={handleStartOver}
                    className="flex-1 btn-secondary"
                  >
                    Start Over
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedToExperiment}
                    className="flex-1 btn-primary"
                    disabled={!editedHypothesis.trim()}
                  >
                    Proceed to Experiment
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
                  {experimentTypeLabels[edisonResponse.experiment_type] || edisonResponse.experiment_type}
                </p>
              </div>

              <form onSubmit={experimentForm.handleSubmit(handleSubmitExperiment)} className="space-y-6">
                {error && (
                  <div className="alert-error">
                    {error}
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

                <div>
                  <label className="form-label">
                    Title <span className="text-accent">*</span>
                  </label>
                  <input
                    {...experimentForm.register("title", { required: "Title is required" })}
                    type="text"
                    className="input"
                  />
                  {experimentForm.formState.errors.title && (
                    <p className="form-error">{experimentForm.formState.errors.title.message}</p>
                  )}
                </div>

                <div>
                  <label className="form-label">
                    Hypothesis Statement <span className="text-accent">*</span>
                  </label>
                  <textarea
                    {...experimentForm.register("hypothesis_statement", { required: "Hypothesis is required" })}
                    rows={3}
                    className="input"
                  />
                  {experimentForm.formState.errors.hypothesis_statement && (
                    <p className="form-error">{experimentForm.formState.errors.hypothesis_statement.message}</p>
                  )}
                </div>

                <div>
                  <label className="form-label">
                    Null Hypothesis <span className="text-accent">*</span>
                  </label>
                  <textarea
                    {...experimentForm.register("hypothesis_null", { required: "Null hypothesis is required" })}
                    rows={2}
                    className="input"
                  />
                  {experimentForm.formState.errors.hypothesis_null && (
                    <p className="form-error">{experimentForm.formState.errors.hypothesis_null.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="form-label">
                      Maximum Budget (USD)
                    </label>
                    <input
                      {...experimentForm.register("budget_max_usd", { valueAsNumber: true })}
                      type="number"
                      min="50"
                      max="10000"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="form-label">
                      BSL Level
                    </label>
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
                  <label className="form-label">
                    Privacy
                  </label>
                  <select
                    {...experimentForm.register("privacy")}
                    className="input"
                  >
                    <option value="open">Open (results may be shared)</option>
                    <option value="confidential">Confidential (NDA required)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">
                    Additional Notes
                  </label>
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
                        {Object.entries(edisonResponse.translations).map(([provider, result]) => {
                          const translation = result as { format?: string; protocol_readable?: string; success?: boolean };
                          return (
                            <div key={provider} className="border border-surface-200 overflow-hidden">
                              <div className="bg-surface-100 px-4 py-2 flex items-center justify-between">
                                <span className="text-xs font-mono uppercase tracking-wide text-surface-700">
                                  {provider} {translation.format && `(${translation.format})`}
                                </span>
                                {translation.success !== undefined && (
                                  <span className={`text-xs font-mono ${translation.success ? "text-emerald-600" : "text-red-600"}`}>
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
                        })}
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
