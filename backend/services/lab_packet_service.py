"""Service for generating lab packets and RFQ packages from experiments."""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from urllib.parse import quote_plus

from backend.services.llm_service import LLMService, LLMResponse
from backend.services.prompts.lab_packet import LAB_PACKET_PROMPT, LAB_PACKET_SYSTEM_PROMPT
from backend.types import JsonObject

logger = logging.getLogger("litmus.lab_packet")

# Vendor search URL templates keyed by normalized supplier name.
# These are search-page URLs (not direct product pages) so they don't 404 —
# they always load and show results (or "no results") in the browser.
_VENDOR_SEARCH_URLS: dict[str, str] = {
    "sigma-aldrich": "https://www.sigmaaldrich.com/US/en/search/{catalog}",
    "sigma": "https://www.sigmaaldrich.com/US/en/search/{catalog}",
    "milliporesigma": "https://www.sigmaaldrich.com/US/en/search/{catalog}",
    "thermo fisher": "https://www.thermofisher.com/search/results?query={catalog}",
    "thermo fisher scientific": "https://www.thermofisher.com/search/results?query={catalog}",
    "thermofisher": "https://www.thermofisher.com/search/results?query={catalog}",
    "invitrogen": "https://www.thermofisher.com/search/results?query={catalog}",
    "applied biosystems": "https://www.thermofisher.com/search/results?query={catalog}",
    "gibco": "https://www.thermofisher.com/search/results?query={catalog}",
    "bio-rad": "https://www.bio-rad.com/en-us/search-results?text={catalog}",
    "biorad": "https://www.bio-rad.com/en-us/search-results?text={catalog}",
    "qiagen": "https://www.qiagen.com/us/search?q={catalog}",
    "new england biolabs": "https://www.neb.com/en-us/search#q={catalog}",
    "neb": "https://www.neb.com/en-us/search#q={catalog}",
    "promega": "https://www.promega.com/search/?catNum={catalog}",
    "agilent": "https://www.agilent.com/search/?Ntt={catalog}",
    "abcam": "https://www.abcam.com/en-us/search?keywords={catalog}",
    "corning": "https://www.corning.com/worldwide/en/search.html?query={catalog}",
    "atcc": "https://www.atcc.org/search#q={catalog}",
    "addgene": "https://www.addgene.org/search/all/?q={catalog}",
    "idt": "https://www.idtdna.com/site/catalog/search?term={catalog}",
    "takara": "https://www.takarabio.com/search-results?keyword={catalog}",
    "takara bio": "https://www.takarabio.com/search-results?keyword={catalog}",
    "zymo research": "https://www.zymoresearch.com/search?q={catalog}",
    "cell signaling technology": "https://www.cellsignal.com/search?query={catalog}",
    "cst": "https://www.cellsignal.com/search?query={catalog}",
}


def _build_material_link(supplier: str | None, catalog: str | None) -> str:
    """Build a vendor search URL from supplier + catalog number.

    Returns the URL if the supplier is recognized, empty string otherwise.
    No link is better than a broken link.
    """
    if not catalog or not supplier:
        return ""
    catalog_clean = catalog.strip()
    if not catalog_clean:
        return ""
    key = supplier.strip().lower()
    template = _VENDOR_SEARCH_URLS.get(key)
    if not template:
        return ""
    return template.format(catalog=quote_plus(catalog_clean))


def _build_additional_context(spec: JsonObject) -> str:
    """Extract type-specific fields from the experiment specification."""
    parts: list[str] = []

    # Type-specific sections
    type_sections = [
        "sanger", "qpcr", "cell_viability", "enzyme_inhibition",
        "microbial_growth", "mic_mbc", "zone_of_inhibition", "custom_protocol",
    ]
    for section in type_sections:
        if section in spec and spec[section]:
            parts.append(f"{section.upper()} PARAMETERS: {json.dumps(spec[section], indent=2)}")

    # Materials provided
    if spec.get("materials_provided"):
        parts.append(f"MATERIALS PROVIDED: {json.dumps(spec['materials_provided'], indent=2)}")

    # Replicates
    if spec.get("replicates"):
        parts.append(f"REPLICATES: {json.dumps(spec['replicates'])}")

    # Acceptance criteria
    if spec.get("acceptance_criteria"):
        parts.append(f"ACCEPTANCE CRITERIA: {json.dumps(spec['acceptance_criteria'], indent=2)}")

    return "\n\n".join(parts) if parts else "No additional context provided."


async def generate_lab_packet(
    spec: JsonObject,
    llm_service: LLMService,
) -> tuple[JsonObject, str | None, float | None]:
    """Generate a lab packet from an experiment specification.

    Returns (packet_data, model_name, cost_usd).
    """
    hypothesis = spec.get("hypothesis", {})
    if isinstance(hypothesis, dict):
        hypothesis_statement = hypothesis.get("statement", "")
        null_hypothesis = hypothesis.get("null_hypothesis", "Not specified")
    else:
        hypothesis_statement = str(hypothesis)
        null_hypothesis = "Not specified"

    compliance = spec.get("compliance", {})
    bsl_level = compliance.get("bsl", "BSL1") if isinstance(compliance, dict) else "BSL1"

    deliverables = spec.get("deliverables", {})
    package_level = (
        deliverables.get("minimum_package_level", "L1_BASIC_QC")
        if isinstance(deliverables, dict)
        else "L1_BASIC_QC"
    )

    budget = spec.get("turnaround_budget", {})
    budget_max = budget.get("budget_max_usd", 500) if isinstance(budget, dict) else 500

    prompt = LAB_PACKET_PROMPT.format(
        experiment_type=spec.get("experiment_type", "CUSTOM"),
        title=spec.get("title", "Untitled Experiment"),
        hypothesis_statement=hypothesis_statement,
        null_hypothesis=null_hypothesis,
        bsl_level=bsl_level,
        package_level=package_level,
        budget_max_usd=budget_max,
        additional_context=_build_additional_context(spec),
    )

    response: LLMResponse = await llm_service.generate(
        prompt=prompt,
        system_prompt=LAB_PACKET_SYSTEM_PROMPT,
        temperature=0.2,
        max_tokens=4096,
    )

    # Parse JSON from response
    content = response.content.strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]

    packet_data = json.loads(content.strip())

    # Post-process materials: build vendor search URLs for recognized suppliers
    for mat in packet_data.get("materials", []):
        link = _build_material_link(mat.get("supplier"), mat.get("catalog_or_id"))
        if link:
            mat["link"] = link

    # Calculate cost from usage
    cost_usd: float | None = None
    if response.usage:
        input_tokens = response.usage.get("input_tokens", 0)
        output_tokens = response.usage.get("output_tokens", 0)
        # Approximate cost based on Sonnet pricing
        cost_usd = (input_tokens * 3.0 + output_tokens * 15.0) / 1_000_000

    return packet_data, response.model, cost_usd


def generate_rfq_from_packet(
    packet_data: JsonObject,
    experiment_id: str,
    spec: JsonObject,
    questions_due_days: int = 7,
    quote_due_days: int = 14,
    target_kickoff_days: int = 28,
) -> JsonObject:
    """Deterministically derive an RFQ package from a lab packet. No LLM call needed."""
    today = date.today()

    design = packet_data.get("design", {})
    work_packages = design.get("work_packages", []) if isinstance(design, dict) else []
    controls = design.get("controls", []) if isinstance(design, dict) else []
    success_criteria = design.get("success_criteria", []) if isinstance(design, dict) else []
    readouts = packet_data.get("readouts", [])
    handoff = packet_data.get("handoff_package_for_lab", [])

    # Derive scope of work from work packages
    scope_of_work = list(work_packages)
    if controls:
        scope_of_work.append(f"Include controls: {'; '.join(controls)}")

    # Derive deliverables from readouts + handoff
    required_deliverables = []
    for readout in readouts:
        required_deliverables.append(f"Data for: {readout}")
    required_deliverables.append("Raw instrument/output files in machine-readable format")
    required_deliverables.append("QC summary and analysis report")

    # Acceptance criteria from success criteria
    acceptance_criteria = list(success_criteria)
    acceptance_criteria.append("All protocol deviations documented with timestamps and notes")

    # Standard quote requirements
    quote_requirements = [
        "Fixed fee or milestone-based pricing breakdown",
        "Expected timeline to first results",
        "Sample handling and storage requirements",
        "Data delivery format and transfer mechanism",
    ]

    # Client-provided inputs from handoff package
    client_provided_inputs = list(handoff) if handoff else [
        "Experiment specification and hypothesis details",
        "Any client-supplied materials or reagents",
    ]

    # Build budget context
    cost_est = packet_data.get("estimated_direct_cost_usd", {})
    budget_info = spec.get("turnaround_budget", {})
    budget_max = budget_info.get("budget_max_usd", "") if isinstance(budget_info, dict) else ""

    title = f"RFQ: {packet_data.get('title', 'Experiment')}"
    objective = packet_data.get("objective", "")

    rfq_id = f"rfq-{experiment_id[:8]}-v1"

    return {
        "rfq_id": rfq_id,
        "title": title,
        "objective": objective,
        "scope_of_work": scope_of_work,
        "client_provided_inputs": client_provided_inputs,
        "required_deliverables": required_deliverables,
        "acceptance_criteria": acceptance_criteria,
        "quote_requirements": quote_requirements,
        "timeline": {
            "rfq_issue_date": today.isoformat(),
            "questions_due": (today + timedelta(days=questions_due_days)).isoformat(),
            "quote_due": (today + timedelta(days=quote_due_days)).isoformat(),
            "target_kickoff": (today + timedelta(days=target_kickoff_days)).isoformat(),
        },
    }
