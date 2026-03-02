"""Prompt template for LLM-powered lab packet generation."""

LAB_PACKET_SYSTEM_PROMPT = """\
You are a senior research scientist designing concrete, actionable experiments \
for a wet lab validation marketplace. You produce detailed lab packets that are \
specific enough for a competent lab technician or postdoc to execute with minimal \
additional design work."""

LAB_PACKET_PROMPT = """\
Generate a detailed lab packet for the following experiment request.

EXPERIMENT TYPE: {experiment_type}
TITLE: {title}
HYPOTHESIS: {hypothesis_statement}
NULL HYPOTHESIS: {null_hypothesis}
BSL LEVEL: {bsl_level}
PACKAGE LEVEL: {package_level}
BUDGET MAX (USD): {budget_max_usd}

ADDITIONAL CONTEXT:
{additional_context}

Generate a JSON lab packet with this exact structure:
{{
  "title": "concise experiment title (< 15 words)",
  "objective": "one-sentence goal of the experiment",
  "readouts": [
    "Primary: the main measurable outcome with quantitative threshold",
    "Secondary: supporting measurement 1",
    "Secondary: supporting measurement 2"
  ],
  "design": {{
    "overview": "1-2 sentence experimental strategy",
    "work_packages": [
      "WP1: first phase of work with specifics",
      "WP2: second phase",
      "WP3: analysis and QC"
    ],
    "controls": [
      "Positive control: description and expected outcome",
      "Negative control: description",
      "Technical control: if applicable"
    ],
    "sample_size_plan": "Number of replicates, samples, conditions with justification",
    "success_criteria": [
      "Quantitative threshold for success criterion 1",
      "Quantitative threshold for success criterion 2"
    ],
    "estimated_timeline_weeks": 8
  }},
  "materials": [
    {{
      "item": "specific reagent or equipment name",
      "supplier": "vendor name",
      "catalog_or_id": "catalog number if known",
      "purpose": "what it's used for in this experiment"
    }}
  ],
  "estimated_direct_cost_usd": {{
    "low": 500,
    "high": 2000,
    "scope": "What's included and excluded in the estimate"
  }},
  "protocol_references": [
    {{
      "title": "published protocol or method paper title",
      "use": "how this reference informs the experiment design"
    }}
  ],
  "handoff_package_for_lab": [
    "Deliverable 1 the lab needs before starting",
    "Deliverable 2",
    "Deliverable 3"
  ]
}}

Be specific about:
- Real vendor names and real catalog numbers for key reagents (do NOT fabricate URLs)
- Realistic sample sizes and timelines for a {experiment_type} experiment
- Quantitative success criteria (fold changes, p-values, thresholds)
- Appropriate controls for the experimental system
- Cost estimates that reflect the budget constraint of ${budget_max_usd}

Respond with JSON only. No markdown fences."""
