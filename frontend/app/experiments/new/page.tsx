"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { createExperiment, listTemplates, estimateCost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TemplateListItem } from "@/lib/types";

const experimentTypes = [
  { value: "sanger", label: "Sanger Sequencing" },
  { value: "qpcr", label: "qPCR" },
  { value: "cell_viability", label: "Cell Viability Assay" },
  { value: "enzyme_inhibition", label: "Enzyme Inhibition Assay" },
  { value: "microbial_growth", label: "Microbial Growth Curve" },
  { value: "mic_mbc", label: "MIC/MBC Determination" },
  { value: "zone_of_inhibition", label: "Zone of Inhibition" },
  { value: "custom_protocol", label: "Custom Protocol" },
];

interface ExperimentForm {
  experiment_type: string;
  title: string;
  hypothesis_statement: string;
  hypothesis_null: string;
  budget_max_usd: number;
  bsl_level: string;
  privacy: string;
  notes: string;
}

export default function NewExperimentPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [estimate, setEstimate] = useState<{
    low: number;
    typical: number;
    high: number;
  } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ExperimentForm>({
    defaultValues: {
      bsl_level: "BSL1",
      privacy: "open",
      budget_max_usd: 500,
    },
  });

  const experimentType = watch("experiment_type");

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    listTemplates().then((data) => setTemplates(data.templates)).catch(console.error);
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (experimentType) {
      estimateCost({ experiment_type: experimentType })
        .then((data) => setEstimate(data.estimated_cost_usd))
        .catch(() => setEstimate(null));
    }
  }, [experimentType]);

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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-display text-primary mb-8">New Experiment</h1>

      <div className="card p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="bg-accent-50 border border-accent-200 text-accent px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-500 mb-1">
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
              <p className="mt-1 text-sm text-accent">{errors.experiment_type.message}</p>
            )}
          </div>

          {estimate && (
            <div className="bg-primary-50 border border-primary-200 px-4 py-3 rounded-lg">
              <p className="text-sm text-primary">
                <span className="font-medium">Estimated cost:</span>{" "}
                <span className="font-mono">${estimate.low} - ${estimate.high}</span>{" "}
                <span className="text-surface-400">(typical: ${estimate.typical})</span>
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-500 mb-1">
              Title <span className="text-accent">*</span>
            </label>
            <input
              {...register("title", { required: "Title is required" })}
              type="text"
              placeholder="e.g., Enzyme X inhibition assay with Compound Y"
              className="input"
            />
            {errors.title && (
              <p className="mt-1 text-sm text-accent">{errors.title.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-500 mb-1">
              Hypothesis Statement <span className="text-accent">*</span>
            </label>
            <textarea
              {...register("hypothesis_statement", { required: "Hypothesis is required" })}
              rows={3}
              placeholder="e.g., Compound X inhibits enzyme Y activity by at least 50% at 10μM"
              className="input"
            />
            {errors.hypothesis_statement && (
              <p className="mt-1 text-sm text-accent">{errors.hypothesis_statement.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-500 mb-1">
              Null Hypothesis <span className="text-accent">*</span>
            </label>
            <textarea
              {...register("hypothesis_null", { required: "Null hypothesis is required" })}
              rows={2}
              placeholder="e.g., Compound X has no significant effect on enzyme Y at 10μM"
              className="input"
            />
            {errors.hypothesis_null && (
              <p className="mt-1 text-sm text-accent">{errors.hypothesis_null.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-500 mb-1">
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
              <label className="block text-sm font-medium text-surface-500 mb-1">BSL Level</label>
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
            <label className="block text-sm font-medium text-surface-500 mb-1">Privacy</label>
            <select
              {...register("privacy")}
              className="input"
            >
              <option value="open">Open (results may be shared)</option>
              <option value="confidential">Confidential (NDA required)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-500 mb-1">
              Additional Notes
            </label>
            <textarea
              {...register("notes")}
              rows={3}
              placeholder="Any additional information for the operator..."
              className="input"
            />
          </div>

          <div className="flex gap-4 pt-4">
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
    </div>
  );
}
