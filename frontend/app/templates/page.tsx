"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listTemplates, getTemplate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TemplateListItem, Template } from "@/lib/types";
import { formatUsdRange } from "@/lib/format";

const categories = [
  { value: "", label: "All Categories" },
  { value: "biochemistry", label: "Biochemistry" },
  { value: "microbiology", label: "Microbiology" },
  { value: "cell_biology", label: "Cell Biology" },
  { value: "molecular_biology", label: "Molecular Biology" },
  { value: "analytical", label: "Analytical" },
];

export default function TemplatesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function fetchTemplates() {
      setLoading(true);
      try {
        const params = categoryFilter ? { category: categoryFilter } : undefined;
        const data = await listTemplates(params);
        setTemplates(data.templates);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load templates");
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, [isAuthenticated, router, categoryFilter]);

  const handleSelectTemplate = async (templateId: string) => {
    setLoadingDetail(true);
    try {
      const data = await getTemplate(templateId);
      setSelectedTemplate(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load template");
    } finally {
      setLoadingDetail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Protocol Templates</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="mb-6">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        >
          {categories.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template List */}
        <div className="lg:col-span-1 space-y-3">
          {templates.length === 0 ? (
            <p className="text-gray-500">No templates found</p>
          ) : (
            templates.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelectTemplate(template.id)}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  selectedTemplate?.id === template.id
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <h3 className="font-medium text-gray-900">{template.name}</h3>
                <div className="flex gap-2 mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    {template.category}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    {template.bsl_level}
                  </span>
                </div>
                {template.estimated_cost_range && (
                  <p className="text-xs text-gray-500 mt-2">
                    Est. cost: {formatUsdRange(template.estimated_cost_range)}
                  </p>
                )}
              </button>
            ))
          )}
        </div>

        {/* Template Detail */}
        <div className="lg:col-span-2">
          {loadingDetail ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : selectedTemplate ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {selectedTemplate.name}
              </h2>
              {selectedTemplate.description && (
                <p className="text-gray-600 mb-4">{selectedTemplate.description}</p>
              )}

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-500">Category</p>
                  <p className="font-medium">{selectedTemplate.category}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">BSL Level</p>
                  <p className="font-medium">{selectedTemplate.bsl_level}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Version</p>
                  <p className="font-medium">{selectedTemplate.version}</p>
                </div>
                {selectedTemplate.estimated_duration_hours && (
                  <div>
                    <p className="text-sm text-gray-500">Est. Duration</p>
                    <p className="font-medium">
                      {selectedTemplate.estimated_duration_hours} hours
                    </p>
                  </div>
                )}
              </div>

              {selectedTemplate.equipment_required.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Equipment Required
                  </h3>
                  <ul className="list-disc list-inside text-sm">
                    {selectedTemplate.equipment_required.map((eq, i) => (
                      <li key={i}>{eq}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTemplate.parameters.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Parameters</h3>
                  <div className="space-y-2">
                    {selectedTemplate.parameters.map((param, i) => (
                      <div key={i} className="bg-gray-50 rounded p-2 text-sm">
                        <span className="font-medium">{param.name}</span>
                        <span className="text-gray-500"> ({param.type})</span>
                        {param.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                        {param.description && (
                          <p className="text-gray-500 text-xs mt-1">
                            {param.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedTemplate.protocol_steps.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Protocol Steps
                  </h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    {selectedTemplate.protocol_steps.map((step, i) => (
                      <li key={i}>{step.description}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
              Select a template to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
