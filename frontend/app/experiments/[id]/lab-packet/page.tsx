"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getLabPacket, generateLabPacket } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LabPacket } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { ExperimentProgressRail } from "@/components/ExperimentProgressRail";

// Filter out null, empty, and "N/A" / "n/a" placeholder values from LLM output
function isReal(v: unknown): boolean {
  if (!v) return false;
  return !/^n\/?a$/i.test(String(v).trim());
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-100">
        <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 font-medium">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-5">{children}</div>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LabPacketPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, authChecked } = useAuth();
  const experimentId = params.id as string;

  const [packet, setPacket] = useState<LabPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
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
      } catch (err) {
        if (err instanceof ApiError && err.status !== 404) {
          setError(err.message);
        }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <>
      <ExperimentProgressRail experimentId={experimentId} currentStep="lab-packet" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="alert-error mb-6">{error}</div>
        )}

        {/* No packet yet — generate */}
        {!packet && (
          <div className="bg-white border border-surface-200 p-12 text-center">
            <div className="w-12 h-12 bg-surface-900 flex items-center justify-center mx-auto mb-6">
              <span className="text-accent font-display text-xl">P</span>
            </div>
            <h1 className="font-display text-2xl text-surface-900 mb-3">Lab Packet</h1>
            <p className="text-surface-500 text-sm max-w-md mx-auto mb-8">
              Generate a detailed, bench-ready protocol with step-by-step instructions,
              reagents, acceptance criteria, and deliverables.
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

        {packet && (
          <div className="space-y-5">

            {/* ── Header ── */}
            <div className="bg-white border border-surface-200">
              <div className="px-6 py-5 border-b border-surface-100 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-1">
                    Lab Packet
                  </p>
                  <h1 className="text-xl font-semibold text-surface-900 leading-snug">
                    {packet.title}
                  </h1>
                </div>
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={generating}
                  className="btn-secondary text-[10px] px-3 py-1.5 flex-shrink-0"
                >
                  {generating ? "Regenerating..." : "Regenerate"}
                </button>
              </div>

              {/* Objective */}
              <div className="px-6 py-5 border-b border-surface-100">
                <h2 className="text-[10px] tracking-widest-plus uppercase text-surface-400 mb-2">
                  Objective
                </h2>
                <p className="text-sm text-surface-700 leading-relaxed">{packet.objective}</p>
              </div>

            </div>

            {/* ── Study Parameters ── */}
            {packet.study_parameters && (
              <Section title="Study Parameters">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-surface-100">
                  {Object.entries(packet.study_parameters)
                    .filter(([, v]) => isReal(v))
                    .map(([key, value]) => (
                      <div key={key} className="bg-white px-5 py-4">
                        <p className="text-[10px] text-surface-400 mb-1">
                          {key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                        </p>
                        <p className="text-sm font-semibold text-surface-900">{value}</p>
                      </div>
                    ))}
                </div>
              </Section>
            )}

            {/* ── Test Articles ── */}
            {packet.test_articles && packet.test_articles.length > 0 && (
              <Section title="Test Articles">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-100 text-[10px] tracking-widest-plus uppercase text-surface-400">
                        <th className="text-left px-6 py-3 font-medium">ID</th>
                        <th className="text-left px-6 py-3 font-medium">Role</th>
                        <th className="text-left px-6 py-3 font-medium">Top Conc.</th>
                        <th className="text-left px-6 py-3 font-medium">Dilution</th>
                        <th className="text-left px-6 py-3 font-medium">Vehicle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-50">
                      {packet.test_articles.map((ta, i) => (
                        <tr key={i} className="text-surface-700">
                          <td className="px-6 py-3 font-medium text-surface-900">{ta.id}</td>
                          <td className="px-6 py-3 text-surface-500">{ta.role}</td>
                          <td className="px-6 py-3 font-mono text-xs">{ta.top_concentration || "—"}</td>
                          <td className="px-6 py-3 text-xs">{ta.dilution_scheme || "—"}</td>
                          <td className="px-6 py-3 text-xs">{ta.vehicle || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {packet.compound_supply_instructions && (
                  <div className="mx-6 mb-5 mt-1 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <span className="font-semibold">Sponsor supply: </span>
                      {packet.compound_supply_instructions}
                    </p>
                  </div>
                )}
              </Section>
            )}

            {/* ── Cell Requirements ── */}
            {(() => {
              if (!packet.cell_requirements) return null;
              const rows = Object.entries(packet.cell_requirements).filter(([, v]) => isReal(v));
              if (rows.length === 0) return null;
              return (
                <Section title="Cell Culture Requirements">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-surface-100">
                    {rows.map(([key, value]) => (
                      <div key={key} className="bg-white px-5 py-4">
                        <p className="text-[10px] text-surface-400 mb-1">
                          {key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                        </p>
                        <p className="text-sm text-surface-700 leading-relaxed">{value}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              );
            })()}

            {/* ── Protocol Steps ── */}
            {packet.protocol_steps && packet.protocol_steps.length > 0 && (
              <Section title="Protocol — Step by Step">
                <div className="divide-y divide-surface-100">
                  {packet.protocol_steps.map((step, i) => (
                    <div key={i} className="px-6 py-5 flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-surface-900 text-white text-xs font-bold flex items-center justify-center rounded-sm">
                        {step.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-2">
                          <h3 className="text-sm font-semibold text-surface-900">{step.title}</h3>
                          {step.day && (
                            <span className="text-[10px] font-mono text-surface-400">{step.day}</span>
                          )}
                        </div>
                        <p className="text-sm text-surface-700 leading-relaxed">{step.procedure}</p>
                        {step.critical_notes && (
                          <p className="text-xs text-surface-500 italic mt-2 leading-relaxed">
                            &#9632; {step.critical_notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Legacy: Design (v1 packets) ── */}
            {!packet.protocol_steps && packet.design && (
              <Section title="Experimental Design">
                <SectionBody>
                  {packet.design.overview && (
                    <p className="text-sm text-surface-700 mb-4">{packet.design.overview}</p>
                  )}
                  {packet.design.work_packages.length > 0 && (
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
                  )}
                  {packet.design.controls.length > 0 && (
                    <ul className="mt-4 space-y-2">
                      {packet.design.controls.map((c, i) => (
                        <li key={i} className="text-sm text-surface-700 pl-3 border-l-2 border-surface-200">{c}</li>
                      ))}
                    </ul>
                  )}
                  {packet.design.success_criteria.length > 0 && (
                    <ul className="mt-4 space-y-2">
                      {packet.design.success_criteria.map((sc, i) => (
                        <li key={i} className="flex gap-2 text-sm text-surface-700">
                          <span className="text-accent mt-0.5">&#10003;</span>{sc}
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionBody>
              </Section>
            )}

            {/* ── Reagents & Consumables ── */}
            {packet.reagents_and_consumables && packet.reagents_and_consumables.length > 0 && (
              <Section title="Reagents and Consumables">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-100 text-[10px] tracking-widest-plus uppercase text-surface-400">
                        <th className="text-left px-6 py-3 font-medium">Item</th>
                        <th className="text-left px-6 py-3 font-medium">Specification</th>
                        <th className="text-left px-6 py-3 font-medium">Supplier</th>
                        <th className="text-left px-6 py-3 font-medium">Catalog #</th>
                        <th className="text-left px-6 py-3 font-medium">Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-50">
                      {packet.reagents_and_consumables.map((r, i) => (
                        <tr key={i} className="text-surface-700">
                          <td className="px-6 py-3 font-medium text-surface-900">{r.item}</td>
                          <td className="px-6 py-3 text-surface-500 text-xs">{r.specification || "—"}</td>
                          <td className="px-6 py-3 text-surface-500">{r.supplier || "—"}</td>
                          <td className="px-6 py-3 font-mono text-xs text-surface-500">{r.catalog_or_id || "—"}</td>
                          <td className="px-6 py-3">
                            {r.link ? (
                              <a href={r.link} target="_blank" rel="noopener noreferrer"
                                className="text-accent hover:text-accent-dim text-xs underline">
                                View
                              </a>
                            ) : <span className="text-surface-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ── Legacy: Materials (v1 packets) ── */}
            {!packet.reagents_and_consumables && packet.materials && packet.materials.length > 0 && (
              <Section title="Materials">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-100 text-[10px] tracking-widest-plus uppercase text-surface-400">
                        <th className="text-left px-6 py-3 font-medium">Item</th>
                        <th className="text-left px-6 py-3 font-medium">Supplier</th>
                        <th className="text-left px-6 py-3 font-medium">Catalog #</th>
                        <th className="text-left px-6 py-3 font-medium">Link</th>
                        <th className="text-left px-6 py-3 font-medium">Purpose</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-50">
                      {packet.materials.map((m, i) => (
                        <tr key={i} className="text-surface-700">
                          <td className="px-6 py-3 font-medium">{m.item}</td>
                          <td className="px-6 py-3 text-surface-500">{m.supplier || "—"}</td>
                          <td className="px-6 py-3 font-mono text-xs text-surface-500">{m.catalog_or_id || "—"}</td>
                          <td className="px-6 py-3">
                            {m.link ? (
                              <a href={m.link} target="_blank" rel="noopener noreferrer"
                                className="text-accent hover:text-accent-dim text-xs underline">View</a>
                            ) : <span className="text-surface-300">—</span>}
                          </td>
                          <td className="px-6 py-3 text-surface-500">{m.purpose || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ── Acceptance Criteria ── */}
            {packet.acceptance_criteria && packet.acceptance_criteria.length > 0 && (
              <Section title="Acceptance Criteria">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-100 text-[10px] tracking-widest-plus uppercase text-surface-400">
                        <th className="text-left px-6 py-3 font-medium">Parameter</th>
                        <th className="text-left px-6 py-3 font-medium">Requirement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-50">
                      {packet.acceptance_criteria.map((ac, i) => (
                        <tr key={i} className="text-surface-700">
                          <td className="px-6 py-3 text-surface-600">{ac.parameter}</td>
                          <td className="px-6 py-3 font-medium text-surface-900">{ac.requirement}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ── Deliverables ── */}
            {packet.deliverables && packet.deliverables.length > 0 && (
              <Section title="Deliverables">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-100 text-[10px] tracking-widest-plus uppercase text-surface-400">
                        <th className="text-left px-6 py-3 font-medium w-48">Deliverable</th>
                        <th className="text-left px-6 py-3 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-50">
                      {packet.deliverables.map((d, i) => (
                        <tr key={i} className="text-surface-700">
                          <td className="px-6 py-3 font-medium text-surface-900 align-top">{d.name}</td>
                          <td className="px-6 py-3 text-surface-600 text-xs leading-relaxed">{d.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ── Sponsor Inputs ── */}
            {packet.sponsor_provided_inputs && packet.sponsor_provided_inputs.length > 0 && (
              <Section title="Sponsor-Provided Inputs">
                <SectionBody>
                  <ul className="space-y-2">
                    {packet.sponsor_provided_inputs.map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm text-surface-700">
                        <span className="text-surface-300 mt-0.5 flex-shrink-0">&#9744;</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </SectionBody>
              </Section>
            )}

            {/* ── Legacy: Handoff (v1) ── */}
            {!packet.sponsor_provided_inputs && packet.handoff_package_for_lab && packet.handoff_package_for_lab.length > 0 && (
              <Section title="Handoff Checklist">
                <SectionBody>
                  <ul className="space-y-2">
                    {packet.handoff_package_for_lab.map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm text-surface-700">
                        <span className="text-surface-300 mt-0.5">&#9744;</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </SectionBody>
              </Section>
            )}

            {/* ── Protocol References ── */}
            {packet.protocol_references && packet.protocol_references.length > 0 && (
              <Section title="Protocol References">
                <div className="divide-y divide-surface-50">
                  {packet.protocol_references.map((ref, i) => (
                    <div key={i} className="px-6 py-4">
                      <p className="text-sm font-medium text-surface-800">{ref.title}</p>
                      {ref.use && (
                        <p className="text-xs text-surface-500 mt-0.5 leading-relaxed">{ref.use}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

          </div>
        )}
      </div>
    </>
  );
}
