"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  createExperiment,
  estimateCost,
  translateToCloudLab,
  getHypothesis,
  type TranslateResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { HypothesisListItem, HypothesisResponse } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { HypothesisPicker } from "@/components/HypothesisPicker";
import {
  experimentTypes,
  experimentTypeMap,
  isExperimentTypeValue,
  sampleExperiments,
  type ExperimentForm,
} from "@/lib/experimentSamples";

// Reverse map from backend types to form types
const backendToFormTypeMap: Record<string, string> = {
  SANGER_PLASMID_VERIFICATION: "sanger",
  QPCR_EXPRESSION: "qpcr",
  CELL_VIABILITY_IC50: "cell_viability",
  ENZYME_INHIBITION_IC50: "enzyme_inhibition",
  MICROBIAL_GROWTH_MATRIX: "microbial_growth",
  MIC_MBC_ASSAY: "mic_mbc",
  ZONE_OF_INHIBITION: "zone_of_inhibition",
  CUSTOM: "custom_protocol",
};

function NewExperimentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState<{
    low: number;
    typical: number;
    high: number;
  } | null>(null);

  // Hypothesis picker state
  const [showPicker, setShowPicker] = useState(false);
  const [selectedHypothesis, setSelectedHypothesis] = useState<HypothesisResponse | null>(null);

  // AI-assisted translation state
  const [useAI, setUseAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [translation, setTranslation] = useState<TranslateResponse | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ExperimentForm>({
    defaultValues: {
      bsl_level: "BSL1",
      privacy: "open",
      budget_max_usd: 500,
    },
  });

  const [generatingExample, setGeneratingExample] = useState(false);

  const experimentType = watch("experiment_type");

  // Handle URL param ?hypothesisId={id}
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    }


    const hypothesisId = searchParams.get("hypothesisId");
    if (hypothesisId) {
      getHypothesis(hypothesisId)
        .then((hypothesis) => {
          prefillFromHypothesis(hypothesis);
          setSelectedHypothesis(hypothesis);
        })
        .catch((err) => {
          console.error("Failed to load hypothesis:", err);
          setError("Failed to load hypothesis from URL");
        });
    }
  }, [isAuthenticated, router, searchParams]);

  useEffect(() => {
    if (experimentType) {
      estimateCost({ experiment_type: experimentType })
        .then((data) => setEstimate(data.estimated_cost_usd))
        .catch(() => setEstimate(null));
    }
  }, [experimentType]);

  useEffect(() => {
    if (!useAI) {
      setShowPreview(false);
      setTranslation(null);
    }
  }, [useAI]);

  // Pre-fill form from hypothesis
  const prefillFromHypothesis = (hypothesis: HypothesisResponse) => {
    const formType = hypothesis.experiment_type
      ? backendToFormTypeMap[hypothesis.experiment_type]
      : undefined;

    reset({
      experiment_type: (formType || "") as ExperimentForm["experiment_type"],
      title: hypothesis.title,
      hypothesis_statement: hypothesis.statement,
      hypothesis_null: hypothesis.null_hypothesis || "",
      bsl_level: "BSL1",
      privacy: "open",
      budget_max_usd: 500,
      notes: "",
    });
  };

  // Handle hypothesis selection from picker
  const handleHypothesisSelect = async (item: HypothesisListItem) => {
    try {
      const hypothesis = await getHypothesis(item.id);
      prefillFromHypothesis(hypothesis);
      setSelectedHypothesis(hypothesis);
      setShowPicker(false);
    } catch (err) {
      console.error("Failed to load hypothesis:", err);
      setError("Failed to load hypothesis details");
    }
  };

  // Clear hypothesis pre-fill
  const handleClearHypothesis = () => {
    setSelectedHypothesis(null);
    reset({
      experiment_type: "",
      title: "",
      hypothesis_statement: "",
      hypothesis_null: "",
      bsl_level: "BSL1",
      privacy: "open",
      budget_max_usd: 500,
      notes: "",
    });
  };

  // Generate random example from sample data
  const generateRandomExample = async () => {
    setGeneratingExample(true);
    setError("");

    try {
      if (sampleExperiments.length === 0) {
        throw new Error("No sample experiments available");
      }

      // If an experiment type is already selected, filter to matching samples
      const currentType = watch("experiment_type");
      const filteredSamples = currentType
        ? sampleExperiments.filter((s) => s.experiment_type === currentType)
        : sampleExperiments;

      if (filteredSamples.length === 0) {
        throw new Error(`No sample experiments available for ${currentType}`);
      }

      const randomIndex = Math.floor(Math.random() * filteredSamples.length);
      const selected = filteredSamples[randomIndex];

      // Reset form with selected values
      reset(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample experiments");
      console.error(err);
    } finally {
      setGeneratingExample(false);
    }
  };


  // Generate AI-assisted protocol preview
  const generatePreview = async () => {
    const formData = watch();
    if (!formData.experiment_type || !formData.title || !formData.hypothesis_statement) {
      setError("Please fill in experiment type, title, and hypothesis first");
      return;
    }

    setAiLoading(true);
    setError("");
    setShowPreview(false);
    setTranslation(null);

    try {
      const backendExperimentType = isExperimentTypeValue(formData.experiment_type)
        ? experimentTypeMap[formData.experiment_type]
        : "CUSTOM";

      const intake = {
        experiment_type: backendExperimentType,
        title: formData.title,
        hypothesis: {
          statement: formData.hypothesis_statement,
          null_hypothesis: formData.hypothesis_null,
        },
        turnaround_budget: {
          budget_max_usd: formData.budget_max_usd,
        },
        deliverables: {
          minimum_package_level: "standard",
        },
        compliance: {
          bsl: formData.bsl_level,
        },
        privacy: formData.privacy,
        metadata: {
          notes: formData.notes,
        },
      };

      const translateResult = await translateToCloudLab({ intake, use_llm: true });
      setTranslation(translateResult);
      setShowPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate preview");
    } finally {
      setAiLoading(false);
    }
  };

  const onSubmit = async (data: ExperimentForm) => {
    setLoading(true);
    setError("");

    try {
      const payload = {
        experiment_type: data.experiment_type,
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
        },
      };

      const result = await createExperiment(payload);
      router.push(`/experiments/${result.experiment_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create experiment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <span className="section-label">02 — Create</span>
          <h1 className="text-4xl font-display text-surface-900">New Experiment</h1>
        </div>
        <button
          type="button"
          onClick={generateRandomExample}
          disabled={generatingExample}
          className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {generatingExample ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
              </svg>
              Generate Example
            </>
          )}
        </button>
      </div>

      <div className="card p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="alert-error">
              {error}
            </div>
          )}

          {/* Hypothesis Pre-fill Section */}
          {selectedHypothesis ? (
            <div className="bg-accent-50 border-l-2 border-accent px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-surface-800 mb-1">
                    Pre-filled from hypothesis
                  </p>
                  <p className="text-sm text-surface-600">
                    {selectedHypothesis.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClearHypothesis}
                  className="text-sm text-accent hover:text-accent-dim font-medium transition-colors flex-shrink-0"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="border border-surface-200 bg-surface-50 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-surface-800 mb-1">
                    Start from a saved hypothesis
                  </p>
                  <p className="text-xs text-surface-500">
                    Pre-fill this form with data from a previously saved hypothesis
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="btn-secondary text-sm flex-shrink-0"
                >
                  Use from Hypothesize
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="form-label">
              Experiment Type <span className="text-accent">*</span>
            </label>
            <select
              {...register("experiment_type", { required: "Please select an experiment type" })}
              className="input"
            >
              <option value="">Select type...</option>
              {experimentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {errors.experiment_type && (
              <p className="form-error">{errors.experiment_type.message}</p>
            )}
          </div>

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
              {...register("title", { required: "Title is required" })}
              type="text"
              placeholder="e.g., Enzyme X inhibition assay with Compound Y"
              className="input"
            />
            {errors.title && (
              <p className="form-error">{errors.title.message}</p>
            )}
          </div>

          <div>
            <label className="form-label">
              Hypothesis Statement <span className="text-accent">*</span>
            </label>
            <textarea
              {...register("hypothesis_statement", { required: "Hypothesis is required" })}
              rows={3}
              placeholder="e.g., Compound X inhibits enzyme Y activity by at least 50% at 10μM"
              className="input"
            />
            {errors.hypothesis_statement && (
              <p className="form-error">{errors.hypothesis_statement.message}</p>
            )}
          </div>

          <div>
            <label className="form-label">
              Null Hypothesis <span className="text-accent">*</span>
            </label>
            <textarea
              {...register("hypothesis_null", { required: "Null hypothesis is required" })}
              rows={2}
              placeholder="e.g., Compound X has no significant effect on enzyme Y at 10μM"
              className="input"
            />
            {errors.hypothesis_null && (
              <p className="form-error">{errors.hypothesis_null.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="form-label">
                Maximum Budget (USD)
              </label>
              <input
                {...register("budget_max_usd", { valueAsNumber: true })}
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
                {...register("bsl_level")}
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
              {...register("privacy")}
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
              {...register("notes")}
              rows={3}
              placeholder="Any additional information for the operator..."
              className="input"
            />
          </div>

          {/* AI-Assisted Protocol Generation */}
          <div className="border-t border-surface-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAI}
                    onChange={(e) => setUseAI(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-surface-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-100 peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                </label>
                <div>
                  <span className="text-sm font-medium text-surface-800">
                    AI-Assisted Protocol Generation
                  </span>
                  <p className="text-xs text-surface-500">
                    Use AI to extract parameters from your hypothesis and generate cloud lab protocols
                  </p>
                </div>
              </div>
              {useAI && (
                <button
                  type="button"
                  onClick={generatePreview}
                  disabled={aiLoading}
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  {aiLoading ? "Generating..." : "Preview Protocol"}
                </button>
              )}
            </div>

            {/* AI Interpretation Results */}
            {showPreview && translation && (
              <div className="space-y-4 bg-surface-50 p-6">
                {/* Protocol Preview */}
                <div className="space-y-3">
                  <p className="text-xs font-mono uppercase tracking-wide text-surface-600">Generated Protocols:</p>
                  {Object.entries(translation.translations).map(([provider, result]) => (
                    <div key={provider} className="border border-surface-200 overflow-hidden">
                      <div className="bg-surface-100 px-4 py-2 flex items-center justify-between">
                        <span className="text-xs font-mono uppercase tracking-wide text-surface-700">
                          {provider} ({result.format})
                        </span>
                        {result.success ? (
                          <span className="text-xs text-emerald-600 font-mono">Valid</span>
                        ) : (
                          <span className="text-xs text-red-600 font-mono">Errors</span>
                        )}
                      </div>

                      {(result.warnings.length > 0 || result.errors.length > 0) && (
                        <div className="px-4 py-3 bg-white border-b border-surface-200 space-y-2 text-xs">
                          {result.warnings.length > 0 && (
                            <div>
                              <p className="font-mono uppercase tracking-wide text-amber-700 mb-1">Warnings:</p>
                              <ul className="text-amber-700 space-y-1">
                                {result.warnings.map((w, i) => (
                                  <li key={i}>• {w.message}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {result.errors.length > 0 && (
                            <div>
                              <p className="font-mono uppercase tracking-wide text-red-700 mb-1">Errors:</p>
                              <ul className="text-red-700 space-y-1">
                                {result.errors.map((e, i) => (
                                  <li key={i}>• {e.message}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      <pre className="p-4 text-xs font-mono text-surface-600 overflow-x-auto max-h-48 bg-white">
                        {result.protocol_readable}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-6">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn-primary disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Experiment"}
            </button>
          </div>
        </form>
      </div>

      {/* Hypothesis Picker Modal */}
      <HypothesisPicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleHypothesisSelect}
      />
    </div>
  );
}

export default function NewExperimentPage() {
  return (
    <Suspense fallback={
      <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
        </div>
      </div>
    }>
      <NewExperimentPageContent />
    </Suspense>
  );
}
