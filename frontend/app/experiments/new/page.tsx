"use client";

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { createExperiment, estimateCost, getHypothesis } from "@/lib/api";
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

const TURNAROUND_OPTIONS = [
  { value: "1", label: "1 week" },
  { value: "2", label: "2 weeks" },
  { value: "4", label: "4 weeks" },
  { value: "6", label: "6 weeks" },
  { value: "8", label: "8 weeks" },
  { value: "12", label: "12+ weeks" },
];

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="text-[10px] font-mono text-accent uppercase tracking-widest-plus">
        {number}
      </span>
      <span className="text-xs font-medium text-surface-400 uppercase tracking-wide">
        {title}
      </span>
    </div>
  );
}

function NewExperimentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const hypothesisId = useMemo(
    () => new URLSearchParams(searchKey).get("hypothesisId"),
    [searchKey],
  );
  const { isAuthenticated, authChecked } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState<{
    low: number;
    typical: number;
    high: number;
  } | null>(null);
  const hypothesisRequestRef = useRef<AbortController | null>(null);

  const [showPicker, setShowPicker] = useState(false);
  const [selectedHypothesis, setSelectedHypothesis] =
    useState<HypothesisResponse | null>(null);

  const [generatingExample, setGeneratingExample] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ExperimentForm>({
    defaultValues: {
      program: "",
      therapeutic_area: "",
      target_compound: "",
      experiment_type: "",
      title: "",
      hypothesis_statement: "",
      hypothesis_null: "",
      budget_max_usd: 500,
      turnaround_weeks: "4",
      bsl_level: "BSL1",
      privacy: "confidential",
      notes: "",
    },
  });

  const experimentType = watch("experiment_type");

  useEffect(() => {
    return () => {
      hypothesisRequestRef.current?.abort();
      hypothesisRequestRef.current = null;
    };
  }, []);

  const prefillFromHypothesis = useCallback(
    (hypothesis: HypothesisResponse) => {
      const formType = hypothesis.experiment_type
        ? backendToFormTypeMap[hypothesis.experiment_type]
        : undefined;

      reset({
        program: "",
        therapeutic_area: "",
        target_compound: "",
        experiment_type: (formType || "") as ExperimentForm["experiment_type"],
        title: hypothesis.title,
        hypothesis_statement: hypothesis.statement,
        hypothesis_null: hypothesis.null_hypothesis || "",
        budget_max_usd: 500,
        turnaround_weeks: "4",
        bsl_level: "BSL1",
        privacy: "confidential",
        notes: "",
      });
    },
    [reset],
  );

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    if (!hypothesisId) return;

    hypothesisRequestRef.current?.abort();
    const controller = new AbortController();
    hypothesisRequestRef.current = controller;

    getHypothesis(hypothesisId, { signal: controller.signal })
      .then((hypothesis) => {
        prefillFromHypothesis(hypothesis);
        setSelectedHypothesis(hypothesis);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Failed to load hypothesis from URL");
      })
      .finally(() => {
        if (hypothesisRequestRef.current === controller) {
          hypothesisRequestRef.current = null;
        }
      });

    return () => {
      if (hypothesisRequestRef.current === controller) {
        controller.abort();
        hypothesisRequestRef.current = null;
      }
    };
  }, [authChecked, isAuthenticated, router, hypothesisId, prefillFromHypothesis]);

  useEffect(() => {
    if (!experimentType) { setEstimate(null); return; }
    const controller = new AbortController();
    estimateCost(
      { experiment_type: experimentType },
      { signal: controller.signal },
    )
      .then((data) => setEstimate(data.estimated_cost_usd))
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setEstimate(null);
      });
    return () => { controller.abort(); };
  }, [experimentType]);

  const handleHypothesisSelect = async (item: HypothesisListItem) => {
    const controller = new AbortController();
    try {
      hypothesisRequestRef.current?.abort();
      hypothesisRequestRef.current = controller;
      const hypothesis = await getHypothesis(item.id, { signal: controller.signal });
      prefillFromHypothesis(hypothesis);
      setSelectedHypothesis(hypothesis);
      setShowPicker(false);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Failed to load hypothesis details");
    } finally {
      if (hypothesisRequestRef.current === controller) {
        hypothesisRequestRef.current = null;
      }
    }
  };

  const handleClearHypothesis = () => {
    setSelectedHypothesis(null);
    reset({
      program: "",
      therapeutic_area: "",
      target_compound: "",
      experiment_type: "",
      title: "",
      hypothesis_statement: "",
      hypothesis_null: "",
      budget_max_usd: 500,
      turnaround_weeks: "4",
      bsl_level: "BSL1",
      privacy: "confidential",
      notes: "",
    });
  };

  const generateRandomExample = async () => {
    setGeneratingExample(true);
    setError("");
    try {
      const currentType = watch("experiment_type");
      const filtered = currentType
        ? sampleExperiments.filter((s) => s.experiment_type === currentType)
        : sampleExperiments;
      if (filtered.length === 0) throw new Error(`No samples for ${currentType}`);
      const sample = filtered[Math.floor(Math.random() * filtered.length)];
      reset({
        ...sample,
        program: sample.program ?? "",
        therapeutic_area: sample.therapeutic_area ?? "",
        target_compound: sample.target_compound ?? "",
        turnaround_weeks: sample.turnaround_weeks ?? "4",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample");
    } finally {
      setGeneratingExample(false);
    }
  };

  const onSubmit = async (data: ExperimentForm) => {
    setLoading(true);
    setError("");
    try {
      // Each experiment type requires a matching section key in the payload
      const typeSection = isExperimentTypeValue(data.experiment_type)
        ? { [data.experiment_type]: {} }
        : {};

      const payload = {
        experiment_type: isExperimentTypeValue(data.experiment_type)
          ? experimentTypeMap[data.experiment_type]
          : data.experiment_type,
        title: data.title,
        program: data.program || undefined,
        therapeutic_area: data.therapeutic_area || undefined,
        hypothesis: {
          statement: data.hypothesis_statement,
          null_hypothesis: data.hypothesis_null || undefined,
        },
        turnaround_budget: {
          budget_max_usd: data.budget_max_usd,
          desired_turnaround_days: data.turnaround_weeks
            ? parseInt(data.turnaround_weeks) * 7
            : undefined,
        },
        deliverables: {
          minimum_package_level: "standard",
        },
        compliance: {
          bsl_level: data.bsl_level,
        },
        privacy: data.privacy,
        metadata: {
          notes: data.notes || undefined,
          target_compound: data.target_compound || undefined,
        },
        ...typeSection,
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
    <div className="max-w-2xl mx-auto px-6 lg:px-8 py-12">
      {/* Page header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <span className="section-label">02 — Create</span>
          <h1 className="text-4xl font-display text-surface-900">New Experiment</h1>
        </div>
        <div className="flex items-center gap-3">
          {selectedHypothesis ? (
            <div className="flex items-center gap-2 text-xs text-surface-500 bg-accent-50 border border-accent/20 px-3 py-1.5 rounded-md">
              <span className="text-accent">↑</span>
              <span className="truncate max-w-[160px]">{selectedHypothesis.title}</span>
              <button
                type="button"
                onClick={handleClearHypothesis}
                className="text-surface-400 hover:text-surface-600 ml-1"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="btn-secondary text-xs"
            >
              From hypothesis
            </button>
          )}
          <button
            type="button"
            onClick={generateRandomExample}
            disabled={generatingExample}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            {generatingExample ? "Loading…" : "Generate example"}
          </button>
        </div>
      </div>

      {error && <div className="alert-error mb-6">{error}</div>}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="card p-0 divide-y divide-surface-100">

          {/* ── Section 1: Program ─────────────────────────── */}
          <div className="p-8">
            <SectionHeader number="01" title="Program" />
            <div className="grid grid-cols-2 gap-5 mb-5">
              <div>
                <label className="form-label">
                  Program <span className="text-accent">*</span>
                </label>
                <input
                  {...register("program", { required: "Program is required" })}
                  type="text"
                  placeholder="e.g. GAL-5 Series"
                  className="input"
                />
                {errors.program && (
                  <p className="form-error">{errors.program.message}</p>
                )}
              </div>
              <div>
                <label className="form-label">Therapeutic Area</label>
                <input
                  {...register("therapeutic_area")}
                  type="text"
                  placeholder="e.g. Oncology, CNS"
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="form-label">Target / Compound</label>
              <input
                {...register("target_compound")}
                type="text"
                placeholder="e.g. GAL-5c vs. AChE, Compound LIT-2847"
                className="input"
              />
              <p className="mt-1.5 text-[11px] text-surface-400">
                What molecule or target is being tested — helps CROs understand context immediately.
              </p>
            </div>
          </div>

          {/* ── Section 2: Experiment ─────────────────────── */}
          <div className="p-8">
            <SectionHeader number="02" title="Experiment" />

            <div className="mb-5">
              <label className="form-label">
                Assay Type <span className="text-accent">*</span>
              </label>
              <select
                {...register("experiment_type", { required: "Please select an assay type" })}
                className="input"
              >
                <option value="">Select assay type…</option>
                {experimentTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {errors.experiment_type && (
                <p className="form-error">{errors.experiment_type.message}</p>
              )}
              {estimate && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-surface-500 bg-surface-50 border border-surface-200 px-2.5 py-1 rounded-md">
                    <span className="text-emerald-500">$</span>
                    {formatUsd(estimate.low)} – {formatUsd(estimate.high)} est.
                    <span className="text-surface-400 font-sans">· typical {formatUsd(estimate.typical)}</span>
                  </span>
                </div>
              )}
            </div>

            <div className="mb-5">
              <label className="form-label">
                Title <span className="text-accent">*</span>
              </label>
              <input
                {...register("title", { required: "Title is required" })}
                type="text"
                placeholder="e.g. Enzyme X inhibition assay with Compound Y at 10μM"
                className="input"
              />
              {errors.title && (
                <p className="form-error">{errors.title.message}</p>
              )}
            </div>

            <div className="mb-5">
              <label className="form-label">
                Hypothesis <span className="text-accent">*</span>
              </label>
              <textarea
                {...register("hypothesis_statement", { required: "Hypothesis is required" })}
                rows={3}
                placeholder="e.g. Compound X inhibits enzyme Y activity by at least 50% at 10μM"
                className="input"
              />
              {errors.hypothesis_statement && (
                <p className="form-error">{errors.hypothesis_statement.message}</p>
              )}
            </div>

            <div>
              <label className="form-label text-surface-400">
                Null Hypothesis{" "}
                <span className="normal-case font-normal tracking-normal text-surface-400 ml-1">
                  (optional)
                </span>
              </label>
              <textarea
                {...register("hypothesis_null")}
                rows={2}
                placeholder="e.g. Compound X has no significant effect on enzyme Y at 10μM"
                className="input"
              />
            </div>
          </div>

          {/* ── Section 3: Requirements ───────────────────── */}
          <div className="p-8">
            <SectionHeader number="03" title="Requirements" />

            <div className="grid grid-cols-3 gap-5 mb-5">
              <div>
                <label className="form-label">Budget (USD)</label>
                <input
                  {...register("budget_max_usd", { valueAsNumber: true })}
                  type="number"
                  min="50"
                  max="100000"
                  className="input"
                />
              </div>
              <div>
                <label className="form-label">Turnaround</label>
                <select {...register("turnaround_weeks")} className="input">
                  {TURNAROUND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">BSL Level</label>
                <select {...register("bsl_level")} className="input">
                  <option value="BSL1">BSL-1</option>
                  <option value="BSL2">BSL-2</option>
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">Data Sharing</label>
              <select {...register("privacy")} className="input">
                <option value="open">Open — results may be shared publicly</option>
                <option value="confidential">Confidential — NDA required</option>
              </select>
            </div>
          </div>

          {/* ── Notes ────────────────────────────────────── */}
          <div className="p-8">
            <label className="form-label text-surface-400">
              Notes for CRO{" "}
              <span className="normal-case font-normal tracking-normal text-surface-400 ml-1">
                (optional)
              </span>
            </label>
            <textarea
              {...register("notes")}
              rows={3}
              placeholder="Special handling, preferred reagents, known issues with this compound…"
              className="input"
            />
          </div>

          {/* ── Actions ──────────────────────────────────── */}
          <div className="px-8 py-5 bg-surface-50 rounded-b-lg flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary disabled:opacity-50 min-w-[140px]"
            >
              {loading ? "Creating…" : "Create Experiment"}
            </button>
          </div>
        </div>
      </form>

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
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-6 lg:px-8 py-12">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
          </div>
        </div>
      }
    >
      <NewExperimentPageContent />
    </Suspense>
  );
}
