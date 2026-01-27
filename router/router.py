"""
Litmus Lab Router

Routes experiment intakes to the best-fit labs using:
1. Hard filters (compliance, shipping, experiment type)
2. Weighted scoring (menu fit, turnaround, cost, quality, deliverables)

Usage:
    from router import route_intake
    
    matches = route_intake(intake, labs, weights=DEFAULT_WEIGHTS)
    for match in matches[:3]:
        print(f"{match['lab_name']}: {match['score']:.2f}")
"""

from dataclasses import dataclass, field
from typing import Any, Optional
from enum import Enum


class FilterReason(Enum):
    EXPERIMENT_TYPE_NOT_SUPPORTED = "experiment_type_not_supported"
    BSL_EXCEEDED = "bsl_level_exceeded"
    HUMAN_SAMPLES_NOT_APPROVED = "human_samples_not_approved"
    ANIMAL_SAMPLES_NOT_APPROVED = "animal_samples_not_approved"
    HAZMAT_NOT_APPROVED = "hazmat_not_approved"
    SHIPPING_MODE_NOT_SUPPORTED = "shipping_mode_not_supported"
    REGION_MISMATCH = "region_mismatch"
    LAB_UNAVAILABLE = "lab_unavailable"
    DELIVERABLES_NOT_SUPPORTED = "deliverables_not_supported"


@dataclass
class RoutingWeights:
    """Weights for scoring factors (should sum to ~1.0 for interpretability)"""
    menu_fit: float = 0.20
    turnaround_fit: float = 0.15
    spec_completeness: float = 0.10
    cost_fit: float = 0.15
    quality: float = 0.20
    logistics: float = 0.05
    deliverables_match: float = 0.15


DEFAULT_WEIGHTS = RoutingWeights()


@dataclass
class LabMatch:
    lab_id: str
    lab_name: str
    score: float
    score_breakdown: dict[str, float]
    flags: list[str]
    deliverables_gaps: list[str]
    estimated_tat_days: Optional[int] = None
    pricing_band_usd: Optional[dict[str, int]] = None


@dataclass
class RoutingResult:
    top_matches: list[LabMatch]
    all_matches_count: int
    filtered_out: dict[str, list[str]]  # lab_id -> list of filter reasons


def apply_hard_filters(
    intake: dict[str, Any],
    lab: dict[str, Any],
    strict_deliverables: bool = False,
    region_preference: Optional[str] = None,
    required_shipping_mode: Optional[str] = None,
) -> list[FilterReason]:  # noqa: E501
    """
    Apply hard filters that eliminate labs entirely.
    Returns list of reasons why lab was filtered out (empty if lab passes).
    """
    reasons = []
    
    exp_type = intake.get("experiment_type")
    lab_caps = lab.get("capabilities", {})
    lab_compliance = lab.get("compliance", {})
    lab_logistics = lab.get("logistics", {})
    lab_deliverables = lab.get("deliverables_support", {})
    intake_compliance = intake.get("compliance", {})
    
    # 1. Experiment type support
    supported_types = lab_caps.get("experiment_types", [])
    if exp_type and exp_type not in supported_types:
        reasons.append(FilterReason.EXPERIMENT_TYPE_NOT_SUPPORTED)
    
    # 2. BSL level
    bsl_order = {"BSL1": 1, "BSL2": 2}
    intake_bsl = intake_compliance.get("bsl", "BSL1")
    lab_max_bsl = lab_compliance.get("max_bsl", "BSL1")
    if bsl_order.get(intake_bsl, 1) > bsl_order.get(lab_max_bsl, 1):
        reasons.append(FilterReason.BSL_EXCEEDED)
    
    # 3. Human/animal samples
    if intake_compliance.get("human_derived_material") and not lab_compliance.get("human_samples_approved"):
        reasons.append(FilterReason.HUMAN_SAMPLES_NOT_APPROVED)
    
    if intake_compliance.get("animal_derived_material") and not lab_compliance.get("animal_samples_approved"):
        reasons.append(FilterReason.ANIMAL_SAMPLES_NOT_APPROVED)
    
    # 4. Hazardous materials
    if intake_compliance.get("hazardous_chemicals") and not lab_compliance.get("hazardous_chemicals_approved", True):
        reasons.append(FilterReason.HAZMAT_NOT_APPROVED)
    
    # 5. Shipping mode
    if required_shipping_mode:
        accepted_modes = lab_logistics.get("shipping_modes_accepted", ["AMBIENT"])
        if required_shipping_mode not in accepted_modes:
            reasons.append(FilterReason.SHIPPING_MODE_NOT_SUPPORTED)
    
    # 6. Region preference (soft filter made hard if specified)
    if region_preference and lab.get("region") != region_preference:
        # This could be a soft filter instead, but including as option
        pass  # Don't filter, just deprioritize in scoring
    
    # 7. Lab availability
    availability = lab.get("availability", {})
    if availability.get("current_capacity") == "none":
        reasons.append(FilterReason.LAB_UNAVAILABLE)
    if lab.get("status") != "active":
        reasons.append(FilterReason.LAB_UNAVAILABLE)
    
    # 8. Strict deliverables check
    if strict_deliverables:
        gaps = check_deliverables_gaps(intake, lab)
        if gaps:
            reasons.append(FilterReason.DELIVERABLES_NOT_SUPPORTED)
    
    return reasons


def check_deliverables_gaps(intake: dict[str, Any], lab: dict[str, Any]) -> list[str]:
    """
    Check if lab can provide all required deliverables.
    Returns list of gaps (empty if lab can fulfill all requirements).
    """
    gaps = []
    
    intake_deliverables = intake.get("deliverables", {})
    lab_deliverables = lab.get("deliverables_support", {})
    exp_type = intake.get("experiment_type")
    
    # Get lab's capabilities (merge global + experiment-specific)
    lab_global = lab_deliverables.get("global", {})
    lab_specific = lab_deliverables.get("by_experiment_type", {}).get(exp_type, {})
    
    lab_raw_formats = set(lab_global.get("raw_formats", [])) | set(lab_specific.get("raw_formats", []))
    lab_processed = set(lab_global.get("processed_outputs", [])) | set(lab_specific.get("processed_outputs", []))
    
    # Determine lab's max package level
    level_order = {"L0_RAW_ONLY": 0, "L1_BASIC_QC": 1, "L2_INTERPRETATION": 2}
    lab_max_level = lab_specific.get("max_package_level") or lab_global.get("max_package_level", "L0_RAW_ONLY")
    lab_max_level_num = level_order.get(lab_max_level, 0)
    
    # Check required raw formats
    required_raw = intake_deliverables.get("raw_data_formats", [])
    for fmt in required_raw:
        if fmt not in lab_raw_formats:
            gaps.append(f"raw_format:{fmt}")
    
    # Check required processed outputs
    required_processed = intake_deliverables.get("required_processed_outputs", [])
    for output in required_processed:
        if output not in lab_processed:
            gaps.append(f"processed_output:{output}")
    
    # Check minimum package level
    required_level = intake_deliverables.get("minimum_package_level", "L0_RAW_ONLY")
    required_level_num = level_order.get(required_level, 0)
    if lab_max_level_num < required_level_num:
        gaps.append(f"package_level:{required_level}")
    
    return gaps


def compute_spec_completeness(intake: dict[str, Any]) -> float:
    """
    Heuristic for how complete the intake specification is.
    Returns 0.0 to 1.0.
    """
    score = 0.0
    max_score = 0.0
    
    # Core fields
    core_fields = [
        ("title", 1.0),
        ("hypothesis.statement", 2.0),
        ("hypothesis.null_hypothesis", 1.0),
        ("compliance.bsl", 1.0),
        ("turnaround_budget.budget_max_usd", 1.5),
        ("deliverables.minimum_package_level", 1.0),
        ("replicates", 0.5),
    ]
    
    for path, weight in core_fields:
        max_score += weight
        if get_nested(intake, path) is not None:
            score += weight
    
    # Experiment-type specific fields
    exp_type = intake.get("experiment_type")
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
    
    section_key = type_sections.get(exp_type)
    if section_key:
        max_score += 3.0
        section = intake.get(section_key, {})
        if section:
            # Award partial credit based on how many fields are filled
            filled = sum(1 for v in section.values() if v is not None and v != "" and v != [])
            total = len(section) if section else 1
            score += 3.0 * (filled / total)
    
    # Acceptance criteria bonus
    max_score += 1.0
    if intake.get("acceptance_criteria", {}).get("success_conditions"):
        score += 1.0
    
    return score / max_score if max_score > 0 else 0.0


def get_nested(d: dict, path: str) -> Any:
    """Get nested dictionary value by dot-separated path."""
    keys = path.split(".")
    val = d
    for key in keys:
        if isinstance(val, dict):
            val = val.get(key)
        else:
            return None
    return val


def score_lab(
    intake: dict[str, Any],
    lab: dict[str, Any],
    weights: RoutingWeights,
    spec_completeness: float,
) -> tuple[float, dict[str, float], list[str]]:
    """
    Compute weighted score for a lab that passed hard filters.
    Returns (total_score, score_breakdown, flags).
    """
    breakdown = {}
    flags = []
    exp_type = intake.get("experiment_type")
    
    # 1. Menu fit (does lab have specific capabilities for this experiment type?)
    menu_score = 0.0
    lab_menu_tags = set(lab.get("capabilities", {}).get("menu_tags", []))
    
    # Define expected tags per experiment type
    exp_type_tags = {
        "CELL_VIABILITY_IC50": ["viability_celltiter_glo", "viability_mtt", "viability_resazurin"],
        "ENZYME_INHIBITION_IC50": ["enzyme_colorimetric", "enzyme_fluorometric", "enzyme_kinetics"],
        "QPCR_EXPRESSION": ["qpcr_sybr", "qpcr_taqman"],
        "MIC_MBC_ASSAY": ["mic_broth_microdilution", "mic_agar_dilution"],
        "SANGER_PLASMID_VERIFICATION": ["sanger_standard", "sanger_difficult_templates"],
    }
    
    relevant_tags = exp_type_tags.get(exp_type, [])
    if relevant_tags:
        matches = len(lab_menu_tags & set(relevant_tags))
        menu_score = matches / len(relevant_tags)
    else:
        menu_score = 1.0 if exp_type in lab.get("capabilities", {}).get("experiment_types", []) else 0.0
    
    breakdown["menu_fit"] = menu_score * weights.menu_fit
    
    # 2. Turnaround fit
    tat_score = 0.5  # Default to medium
    desired_tat = intake.get("turnaround_budget", {}).get("desired_turnaround_days")
    lab_tat = lab.get("commercial_terms", {}).get("turnaround_days", {}).get(exp_type, {})
    
    if desired_tat and lab_tat:
        lab_standard_tat = lab_tat.get("standard", 14)
        if lab_standard_tat <= desired_tat:
            tat_score = 1.0
        elif lab_standard_tat <= desired_tat * 1.5:
            tat_score = 0.5
        else:
            tat_score = 0.2
            flags.append("turnaround_may_exceed_desired")
    
    breakdown["turnaround_fit"] = tat_score * weights.turnaround_fit
    
    # 3. Spec completeness (passed in)
    breakdown["spec_completeness"] = spec_completeness * weights.spec_completeness
    
    # 4. Cost fit
    cost_score = 0.5
    budget_max = intake.get("turnaround_budget", {}).get("budget_max_usd")
    pricing = lab.get("commercial_terms", {}).get("pricing_bands", {}).get(exp_type, {})
    
    if budget_max and pricing:
        typical = pricing.get("typical_usd", pricing.get("min_usd", 0))
        if typical <= budget_max * 0.8:
            cost_score = 1.0
        elif typical <= budget_max:
            cost_score = 0.7
        elif typical <= budget_max * 1.25:
            cost_score = 0.3
            flags.append("may_exceed_budget")
        else:
            cost_score = 0.1
            flags.append("likely_exceeds_budget")
    
    breakdown["cost_fit"] = cost_score * weights.cost_fit
    
    # 5. Quality metrics
    quality = lab.get("quality_metrics", {})
    quality_score = 0.5
    
    if quality:
        components = []
        if quality.get("on_time_rate") is not None:
            components.append(quality["on_time_rate"])
        if quality.get("average_rating") is not None:
            components.append((quality["average_rating"] - 1) / 4)  # Normalize 1-5 to 0-1
        if quality.get("rerun_rate") is not None:
            components.append(1 - quality["rerun_rate"])  # Lower is better
        if quality.get("data_package_score") is not None:
            components.append(quality["data_package_score"])
        
        if components:
            quality_score = sum(components) / len(components)
        
        # Flag quality concerns
        if quality.get("rerun_rate", 0) > 0.15:
            flags.append("elevated_rerun_rate")
        if quality.get("average_rating", 5) < 4.0:
            flags.append("below_average_rating")
    
    breakdown["quality"] = quality_score * weights.quality
    
    # 6. Logistics
    logistics_score = 0.7  # Default reasonable
    logistics = lab.get("logistics", {})
    availability = lab.get("availability", {})
    
    if availability.get("current_capacity") == "high":
        logistics_score = 1.0
    elif availability.get("current_capacity") == "low":
        logistics_score = 0.4
        flags.append("limited_capacity")
    
    if logistics.get("weekend_receiving"):
        logistics_score = min(1.0, logistics_score + 0.1)
    
    breakdown["logistics"] = logistics_score * weights.logistics
    
    # 7. Deliverables match
    gaps = check_deliverables_gaps(intake, lab)
    if not gaps:
        deliv_score = 1.0
    else:
        # Partial credit based on number of gaps
        deliv_score = max(0.0, 1.0 - (len(gaps) * 0.25))
        flags.append("partial_deliverables_match")
    
    breakdown["deliverables_match"] = deliv_score * weights.deliverables_match
    
    # Total score
    total = sum(breakdown.values())
    
    return total, breakdown, flags


class RoutingError(Exception):
    """Raised when routing fails due to invalid input."""
    pass


def route_intake(
    intake: dict[str, Any],
    labs: list[dict[str, Any]],
    weights: RoutingWeights = DEFAULT_WEIGHTS,
    top_k: int = 3,
    strict_deliverables: bool = False,
    region_preference: Optional[str] = None,
    required_shipping_mode: Optional[str] = None,
) -> RoutingResult:
    """
    Route an intake to the best-fit labs.

    Args:
        intake: Validated experiment intake
        labs: List of lab profiles
        weights: Scoring weights
        top_k: Number of top matches to return
        strict_deliverables: If True, filter out labs that can't meet all deliverables
        region_preference: Preferred region (soft filter unless no matches)
        required_shipping_mode: Required shipping mode (hard filter)

    Returns:
        RoutingResult with top matches and filtering info

    Raises:
        RoutingError: If intake or labs are invalid
    """
    # Input validation
    if not isinstance(intake, dict):
        raise RoutingError("intake must be a dictionary")
    if not isinstance(labs, list):
        raise RoutingError("labs must be a list")
    if not labs:
        raise RoutingError("labs list cannot be empty")

    # Check for required intake fields
    if not intake.get("experiment_type"):
        raise RoutingError("intake must have experiment_type")

    # Check for duplicate lab_ids
    lab_ids = [lab.get("lab_id") for lab in labs if lab.get("lab_id")]
    if len(lab_ids) != len(set(lab_ids)):
        raise RoutingError("labs contain duplicate lab_id values")

    # Validate top_k
    if top_k < 1:
        raise RoutingError("top_k must be at least 1")

    spec_completeness = compute_spec_completeness(intake)
    exp_type = intake.get("experiment_type")
    
    matches: list[LabMatch] = []
    filtered_out: dict[str, list[str]] = {}
    
    for lab in labs:
        lab_id = lab.get("lab_id", "unknown")
        lab_name = lab.get("name", "Unknown Lab")
        
        # Apply hard filters
        filter_reasons = apply_hard_filters(
            intake, lab,
            strict_deliverables=strict_deliverables,
            region_preference=None,  # Region is soft filter
            required_shipping_mode=required_shipping_mode,
        )
        
        if filter_reasons:
            filtered_out[lab_id] = [r.value for r in filter_reasons]
            continue
        
        # Score the lab
        total_score, breakdown, flags = score_lab(intake, lab, weights, spec_completeness)
        
        # Apply region preference as score modifier
        if region_preference and lab.get("region") == region_preference:
            total_score *= 1.1  # 10% bonus for preferred region
            breakdown["region_bonus"] = total_score * 0.1
        
        # Get estimated TAT and pricing
        commercial = lab.get("commercial_terms", {})
        tat_info = commercial.get("turnaround_days", {}).get(exp_type, {})
        pricing_info = commercial.get("pricing_bands", {}).get(exp_type, {})
        
        # Check deliverables gaps (for info, even if not strict)
        deliverables_gaps = check_deliverables_gaps(intake, lab)
        
        match = LabMatch(
            lab_id=lab_id,
            lab_name=lab_name,
            score=round(total_score, 3),
            score_breakdown={k: round(v, 3) for k, v in breakdown.items()},
            flags=flags,
            deliverables_gaps=deliverables_gaps,
            estimated_tat_days=tat_info.get("standard"),
            pricing_band_usd={
                "min": pricing_info.get("min_usd"),
                "max": pricing_info.get("max_usd"),
            } if pricing_info else None,
        )
        matches.append(match)
    
    # Sort by score descending
    matches.sort(key=lambda m: m.score, reverse=True)
    
    return RoutingResult(
        top_matches=matches[:top_k],
        all_matches_count=len(matches),
        filtered_out=filtered_out,
    )


def validate_intake(intake: dict[str, Any]) -> tuple[bool, list[dict], list[dict]]:
    """
    Validate an intake against basic requirements.
    Returns (valid, errors, warnings).
    
    Note: For full JSON Schema validation, use jsonschema library with the schema file.
    """
    errors = []
    warnings = []
    
    # Required top-level fields
    required = ["experiment_type", "title", "hypothesis", "compliance", "deliverables", "turnaround_budget"]
    for field in required:
        if field not in intake:
            errors.append({"path": f"/{field}", "message": f"Required field '{field}' is missing"})
    
    # Experiment type validation
    exp_type = intake.get("experiment_type")
    valid_types = [
        "SANGER_PLASMID_VERIFICATION", "QPCR_EXPRESSION", "CELL_VIABILITY_IC50",
        "ENZYME_INHIBITION_IC50", "MICROBIAL_GROWTH_MATRIX", "MIC_MBC_ASSAY",
        "ZONE_OF_INHIBITION", "CUSTOM"
    ]
    if exp_type and exp_type not in valid_types:
        errors.append({"path": "/experiment_type", "message": f"Invalid experiment type: {exp_type}"})
    
    # Check experiment-type specific section exists
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
    
    if exp_type in type_sections:
        section_key = type_sections[exp_type]
        if section_key not in intake:
            errors.append({
                "path": f"/{section_key}",
                "message": f"Section '{section_key}' is required for experiment type {exp_type}"
            })
    
    # Hypothesis validation
    hypothesis = intake.get("hypothesis", {})
    if not hypothesis.get("statement"):
        errors.append({"path": "/hypothesis/statement", "message": "Hypothesis statement is required"})
    if not hypothesis.get("null_hypothesis"):
        warnings.append({"path": "/hypothesis/null_hypothesis", "message": "Null hypothesis is recommended"})
    
    # Budget validation
    budget = intake.get("turnaround_budget", {})
    if not budget.get("budget_max_usd"):
        errors.append({"path": "/turnaround_budget/budget_max_usd", "message": "Maximum budget is required"})
    
    # Completeness warning
    completeness = compute_spec_completeness(intake)
    if completeness < 0.5:
        warnings.append({
            "path": "/",
            "message": f"Intake completeness is low ({completeness:.0%}). Consider adding more details."
        })
    
    valid = len(errors) == 0
    return valid, errors, warnings


# Example usage / tests
if __name__ == "__main__":
    # Example intake
    example_intake = {
        "experiment_type": "CELL_VIABILITY_IC50",
        "title": "Compound X viability screen in HeLa",
        "hypothesis": {
            "statement": "Compound X reduces HeLa cell viability with IC50 < 10μM",
            "null_hypothesis": "Compound X has no effect on HeLa viability (IC50 > 100μM)"
        },
        "compliance": {
            "bsl": "BSL1",
            "hazardous_chemicals": True
        },
        "turnaround_budget": {
            "desired_turnaround_days": 14,
            "budget_max_usd": 500
        },
        "deliverables": {
            "raw_data_formats": ["CSV"],
            "required_processed_outputs": ["IC50_CURVE_FIT", "NORMALIZED_VIABILITY_PERCENT"],
            "minimum_package_level": "L2_INTERPRETATION"
        },
        "cell_viability": {
            "cell_line": "HeLa",
            "assay_type": "CELLTITER_GLO",
            "dose_range": {
                "min": 0.01,
                "max": 100,
                "unit": "μM",
                "points": 10,
                "dilution_series": "half-log"
            },
            "exposure_time_hours": 48
        }
    }
    
    # Example labs
    example_labs = [
        {
            "lab_id": "lab_001",
            "name": "CellAssay Pro",
            "status": "active",
            "region": "US",
            "capabilities": {
                "experiment_types": ["CELL_VIABILITY_IC50", "ENZYME_INHIBITION_IC50"],
                "menu_tags": ["viability_celltiter_glo", "viability_mtt", "viability_384_well"]
            },
            "compliance": {
                "max_bsl": "BSL2",
                "hazardous_chemicals_approved": True
            },
            "commercial_terms": {
                "pricing_bands": {
                    "CELL_VIABILITY_IC50": {"min_usd": 300, "max_usd": 600, "typical_usd": 400}
                },
                "turnaround_days": {
                    "CELL_VIABILITY_IC50": {"standard": 10, "expedited": 5}
                }
            },
            "quality_metrics": {
                "on_time_rate": 0.95,
                "average_rating": 4.8,
                "rerun_rate": 0.02,
                "data_package_score": 0.9
            },
            "availability": {"current_capacity": "high"},
            "deliverables_support": {
                "global": {
                    "raw_formats": ["CSV", "XLSX", "IMAGE_FILES"],
                    "processed_outputs": ["QC_SUMMARY"],
                    "max_package_level": "L2_INTERPRETATION"
                },
                "by_experiment_type": {
                    "CELL_VIABILITY_IC50": {
                        "processed_outputs": ["IC50_CURVE_FIT", "NORMALIZED_VIABILITY_PERCENT", "QC_SUMMARY"]
                    }
                }
            }
        },
        {
            "lab_id": "lab_002",
            "name": "BioCore Facility",
            "status": "active",
            "region": "US",
            "capabilities": {
                "experiment_types": ["CELL_VIABILITY_IC50", "QPCR_EXPRESSION"],
                "menu_tags": ["viability_mtt", "qpcr_sybr"]
            },
            "compliance": {
                "max_bsl": "BSL1",
                "hazardous_chemicals_approved": True
            },
            "commercial_terms": {
                "pricing_bands": {
                    "CELL_VIABILITY_IC50": {"min_usd": 200, "max_usd": 400, "typical_usd": 280}
                },
                "turnaround_days": {
                    "CELL_VIABILITY_IC50": {"standard": 14, "expedited": 7}
                }
            },
            "quality_metrics": {
                "on_time_rate": 0.88,
                "average_rating": 4.2,
                "rerun_rate": 0.08
            },
            "availability": {"current_capacity": "medium"},
            "deliverables_support": {
                "global": {
                    "raw_formats": ["CSV", "XLSX"],
                    "max_package_level": "L1_BASIC_QC"
                }
            }
        }
    ]
    
    # Validate
    valid, errors, warnings = validate_intake(example_intake)
    print(f"Valid: {valid}")
    print(f"Errors: {errors}")
    print(f"Warnings: {warnings}")
    print()
    
    # Route
    result = route_intake(example_intake, example_labs, strict_deliverables=True)
    print(f"Matches: {result.all_matches_count}")
    print(f"Filtered out: {result.filtered_out}")
    print()
    
    for match in result.top_matches:
        print(f"{match.lab_name} (score: {match.score})")
        print(f"  Breakdown: {match.score_breakdown}")
        print(f"  Flags: {match.flags}")
        print(f"  Deliverables gaps: {match.deliverables_gaps}")
        print()
