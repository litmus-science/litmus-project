"""
Litmus MCP Server

Implements the Model Context Protocol server for Litmus experiment intake,
validation, routing, and submission.

Tools:
- intake.draft_from_text: Convert natural language to structured intake
- intake.validate: Validate intake against schema
- intake.suggest_questions: Get questions to improve completeness
- routing.match_labs: Route intake to best-fit labs
- labs.search: Search labs with filters
- labs.get: Get a specific lab profile
- intake.submit: Submit an intake
- files.create_upload_url: Create signed upload URL
- files.attach_to_intake: Attach file to intake

Resources:
- litmus://schemas/experiment_intake
- litmus://schemas/lab_profile
- litmus://taxonomy/deliverables
- litmus://rubric/routing_weights
"""

import json
import uuid
import sys
from pathlib import Path
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Resource,
    Tool,
    TextContent,
    EmbeddedResource,
)

# Add router to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "router"))

from router import (
    route_intake,
    validate_intake,
    compute_spec_completeness,
    DEFAULT_WEIGHTS,
)

# Initialize server
server = Server("litmus-intake-router")

# ============================================================================
# Data Loading
# ============================================================================

def load_json(filename: str) -> dict:
    """Load a JSON file from the project."""
    path = PROJECT_ROOT / filename
    with open(path) as f:
        return json.load(f)


def get_schemas() -> dict[str, dict]:
    """Load all schemas."""
    return {
        "experiment_intake": load_json("schemas/experiment_intake.json"),
        "lab_profile": load_json("schemas/lab_profile.json"),
        "deliverables_taxonomy": load_json("schemas/deliverables_taxonomy.json"),
    }


def get_labs() -> list[dict]:
    """Load lab profiles (using examples as mock data)."""
    labs = []
    examples_dir = PROJECT_ROOT / "examples"
    for path in examples_dir.glob("lab_profile_*.json"):
        with open(path) as f:
            labs.append(json.load(f))
    return labs


def get_routing_weights() -> dict:
    """Get current routing weights."""
    return {
        "menu_fit": DEFAULT_WEIGHTS.menu_fit,
        "turnaround_fit": DEFAULT_WEIGHTS.turnaround_fit,
        "spec_completeness": DEFAULT_WEIGHTS.spec_completeness,
        "cost_fit": DEFAULT_WEIGHTS.cost_fit,
        "quality": DEFAULT_WEIGHTS.quality,
        "logistics": DEFAULT_WEIGHTS.logistics,
        "deliverables_match": DEFAULT_WEIGHTS.deliverables_match,
    }


# In-memory storage for demo (would be database in production)
_submissions: dict[str, dict] = {}
_files: dict[str, dict] = {}


# ============================================================================
# Resources
# ============================================================================

@server.list_resources()
async def list_resources() -> list[Resource]:
    """List available resources."""
    return [
        Resource(
            uri="litmus://schemas/experiment_intake",
            name="Experiment Intake JSON Schema",
            mimeType="application/schema+json",
            description="Canonical JSON Schema for experiment intake submissions.",
        ),
        Resource(
            uri="litmus://schemas/lab_profile",
            name="Lab Profile JSON Schema",
            mimeType="application/schema+json",
            description="Canonical JSON Schema for lab directory entries.",
        ),
        Resource(
            uri="litmus://taxonomy/deliverables",
            name="Deliverables Taxonomy",
            mimeType="application/json",
            description="Canonical enums for raw formats, processed outputs, and package levels.",
        ),
        Resource(
            uri="litmus://rubric/routing_weights",
            name="Routing Weights",
            mimeType="application/json",
            description="Current weights used by routing.match_labs.",
        ),
    ]


@server.read_resource()
async def read_resource(uri: str) -> str:
    """Read a resource by URI."""
    schemas = get_schemas()

    if uri == "litmus://schemas/experiment_intake":
        return json.dumps(schemas["experiment_intake"], indent=2)
    elif uri == "litmus://schemas/lab_profile":
        return json.dumps(schemas["lab_profile"], indent=2)
    elif uri == "litmus://taxonomy/deliverables":
        return json.dumps(schemas["deliverables_taxonomy"], indent=2)
    elif uri == "litmus://rubric/routing_weights":
        return json.dumps(get_routing_weights(), indent=2)
    else:
        raise ValueError(f"Unknown resource: {uri}")


# ============================================================================
# Tools
# ============================================================================

@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools."""
    return [
        Tool(
            name="intake.draft_from_text",
            description="Convert free-form user text into a best-effort draft intake JSON.",
            inputSchema={
                "type": "object",
                "required": ["text"],
                "properties": {
                    "text": {"type": "string", "minLength": 10, "maxLength": 20000},
                    "experiment_type_hint": {
                        "type": "string",
                        "enum": [
                            "SANGER_PLASMID_VERIFICATION", "QPCR_EXPRESSION",
                            "CELL_VIABILITY_IC50", "ENZYME_INHIBITION_IC50",
                            "MICROBIAL_GROWTH_MATRIX", "MIC_MBC_ASSAY",
                            "ZONE_OF_INHIBITION", "CUSTOM"
                        ]
                    },
                    "defaults": {"type": "object"},
                    "language": {"type": "string", "default": "en"},
                },
            },
        ),
        Tool(
            name="intake.validate",
            description="Validate an intake JSON against the experiment_intake schema.",
            inputSchema={
                "type": "object",
                "required": ["intake"],
                "properties": {
                    "intake": {"type": "object"},
                    "strict": {"type": "boolean", "default": False},
                },
            },
        ),
        Tool(
            name="intake.suggest_questions",
            description="Return questions to improve intake completeness.",
            inputSchema={
                "type": "object",
                "required": ["intake"],
                "properties": {
                    "intake": {"type": "object"},
                    "target_completeness": {"type": "number", "default": 0.7},
                    "max_questions": {"type": "integer", "default": 3},
                },
            },
        ),
        Tool(
            name="routing.match_labs",
            description="Rank labs for a validated intake using hard filters + weighted scoring.",
            inputSchema={
                "type": "object",
                "required": ["intake"],
                "properties": {
                    "intake": {"type": "object"},
                    "top_k": {"type": "integer", "default": 3},
                    "strict_deliverables": {"type": "boolean", "default": False},
                    "region_preference": {"type": "string"},
                },
            },
        ),
        Tool(
            name="labs.search",
            description="Search labs using structured filters.",
            inputSchema={
                "type": "object",
                "properties": {
                    "experiment_type": {"type": "string"},
                    "max_bsl": {"type": "string"},
                    "shipping_mode": {"type": "string"},
                    "minimum_package_level": {"type": "string"},
                    "region": {"type": "string"},
                    "page_size": {"type": "integer", "default": 20},
                },
            },
        ),
        Tool(
            name="labs.get",
            description="Fetch a lab profile by ID.",
            inputSchema={
                "type": "object",
                "required": ["lab_id"],
                "properties": {
                    "lab_id": {"type": "string"},
                },
            },
        ),
        Tool(
            name="intake.submit",
            description="Persist a validated intake and return a submission ID.",
            inputSchema={
                "type": "object",
                "required": ["intake"],
                "properties": {
                    "intake": {"type": "object"},
                    "selected_lab_id": {"type": "string"},
                    "notes": {"type": "string"},
                },
            },
        ),
        Tool(
            name="files.create_upload_url",
            description="Create a signed upload URL for an attachment.",
            inputSchema={
                "type": "object",
                "required": ["filename", "mime_type", "size_bytes"],
                "properties": {
                    "filename": {"type": "string"},
                    "mime_type": {"type": "string"},
                    "size_bytes": {"type": "integer"},
                },
            },
        ),
        Tool(
            name="files.attach_to_intake",
            description="Attach an uploaded file to a submission.",
            inputSchema={
                "type": "object",
                "required": ["submission_id", "file_id", "attachment_type"],
                "properties": {
                    "submission_id": {"type": "string"},
                    "file_id": {"type": "string"},
                    "attachment_type": {
                        "type": "string",
                        "enum": ["PLATE_MAP", "REFERENCE_SEQUENCE", "PROTOCOL", "SDS", "STRUCTURE_FILE", "MEDIA_RECIPE", "OTHER"]
                    },
                    "notes": {"type": "string"},
                },
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls."""

    if name == "intake.draft_from_text":
        return await handle_draft_from_text(arguments)
    elif name == "intake.validate":
        return await handle_validate(arguments)
    elif name == "intake.suggest_questions":
        return await handle_suggest_questions(arguments)
    elif name == "routing.match_labs":
        return await handle_match_labs(arguments)
    elif name == "labs.search":
        return await handle_labs_search(arguments)
    elif name == "labs.get":
        return await handle_labs_get(arguments)
    elif name == "intake.submit":
        return await handle_submit(arguments)
    elif name == "files.create_upload_url":
        return await handle_create_upload_url(arguments)
    elif name == "files.attach_to_intake":
        return await handle_attach_to_intake(arguments)
    else:
        raise ValueError(f"Unknown tool: {name}")


# ============================================================================
# Tool Handlers
# ============================================================================

async def handle_draft_from_text(args: dict) -> list[TextContent]:
    """
    Convert free-form text to a draft intake.

    Note: In production, this would use an LLM to parse the text.
    This implementation uses simple keyword matching as a demo.
    """
    text = args["text"].lower()
    experiment_type_hint = args.get("experiment_type_hint")
    defaults = args.get("defaults", {})

    # Detect experiment type from text if not provided
    if not experiment_type_hint:
        if any(kw in text for kw in ["plasmid", "sequenc", "sanger", "verify"]):
            experiment_type_hint = "SANGER_PLASMID_VERIFICATION"
        elif any(kw in text for kw in ["qpcr", "expression", "gene", "rna"]):
            experiment_type_hint = "QPCR_EXPRESSION"
        elif any(kw in text for kw in ["viability", "cytotoxic", "cell", "ic50"]):
            experiment_type_hint = "CELL_VIABILITY_IC50"
        elif any(kw in text for kw in ["enzyme", "inhibit", "kinetic"]):
            experiment_type_hint = "ENZYME_INHIBITION_IC50"
        elif any(kw in text for kw in ["mic", "mbc", "antibiotic", "antimicrobial"]):
            experiment_type_hint = "MIC_MBC_ASSAY"
        elif any(kw in text for kw in ["zone", "disk", "diffusion"]):
            experiment_type_hint = "ZONE_OF_INHIBITION"
        elif any(kw in text for kw in ["growth", "matrix", "condition"]):
            experiment_type_hint = "MICROBIAL_GROWTH_MATRIX"
        else:
            experiment_type_hint = "CUSTOM"

    # Build draft intake
    draft = {
        "experiment_type": experiment_type_hint,
        "title": args["text"][:100] if len(args["text"]) > 100 else args["text"],
        "hypothesis": {
            "statement": args["text"][:500],
        },
        "compliance": defaults.get("compliance", {"bsl": "BSL1"}),
        "turnaround_budget": defaults.get("turnaround_budget", {
            "budget_max_usd": 500,
            "desired_turnaround_days": 14,
        }),
        "deliverables": defaults.get("deliverables", {
            "minimum_package_level": "L1_BASIC_QC",
            "raw_data_formats": ["CSV"],
        }),
    }

    # Merge any additional defaults
    for key, value in defaults.items():
        if key not in draft:
            draft[key] = value

    # Calculate completeness and identify missing fields
    completeness = compute_spec_completeness(draft)

    missing_fields = [
        {"path": "/hypothesis/null_hypothesis", "reason": "recommended"},
        {"path": "/acceptance_criteria/success_conditions", "reason": "recommended"},
        {"path": "/replicates", "reason": "recommended"},
    ]

    # Add experiment-type specific missing fields
    type_sections = {
        "SANGER_PLASMID_VERIFICATION": "sanger",
        "QPCR_EXPRESSION": "qpcr",
        "CELL_VIABILITY_IC50": "cell_viability",
        "ENZYME_INHIBITION_IC50": "enzyme_inhibition",
        "MICROBIAL_GROWTH_MATRIX": "microbial_growth",
        "MIC_MBC_ASSAY": "mic_mbc",
        "ZONE_OF_INHIBITION": "zone_of_inhibition",
        "CUSTOM": "custom_protocol",
    }

    section = type_sections.get(experiment_type_hint)
    if section and section not in draft:
        missing_fields.insert(0, {"path": f"/{section}", "reason": "required"})

    result = {
        "intake": draft,
        "confidence": min(0.3 + completeness * 0.5, 0.8),  # Lower confidence for text parsing
        "missing_fields": missing_fields,
        "suggested_next_questions": [
            "What specific hypothesis are you trying to test?",
            "What is your maximum budget for this experiment?",
            "What deliverables do you need (raw data, analysis, interpretation)?",
        ],
    }

    return [TextContent(type="text", text=json.dumps(result, indent=2))]


async def handle_validate(args: dict) -> list[TextContent]:
    """Validate an intake against the schema."""
    intake = args["intake"]
    strict = args.get("strict", False)

    valid, errors, warnings = validate_intake(intake)
    completeness = compute_spec_completeness(intake)

    # In strict mode, treat warnings as errors
    if strict and warnings:
        valid = False
        errors.extend(warnings)
        warnings = []

    result = {
        "valid": valid,
        "errors": errors,
        "warnings": warnings,
        "completeness": round(completeness, 3),
    }

    return [TextContent(type="text", text=json.dumps(result, indent=2))]


async def handle_suggest_questions(args: dict) -> list[TextContent]:
    """Suggest questions to improve intake completeness."""
    intake = args["intake"]
    target = args.get("target_completeness", 0.7)
    max_q = args.get("max_questions", 3)

    current_completeness = compute_spec_completeness(intake)
    questions = []

    exp_type = intake.get("experiment_type")

    # Check for missing required fields
    if not intake.get("hypothesis", {}).get("statement"):
        questions.append({
            "id": "hypothesis",
            "question": "What is your hypothesis? What do you expect to find?",
            "writes_to": ["/hypothesis/statement"],
            "answer_type": "text",
        })

    if not intake.get("hypothesis", {}).get("null_hypothesis"):
        questions.append({
            "id": "null_hypothesis",
            "question": "What would constitute a negative result (null hypothesis)?",
            "writes_to": ["/hypothesis/null_hypothesis"],
            "answer_type": "text",
        })

    if not intake.get("turnaround_budget", {}).get("budget_max_usd"):
        questions.append({
            "id": "budget",
            "question": "What is your maximum budget in USD?",
            "writes_to": ["/turnaround_budget/budget_max_usd"],
            "answer_type": "number",
        })

    if not intake.get("replicates"):
        questions.append({
            "id": "replicates",
            "question": "How many replicates do you need? (technical and biological)",
            "writes_to": ["/replicates/technical", "/replicates/biological"],
            "answer_type": "text",
        })

    if not intake.get("acceptance_criteria", {}).get("success_conditions"):
        questions.append({
            "id": "success_criteria",
            "question": "What would constitute a successful result? (e.g., IC50 < 10µM)",
            "writes_to": ["/acceptance_criteria/success_conditions"],
            "answer_type": "text",
        })

    # Add experiment-type specific questions
    type_sections = {
        "CELL_VIABILITY_IC50": ("cell_viability", [
            {"id": "cell_line", "question": "Which cell line should be used?",
             "writes_to": ["/cell_viability/cell_line"], "answer_type": "text"},
            {"id": "assay_type", "question": "Which viability assay? (CellTiter-Glo, MTT, Resazurin)",
             "writes_to": ["/cell_viability/assay_type"], "answer_type": "select",
             "options": ["CELLTITER_GLO", "MTT", "MTS", "RESAZURIN"]},
        ]),
        "MIC_MBC_ASSAY": ("mic_mbc", [
            {"id": "organism", "question": "Which organism/strain should be tested?",
             "writes_to": ["/mic_mbc/organism", "/mic_mbc/strain"], "answer_type": "text"},
            {"id": "compound", "question": "What compound are you testing?",
             "writes_to": ["/mic_mbc/compound_name"], "answer_type": "text"},
        ]),
        "QPCR_EXPRESSION": ("qpcr", [
            {"id": "targets", "question": "Which genes are you measuring?",
             "writes_to": ["/qpcr/targets"], "answer_type": "text"},
            {"id": "housekeeping", "question": "Which housekeeping gene(s) for normalization?",
             "writes_to": ["/qpcr/housekeeping_genes"], "answer_type": "text"},
        ]),
    }

    if exp_type in type_sections:
        section_key, section_questions = type_sections[exp_type]
        if not intake.get(section_key):
            questions.extend(section_questions)

    # Limit to max_questions
    questions = questions[:max_q]

    result = {"questions": questions}

    return [TextContent(type="text", text=json.dumps(result, indent=2))]


async def handle_match_labs(args: dict) -> list[TextContent]:
    """Route intake to best-fit labs."""
    intake = args["intake"]
    top_k = args.get("top_k", 3)
    strict = args.get("strict_deliverables", False)
    region = args.get("region_preference")

    labs = get_labs()

    result = route_intake(
        intake, labs,
        top_k=top_k,
        strict_deliverables=strict,
        region_preference=region,
    )

    # Convert to JSON-serializable format
    output = {
        "top_matches": [
            {
                "lab_id": m.lab_id,
                "lab_name": m.lab_name,
                "score": m.score,
                "score_breakdown": m.score_breakdown,
                "flags": m.flags,
                "deliverables_gaps": m.deliverables_gaps,
                "estimated_tat_days": m.estimated_tat_days,
                "pricing_band_usd": m.pricing_band_usd,
            }
            for m in result.top_matches
        ],
        "all_matches_count": result.all_matches_count,
        "filtered_out": result.filtered_out,
    }

    return [TextContent(type="text", text=json.dumps(output, indent=2))]


async def handle_labs_search(args: dict) -> list[TextContent]:
    """Search labs with filters."""
    labs = get_labs()
    filtered = []

    for lab in labs:
        # Apply filters
        if args.get("experiment_type"):
            if args["experiment_type"] not in lab.get("capabilities", {}).get("experiment_types", []):
                continue

        if args.get("max_bsl"):
            bsl_order = {"BSL1": 1, "BSL2": 2}
            lab_bsl = lab.get("compliance", {}).get("max_bsl", "BSL1")
            if bsl_order.get(lab_bsl, 1) < bsl_order.get(args["max_bsl"], 1):
                continue

        if args.get("shipping_mode"):
            accepted = lab.get("logistics", {}).get("shipping_modes_accepted", [])
            if args["shipping_mode"] not in accepted:
                continue

        if args.get("region"):
            if lab.get("region") != args["region"]:
                continue

        # Redact sensitive info
        lab_summary = {
            "lab_id": lab.get("lab_id"),
            "name": lab.get("name"),
            "type": lab.get("type"),
            "region": lab.get("region"),
            "capabilities": lab.get("capabilities"),
            "quality_metrics": lab.get("quality_metrics"),
            "commercial_terms": {
                "pricing_bands": lab.get("commercial_terms", {}).get("pricing_bands"),
                "turnaround_days": lab.get("commercial_terms", {}).get("turnaround_days"),
            },
        }
        filtered.append(lab_summary)

    page_size = args.get("page_size", 20)
    result = {
        "labs": filtered[:page_size],
        "next_page_token": None if len(filtered) <= page_size else "page_2",
    }

    return [TextContent(type="text", text=json.dumps(result, indent=2))]


async def handle_labs_get(args: dict) -> list[TextContent]:
    """Get a specific lab by ID."""
    lab_id = args["lab_id"]
    labs = get_labs()

    for lab in labs:
        if lab.get("lab_id") == lab_id:
            # Redact contact info
            redactions = ["contact.primary_email"]
            lab_copy = lab.copy()
            if "contact" in lab_copy:
                lab_copy["contact"] = {k: v for k, v in lab_copy["contact"].items() if k != "primary_email"}

            result = {
                "lab": lab_copy,
                "redactions": redactions,
            }
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

    return [TextContent(type="text", text=json.dumps({"error": f"Lab not found: {lab_id}"}))]


async def handle_submit(args: dict) -> list[TextContent]:
    """Submit an intake."""
    intake = args["intake"]
    selected_lab = args.get("selected_lab_id")
    notes = args.get("notes")

    # Validate first
    valid, errors, warnings = validate_intake(intake)
    if not valid:
        return [TextContent(type="text", text=json.dumps({
            "error": "Intake validation failed",
            "errors": errors,
        }))]

    # Generate submission ID
    submission_id = f"sub_{uuid.uuid4().hex[:12]}"

    # Store submission
    _submissions[submission_id] = {
        "intake": intake,
        "selected_lab_id": selected_lab,
        "notes": notes,
        "status": "RECEIVED",
        "attachments": [],
    }

    # Determine next steps
    next_steps = ["Awaiting safety review"]
    if not selected_lab:
        next_steps.insert(0, "Select a lab from the matched options")

    status = "RECEIVED" if selected_lab else "NEEDS_INFO"

    result = {
        "submission_id": submission_id,
        "status": status,
        "next_steps": next_steps,
    }

    return [TextContent(type="text", text=json.dumps(result, indent=2))]


async def handle_create_upload_url(args: dict) -> list[TextContent]:
    """Create a signed upload URL (mock implementation)."""
    filename = args["filename"]
    mime_type = args["mime_type"]
    size_bytes = args["size_bytes"]

    # In production, this would create a real signed URL for S3/GCS
    file_id = f"file_{uuid.uuid4().hex[:12]}"

    _files[file_id] = {
        "filename": filename,
        "mime_type": mime_type,
        "size_bytes": size_bytes,
        "uploaded": False,
    }

    result = {
        "file_id": file_id,
        "upload_url": f"https://storage.litmus.science/upload/{file_id}?token=mock_token",
        "expires_in_seconds": 3600,
    }

    return [TextContent(type="text", text=json.dumps(result, indent=2))]


async def handle_attach_to_intake(args: dict) -> list[TextContent]:
    """Attach a file to an intake submission."""
    submission_id = args["submission_id"]
    file_id = args["file_id"]
    attachment_type = args["attachment_type"]
    notes = args.get("notes")

    if submission_id not in _submissions:
        return [TextContent(type="text", text=json.dumps({
            "ok": False,
            "error": f"Submission not found: {submission_id}",
        }))]

    if file_id not in _files:
        return [TextContent(type="text", text=json.dumps({
            "ok": False,
            "error": f"File not found: {file_id}",
        }))]

    _submissions[submission_id]["attachments"].append({
        "file_id": file_id,
        "attachment_type": attachment_type,
        "notes": notes,
    })

    return [TextContent(type="text", text=json.dumps({"ok": True}))]


# ============================================================================
# Main
# ============================================================================

async def main():
    """Run the MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
