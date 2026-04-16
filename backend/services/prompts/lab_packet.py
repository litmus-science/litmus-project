"""Prompt template for LLM-powered lab packet generation."""

LAB_PACKET_SYSTEM_PROMPT = """\
You are a senior research scientist writing CRO-ready lab packets — the kind of \
document a contract research organisation receives and can execute without further \
clarification. Your output is a structured protocol document, not a research proposal.

Standard of output:
- Every protocol step must name the Day it occurs, exact volumes, concentrations, \
  temperatures, centrifuge speeds, incubation times, and equipment (with model examples \
  where relevant). Do not write "appropriate volume" — write "90 µL".
- Acceptance criteria must be measurable pass/fail thresholds (Z' ≥ 0.5, %CV ≤ 15%), \
  not vague phrases.
- Controls must be specified by reagent name, concentration, and expected outcome — \
  not just "positive control".
- Materials must include the exact catalog number and specification (size, grade, format) \
  for every key reagent. Use real catalog numbers for Sigma, Promega, Gibco, Corning, \
  NEB, etc.
- Deliverables describe what the CRO returns to the sponsor — raw data files, analysis \
  formats, QC reports, certificates — not what the sponsor sends to the lab.
- Compound supply instructions describe exactly what the sponsor must provide (stock \
  concentration, purity, volume, storage conditions) before the CRO can begin.
- Work out the arithmetic: show dilution series step values, well counts, total volumes. \
  A lab technician should never have to calculate anything from your output."""

LAB_PACKET_PROMPT = """\
Generate a detailed, CRO-ready lab packet for the following experiment request.

EXPERIMENT TYPE: {experiment_type}
TITLE: {title}
HYPOTHESIS: {hypothesis_statement}
NULL HYPOTHESIS: {null_hypothesis}
BSL LEVEL: {bsl_level}
PACKAGE LEVEL: {package_level}
BUDGET MAX (USD): {budget_max_usd}

ADDITIONAL CONTEXT:
{additional_context}

Generate a JSON lab packet with this exact structure. Be as specific as a senior CRO \
scientist writing an executable protocol — not a grant proposal.

{{
  "title": "concise experiment title (< 15 words)",
  "objective": "one sentence: what is being measured, in which system, to answer what question",

  "study_parameters": {{
    "test_compounds": "N compounds + controls",
    "concentration_points": "N per compound",
    "replicates": "N technical (and/or biological if applicable)",
    "cell_line_or_organism": "species/cell line with ATCC or equivalent ID if relevant",
    "incubation_duration": "e.g. 72 hours",
    "plate_format": "e.g. 96-well white-walled clear-bottom",
    "total_wells_per_plate": "calculated number"
  }},

  "test_articles": [
    {{
      "id": "Cmpd-01 (or descriptive name)",
      "role": "test compound | positive control | vehicle control | background control",
      "top_concentration": "e.g. 100 µM",
      "dilution_scheme": "e.g. 3-fold serial, 8 points: 100 µM → 33.3 µM → ... → 45.7 nM",
      "vehicle": "e.g. 0.1% DMSO"
    }}
  ],

  "compound_supply_instructions": "Exact description of what the sponsor must supply before \
the CRO can begin: stock concentration, minimum volume, purity requirement, QC method, \
packaging, storage temperature, and deadline. Be specific.",

  "cell_requirements": {{
    "cell_line": "full name with ATCC/ECACC ID",
    "passage_range": "e.g. P5–P15",
    "mycoplasma_testing": "required within N days of assay date",
    "authentication": "STR profiling or equivalent; state whether certificate is required in deliverables",
    "culture_medium": "base medium + supplements + concentrations",
    "incubation_conditions": "temperature, CO2 %, humidity",
    "confluency_at_seeding": "e.g. 60–80% confluent log-phase cells"
  }},

  "protocol_steps": [
    {{
      "step": 1,
      "day": "Day 0",
      "title": "Step title",
      "procedure": "Full procedure text with exact volumes, concentrations, temperatures, \
equipment names (with examples e.g. Countess, EnVision). Show dilution calculations explicitly. \
Write this as bench instructions, not a summary.",
      "critical_notes": "One or two critical alerts: what to verify, what will fail the step, \
common errors to avoid. Italicise-worthy warnings."
    }}
  ],

  "reagents_and_consumables": [
    {{
      "item": "reagent or consumable name",
      "specification": "catalog size, grade, format (e.g. 100 mL kit, ≥98% purity, TC-treated)",
      "supplier": "vendor name",
      "catalog_or_id": "catalog number"
    }}
  ],

  "acceptance_criteria": [
    {{
      "parameter": "measurable parameter name (e.g. Z\\u2019 factor, vehicle %CV)",
      "requirement": "quantitative threshold (e.g. ≥ 0.5 per plate, ≤ 15% CV)"
    }}
  ],

  "deliverables": [
    {{
      "name": "deliverable name (e.g. Raw data file, IC50 summary table)",
      "description": "exact format, content, and any flagging/annotation required \
(e.g. .xlsx with plate map, compound IDs, concentrations, replicate IDs labelled)"
    }}
  ],

  "sponsor_provided_inputs": [
    "What the sponsor must hand off to the CRO before work begins (test articles, \
plate maps, SOPs, signed agreements, etc.)"
  ],

  "estimated_direct_cost_usd": {{
    "low": 500,
    "high": 2000,
    "scope": "What is and is not included in this estimate"
  }},

  "protocol_references": [
    {{
      "title": "published method, kit manual, or standard (e.g. Promega CellTiter-Glo 2.0 Technical Manual)",
      "use": "how this reference informs a specific step or decision in the protocol"
    }}
  ]
}}

Rules:
- test_articles: always include a positive control, vehicle control, and background control \
  in addition to test compounds. Name the positive control reagent specifically (e.g. \
  staurosporine for cell viability, puromycin for selection).
- protocol_steps: write at minimum 4 steps. Each step must include exact volumes and \
  quantitative parameters. Show the dilution series arithmetic in full.
- acceptance_criteria: include at minimum Z\\u2019 factor (if plate-based), vehicle control \
  %CV, positive control performance, signal-to-background ratio, and any cell quality gates.
- reagents_and_consumables: separate reagents from consumables. Include equipment used \
  (plate reader model, cell counter, etc.) as separate line items with "specification" \
  describing the measurement capability required.
- deliverables: distinguish raw data files, analysed/fitted results, QC reports, and \
  certificates separately. Specify file formats (.xlsx, .csv, .pzfx, .pdf).
- Do NOT fabricate URLs. Catalog numbers only — URLs are added post-processing.
- Use SI units throughout. Spell out µL, µM, nM — do not abbreviate differently.
- Cost estimate must reflect the budget constraint of ${budget_max_usd}.

Respond with JSON only. No markdown fences. No commentary outside the JSON."""
