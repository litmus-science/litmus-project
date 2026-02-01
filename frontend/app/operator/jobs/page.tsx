"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listJobs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { JobCard } from "@/components/JobCard";
import type { Job } from "@/lib/types";

const categories = [
  { value: "", label: "All Categories" },
  { value: "biochemistry", label: "Biochemistry" },
  { value: "microbiology", label: "Microbiology" },
  { value: "cell_biology", label: "Cell Biology" },
  { value: "molecular_biology", label: "Molecular Biology" },
  { value: "analytical", label: "Analytical" },
];

const bslLevels = [
  { value: "", label: "All BSL Levels" },
  { value: "BSL1", label: "BSL-1" },
  { value: "BSL2", label: "BSL-2" },
];

export default function OperatorJobsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [bslFilter, setBslFilter] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function fetchJobs() {
      setLoading(true);
      try {
        const params: { category?: string; bsl_level?: string } = {};
        if (categoryFilter) params.category = categoryFilter;
        if (bslFilter) params.bsl_level = bslFilter;
        const data = await listJobs(Object.keys(params).length ? params : undefined);
        setJobs(data.jobs);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load jobs");
      } finally {
        setLoading(false);
      }
    }

    fetchJobs();
  }, [isAuthenticated, router, categoryFilter, bslFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Available Jobs</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="flex gap-4 mb-6">
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

        <select
          value={bslFilter}
          onChange={(e) => setBslFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        >
          {bslLevels.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No jobs available matching your criteria</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <JobCard key={job.experiment_id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
