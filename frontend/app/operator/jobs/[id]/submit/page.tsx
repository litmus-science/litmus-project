"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useForm, useFieldArray } from "react-hook-form";
import { getExperiment, submitResults } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Experiment, ConfidenceLevel } from "@/lib/types";

interface MeasurementInput {
  metric: string;
  value: number;
  unit?: string;
  condition?: string;
}

interface PhotoInput {
  step: number;
  file?: FileList;
  caption?: string;
}

interface SubmitForm {
  hypothesis_supported: boolean;
  confidence_level: ConfidenceLevel;
  summary: string;
  measurements: MeasurementInput[];
  statistics_test?: string;
  statistics_p_value?: number;
  statistics_effect_size?: number;
  photos: PhotoInput[];
  notes?: string;
}

export default function SubmitResultsPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated } = useAuth();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const experimentId = params.id as string;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SubmitForm>({
    defaultValues: {
      hypothesis_supported: true,
      confidence_level: "high",
      measurements: [{ metric: "", value: 0, unit: "", condition: "" }],
      photos: [{ step: 1, caption: "" }],
    },
  });

  const {
    fields: measurementFields,
    append: appendMeasurement,
    remove: removeMeasurement,
  } = useFieldArray({ control, name: "measurements" });

  const {
    fields: photoFields,
    append: appendPhoto,
    remove: removePhoto,
  } = useFieldArray({ control, name: "photos" });

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function fetchExperiment() {
      try {
        const data = await getExperiment(experimentId);
        setExperiment(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load experiment");
      } finally {
        setLoading(false);
      }
    }

    fetchExperiment();
  }, [isAuthenticated, router, experimentId]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const onSubmit = async (data: SubmitForm) => {
    setSubmitting(true);
    setError("");

    try {
      // Process photos to base64
      const processedPhotos = await Promise.all(
        data.photos
          .filter((p) => p.file && p.file.length > 0)
          .map(async (p) => ({
            step: p.step,
            image_base64: await fileToBase64(p.file![0]),
            caption: p.caption,
          }))
      );

      await submitResults(experimentId, {
        hypothesis_supported: data.hypothesis_supported,
        confidence_level: data.confidence_level,
        summary: data.summary,
        measurements: data.measurements.filter((m) => m.metric),
        statistics: data.statistics_test
          ? {
              test_used: data.statistics_test,
              p_value: data.statistics_p_value,
              effect_size: data.statistics_effect_size,
            }
          : undefined,
        documentation: {
          photos: processedPhotos,
        },
        notes: data.notes,
      });

      router.push("/operator/jobs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit results");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!experiment) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error || "Experiment not found"}
        </div>
      </div>
    );
  }

  const spec = experiment.specification as { title?: string; [key: string]: unknown };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href={`/operator/jobs/${experimentId}`}
          className="text-indigo-600 hover:text-indigo-500 text-sm"
        >
          &larr; Back to Job
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Submit Results</h1>
          <p className="text-sm text-gray-500 mt-1">
            {(spec.title as string) || "Untitled Experiment"}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Hypothesis Result */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Was the hypothesis supported? *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  {...register("hypothesis_supported")}
                  value="true"
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span>Yes</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  {...register("hypothesis_supported")}
                  value="false"
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span>No</span>
              </label>
            </div>
          </div>

          {/* Confidence Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confidence Level *
            </label>
            <select
              {...register("confidence_level")}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="inconclusive">Inconclusive</option>
            </select>
          </div>

          {/* Summary */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Summary *
            </label>
            <textarea
              {...register("summary", { required: "Summary is required" })}
              rows={4}
              placeholder="Describe the key findings and conclusions..."
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            {errors.summary && (
              <p className="mt-1 text-sm text-red-600">{errors.summary.message}</p>
            )}
          </div>

          {/* Measurements */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Measurements
              </label>
              <button
                type="button"
                onClick={() =>
                  appendMeasurement({ metric: "", value: 0, unit: "", condition: "" })
                }
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                + Add Measurement
              </button>
            </div>
            <div className="space-y-3">
              {measurementFields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <input
                    {...register(`measurements.${index}.metric`)}
                    placeholder="Metric"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  <input
                    {...register(`measurements.${index}.value`, { valueAsNumber: true })}
                    type="number"
                    step="any"
                    placeholder="Value"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  <input
                    {...register(`measurements.${index}.unit`)}
                    placeholder="Unit"
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  <input
                    {...register(`measurements.${index}.condition`)}
                    placeholder="Condition"
                    className="w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  {measurementFields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMeasurement(index)}
                      className="text-red-500 hover:text-red-700 px-2"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Statistics */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Statistics (optional)
            </label>
            <div className="grid grid-cols-3 gap-3">
              <input
                {...register("statistics_test")}
                placeholder="Test used (e.g., t-test)"
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
              <input
                {...register("statistics_p_value", { valueAsNumber: true })}
                type="number"
                step="any"
                placeholder="P-value"
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
              <input
                {...register("statistics_effect_size", { valueAsNumber: true })}
                type="number"
                step="any"
                placeholder="Effect size"
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
            </div>
          </div>

          {/* Photos */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Documentation Photos
              </label>
              <button
                type="button"
                onClick={() =>
                  appendPhoto({ step: photoFields.length + 1, caption: "" })
                }
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                + Add Photo
              </button>
            </div>
            <div className="space-y-3">
              {photoFields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <input
                    {...register(`photos.${index}.step`, { valueAsNumber: true })}
                    type="number"
                    min="1"
                    placeholder="Step #"
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  <input
                    {...register(`photos.${index}.file`)}
                    type="file"
                    accept="image/*"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  <input
                    {...register(`photos.${index}.caption`)}
                    placeholder="Caption"
                    className="w-40 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  {photoFields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="text-red-500 hover:text-red-700 px-2"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Notes
            </label>
            <textarea
              {...register("notes")}
              rows={3}
              placeholder="Any additional observations or notes..."
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Submit */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Results"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
