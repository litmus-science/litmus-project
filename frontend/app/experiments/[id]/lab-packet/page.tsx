"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getLabPacket, generateLabPacket, getRfq, generateRfq } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LabPacket, RfqPackage } from "@/lib/types";
import { ApiError } from "@/lib/api";

export default function LabPacketPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const experimentId = params.id as string;

  const [packet, setPacket] = useState<LabPacket | null>(null);
  const [rfq, setRfq] = useState<RfqPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingRfq, setGeneratingRfq] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function load() {
      try {
        const data = await getLabPacket(experimentId);
        setPacket(data);
        // Also try loading RFQ
        try {
          const rfqData = await getRfq(experimentId);
          setRfq(rfqData);
        } catch {
          // No RFQ yet, that's fine
        }
      } catch (err) {
        // 404 = no packet yet, show generate UI
        // Also swallow network errors on initial load since the packet may just not exist
        if (err instanceof ApiError && err.status !== 404) {
          setError(err.message);
        }
        // For non-ApiError (network failures etc.), silently fall through to generate UI
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [authChecked, isAuthenticated, router, experimentId]);

  const handleGenerate = async (force = false) => {
    setGenerating(true);
    setError("");
    try {
      const data = await generateLabPacket(experimentId, force);
      setPacket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateRfq = async () => {
    setGeneratingRfq(true);
    setError("");
    try {
      const data = await generateRfq(experimentId);
      setRfq(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "RFQ generation failed");
    } finally {
      setGeneratingRfq(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href={`/experiments/${experimentId}`}
          className="text-accent hover:text-accent-dim text-sm tracking-wide"
        >
          &larr; Back to Experiment
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* No packet yet — generate */}
      {!packet && (
        <div className="bg-white border border-surface-200 p-12 text-center">
          <div className="w-12 h-12 bg-surface-900 flex items-center justify-center mx-auto mb-6">
            <span className="text-accent font-display text-xl">P</span>
          </div>
          <h1 className="font-display text-2xl text-surface-900 mb-3">
            Lab Packet
          </h1>
          <p className="text-surface-500 text-sm max-w-md mx-auto mb-8">
            Generate a detailed, bench-ready experiment design with materials,
            work packages, controls, and cost estimates.
          </p>
          <button
            onClick={() => handleGenerate()}
            disabled={generating}
            className="btn-primary text-xs"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Generating...
              </span>
            ) : (
              "Generate Lab Packet"
            )}
          </button>
        </div>
      )}

      {/* Lab Packet Display */}
      {packet && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white border border-surface-200">
            <div className="px-6 py-5 border-b border-surface-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-1">
                    Lab Packet
                  </p>
                  <h1 className="font-display text-xl text-surface-900">
                    {packet.title}
                  </h1>
                </div>
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={generating}
                  className="btn-secondary text-[10px] px-3 py-1.5"
                >
                  {generating ? "Regenerating..." : "Regenerate"}
                </button>
              </div>
            </div>

            {/* Objective */}
            <div className="px-6 py-4 border-b border-surface-100">
              <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                Objective
              </h2>
              <p className="text-sm text-surface-700">{packet.objective}</p>
            </div>

            {/* Readouts */}
            {packet.readouts.length > 0 && (
              <div className="px-6 py-4 border-b border-surface-100">
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                  Readouts
                </h2>
                <ul className="space-y-1.5">
                  {packet.readouts.map((r, i) => (
                    <li key={i} className="text-sm text-surface-700 flex gap-2">
                      <span className="text-accent font-mono text-xs mt-0.5">
                        {i + 1}
                      </span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cost Estimate */}
            {packet.estimated_direct_cost_usd && (
              <div className="px-6 py-4">
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                  Estimated Cost
                </h2>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-lg text-surface-900">
                    ${packet.estimated_direct_cost_usd.low.toLocaleString()}
                  </span>
                  <span className="text-surface-400 text-sm">&ndash;</span>
                  <span className="font-display text-lg text-surface-900">
                    ${packet.estimated_direct_cost_usd.high.toLocaleString()}
                  </span>
                </div>
                {packet.estimated_direct_cost_usd.scope && (
                  <p className="text-xs text-surface-400 mt-1">
                    {packet.estimated_direct_cost_usd.scope}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Design */}
          {packet.design && (
            <div className="bg-white border border-surface-200">
              <div className="px-6 py-4 border-b border-surface-100">
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                  Experimental Design
                </h2>
                {packet.design.overview && (
                  <p className="text-sm text-surface-700">
                    {packet.design.overview}
                  </p>
                )}
              </div>

              {/* Work Packages */}
              {packet.design.work_packages.length > 0 && (
                <div className="px-6 py-4 border-b border-surface-100">
                  <h3 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                    Work Packages
                  </h3>
                  <div className="space-y-3">
                    {packet.design.work_packages.map((wp, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-surface-100 text-surface-500 text-xs font-mono flex items-center justify-center">
                          {i + 1}
                        </span>
                        <p className="text-sm text-surface-700">{wp}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Controls */}
              {packet.design.controls.length > 0 && (
                <div className="px-6 py-4 border-b border-surface-100">
                  <h3 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                    Controls
                  </h3>
                  <ul className="space-y-2">
                    {packet.design.controls.map((c, i) => (
                      <li
                        key={i}
                        className="text-sm text-surface-700 pl-3 border-l-2 border-surface-200"
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sample Size & Success Criteria */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-surface-100">
                {packet.design.sample_size_plan && (
                  <div className="px-6 py-4">
                    <h3 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                      Sample Size Plan
                    </h3>
                    <p className="text-sm text-surface-700">
                      {packet.design.sample_size_plan}
                    </p>
                  </div>
                )}
                {packet.design.estimated_timeline_weeks && (
                  <div className="px-6 py-4">
                    <h3 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                      Timeline
                    </h3>
                    <p className="font-display text-2xl text-surface-900">
                      {packet.design.estimated_timeline_weeks}
                      <span className="text-sm text-surface-400 ml-1">
                        weeks
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Success Criteria */}
              {packet.design.success_criteria.length > 0 && (
                <div className="px-6 py-4 border-t border-surface-100">
                  <h3 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                    Success Criteria
                  </h3>
                  <ul className="space-y-2">
                    {packet.design.success_criteria.map((sc, i) => (
                      <li key={i} className="flex gap-2 text-sm text-surface-700">
                        <span className="text-accent mt-0.5">&#10003;</span>
                        {sc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Materials */}
          {packet.materials.length > 0 && (
            <div className="bg-white border border-surface-200">
              <div className="px-6 py-4 border-b border-surface-100">
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400">
                  Materials
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 text-[10px] tracking-widest-plus uppercase text-surface-400">
                      <th className="text-left px-6 py-3 font-medium">Item</th>
                      <th className="text-left px-6 py-3 font-medium">
                        Supplier
                      </th>
                      <th className="text-left px-6 py-3 font-medium">
                        Catalog #
                      </th>
                      <th className="text-left px-6 py-3 font-medium">
                        Link
                      </th>
                      <th className="text-left px-6 py-3 font-medium">
                        Purpose
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {packet.materials.map((m, i) => (
                      <tr key={i} className="text-surface-700">
                        <td className="px-6 py-3 font-medium">{m.item}</td>
                        <td className="px-6 py-3 text-surface-500">
                          {m.supplier || "—"}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs text-surface-500">
                          {m.catalog_or_id || "—"}
                        </td>
                        <td className="px-6 py-3">
                          {m.link ? (
                            <a
                              href={m.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:text-accent-dim text-xs underline"
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-surface-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-surface-500">
                          {m.purpose || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Protocol References */}
          {packet.protocol_references.length > 0 && (
            <div className="bg-white border border-surface-200">
              <div className="px-6 py-4 border-b border-surface-100">
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400">
                  Protocol References
                </h2>
              </div>
              <div className="divide-y divide-surface-50">
                {packet.protocol_references.map((ref, i) => (
                  <div key={i} className="px-6 py-3">
                    <p className="text-sm font-medium text-surface-800">
                      {ref.title}
                    </p>
                    {ref.use && (
                      <p className="text-xs text-surface-500 mt-0.5">
                        {ref.use}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Handoff Package */}
          {packet.handoff_package_for_lab.length > 0 && (
            <div className="bg-white border border-surface-200">
              <div className="px-6 py-4 border-b border-surface-100">
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400">
                  Handoff Checklist
                </h2>
              </div>
              <div className="px-6 py-4">
                <ul className="space-y-2">
                  {packet.handoff_package_for_lab.map((item, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-sm text-surface-700"
                    >
                      <span className="text-surface-300 mt-0.5">&#9744;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Generation metadata */}
          {(packet.llm_model || packet.llm_cost_usd) && (
            <div className="text-xs text-surface-400 flex gap-4">
              {packet.llm_model && <span>Model: {packet.llm_model}</span>}
              {packet.llm_cost_usd != null && (
                <span>
                  Generation cost: ${packet.llm_cost_usd.toFixed(4)}
                </span>
              )}
            </div>
          )}

          {/* RFQ Section */}
          <div className="border-t border-surface-200 pt-6">
            {!rfq ? (
              <div className="bg-white border border-surface-200 p-8 text-center">
                <h2 className="font-display text-lg text-surface-900 mb-2">
                  Request for Quote
                </h2>
                <p className="text-surface-500 text-sm mb-6 max-w-md mx-auto">
                  Generate an RFQ package to solicit quotes from operators.
                  Includes scope of work, deliverables, acceptance criteria, and
                  timeline.
                </p>
                <button
                  onClick={handleGenerateRfq}
                  disabled={generatingRfq}
                  className="btn-primary text-xs"
                >
                  {generatingRfq ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Generating RFQ...
                    </span>
                  ) : (
                    "Generate RFQ"
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-white border border-surface-200">
                <div className="px-6 py-4 border-b border-surface-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-1">
                        RFQ &middot; {rfq.rfq_id}
                      </p>
                      <h2 className="font-display text-lg text-surface-900">
                        {rfq.title}
                      </h2>
                    </div>
                    <span className="text-[10px] tracking-widest-plus uppercase bg-surface-100 text-surface-500 px-2 py-1">
                      {rfq.status}
                    </span>
                  </div>
                  <p className="text-sm text-surface-600 mt-2">
                    {rfq.objective}
                  </p>
                </div>

                {/* Scope */}
                {rfq.scope_of_work.length > 0 && (
                  <div className="px-6 py-4 border-b border-surface-100">
                    <h3 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                      Scope of Work
                    </h3>
                    <ul className="space-y-2">
                      {rfq.scope_of_work.map((s, i) => (
                        <li key={i} className="text-sm text-surface-700 flex gap-2">
                          <span className="text-accent font-mono text-xs mt-0.5">
                            {i + 1}
                          </span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Deliverables */}
                {rfq.required_deliverables.length > 0 && (
                  <div className="px-6 py-4 border-b border-surface-100">
                    <h3 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                      Required Deliverables
                    </h3>
                    <ul className="space-y-1.5">
                      {rfq.required_deliverables.map((d, i) => (
                        <li key={i} className="text-sm text-surface-700 flex gap-2">
                          <span className="text-surface-300">&#8226;</span>
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Acceptance Criteria */}
                {rfq.acceptance_criteria.length > 0 && (
                  <div className="px-6 py-4 border-b border-surface-100">
                    <h3 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                      Acceptance Criteria
                    </h3>
                    <ul className="space-y-1.5">
                      {rfq.acceptance_criteria.map((a, i) => (
                        <li key={i} className="text-sm text-surface-700 flex gap-2">
                          <span className="text-accent mt-0.5">&#10003;</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Timeline */}
                {rfq.timeline && (
                  <div className="px-6 py-4">
                    <h3 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-3">
                      Timeline
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Issued", value: rfq.timeline.rfq_issue_date },
                        {
                          label: "Questions Due",
                          value: rfq.timeline.questions_due,
                        },
                        { label: "Quote Due", value: rfq.timeline.quote_due },
                        {
                          label: "Target Kickoff",
                          value: rfq.timeline.target_kickoff,
                        },
                      ].map((t) => (
                        <div key={t.label}>
                          <p className="text-[10px] text-surface-400 uppercase tracking-wider">
                            {t.label}
                          </p>
                          <p className="text-sm font-mono text-surface-700 mt-0.5">
                            {t.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
