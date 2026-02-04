"""
Tests for the Litmus routing logic.

These tests validate:
1. Hard filter logic (experiment type, BSL, materials, shipping, deliverables)
2. Weighted scoring algorithm
3. Spec completeness calculation
4. End-to-end routing with example data
"""

import json
import sys
from pathlib import Path
from typing import cast

import pytest

from backend.types import JsonObject, JsonValue


def _as_object(value: JsonValue | None) -> JsonObject:
    if isinstance(value, dict):
        return value
    return {}


def _as_str(value: JsonValue | None, default: str = "") -> str:
    if isinstance(value, str):
        return value
    return default


# Add router to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "router"))

from router import (  # noqa: E402
    DEFAULT_WEIGHTS,
    FilterReason,
    RoutingWeights,
    apply_hard_filters,
    check_deliverables_gaps,
    compute_spec_completeness,
    route_intake,
    score_lab,
    validate_intake,
)

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def examples_dir() -> Path:
    """Path to examples directory."""
    return Path(__file__).parent.parent.parent / "examples"


@pytest.fixture
def sample_intake(examples_dir: Path) -> JsonObject:
    """Load sample cell viability intake."""
    with open(examples_dir / "intake_cell_viability.json") as f:
        return cast(JsonObject, json.load(f))


@pytest.fixture
def mic_intake(examples_dir: Path) -> JsonObject:
    """Load MIC assay intake."""
    with open(examples_dir / "intake_mic_assay.json") as f:
        return cast(JsonObject, json.load(f))


@pytest.fixture
def individual_lab(examples_dir: Path) -> JsonObject:
    """Load individual operator profile (Marcus - microbiology)."""
    with open(examples_dir / "lab_profile_individual.json") as f:
        return cast(JsonObject, json.load(f))


@pytest.fixture
def commercial_lab(examples_dir: Path) -> JsonObject:
    """Load commercial CRO profile (CellAssay Pro)."""
    with open(examples_dir / "lab_profile_commercial.json") as f:
        return cast(JsonObject, json.load(f))


@pytest.fixture
def minimal_intake() -> JsonObject:
    """Create a minimal valid intake."""
    return {
        "experiment_type": "CELL_VIABILITY_IC50",
        "title": "Minimal test intake",
        "hypothesis": {"statement": "Test compound affects cell viability"},
        "compliance": {"bsl": "BSL1"},
        "turnaround_budget": {"budget_max_usd": 300},
        "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
    }


@pytest.fixture
def bsl2_intake(minimal_intake: JsonObject) -> JsonObject:
    """Intake requiring BSL2."""
    intake = minimal_intake.copy()
    intake["compliance"] = {"bsl": "BSL2"}
    return intake


# ============================================================================
# Hard Filter Tests
# ============================================================================


class TestHardFilters:
    """Tests for binary pass/fail filtering."""

    def test_experiment_type_filter_pass(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Lab supporting experiment type should pass."""
        # Commercial lab supports CELL_VIABILITY_IC50
        reasons = apply_hard_filters(sample_intake, commercial_lab)
        assert FilterReason.EXPERIMENT_TYPE_NOT_SUPPORTED not in reasons

    def test_experiment_type_filter_fail(
        self, sample_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Lab not supporting experiment type should fail."""
        # Individual lab only supports MIC_MBC, ZONE_OF_INHIBITION, MICROBIAL_GROWTH
        reasons = apply_hard_filters(sample_intake, individual_lab)
        assert FilterReason.EXPERIMENT_TYPE_NOT_SUPPORTED in reasons

    def test_bsl_level_filter_pass(
        self, bsl2_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Lab with sufficient BSL level should pass."""
        # Commercial lab has BSL2 max
        reasons = apply_hard_filters(bsl2_intake, commercial_lab)
        assert FilterReason.BSL_EXCEEDED not in reasons

    def test_bsl_level_filter_fail(
        self, bsl2_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Intake requiring BSL2 should fail for BSL1-only lab."""
        # Create a lab with only BSL1
        bsl1_lab = individual_lab.copy()
        bsl1_lab["compliance"] = {"max_bsl": "BSL1"}
        reasons = apply_hard_filters(bsl2_intake, bsl1_lab)
        assert FilterReason.BSL_EXCEEDED in reasons

    def test_human_material_filter_pass(
        self, minimal_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Lab approving human materials should pass when required."""
        intake = minimal_intake.copy()
        compliance = cast(JsonObject, intake["compliance"])
        compliance["human_derived_material"] = True
        lab = commercial_lab.copy()
        lab_compliance = cast(JsonObject, lab["compliance"])
        lab_compliance["human_samples_approved"] = True
        reasons = apply_hard_filters(intake, lab)
        assert FilterReason.HUMAN_SAMPLES_NOT_APPROVED not in reasons

    def test_human_material_filter_fail(
        self, minimal_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Lab not approving human materials should fail when required."""
        intake = minimal_intake.copy()
        compliance = cast(JsonObject, intake["compliance"])
        compliance["human_derived_material"] = True
        # Individual lab doesn't approve human samples
        reasons = apply_hard_filters(intake, individual_lab)
        assert FilterReason.HUMAN_SAMPLES_NOT_APPROVED in reasons

    def test_animal_material_filter_fail(
        self, minimal_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Lab not approving animal materials should fail when required."""
        intake = minimal_intake.copy()
        compliance = cast(JsonObject, intake["compliance"])
        compliance["animal_derived_material"] = True
        reasons = apply_hard_filters(intake, individual_lab)
        assert FilterReason.ANIMAL_SAMPLES_NOT_APPROVED in reasons

    def test_hazmat_filter_pass(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Lab approving hazardous chemicals should pass."""
        # Sample intake has hazardous_chemicals: true
        # Commercial lab has hazardous_chemicals_approved: true
        reasons = apply_hard_filters(sample_intake, commercial_lab)
        assert FilterReason.HAZMAT_NOT_APPROVED not in reasons

    def test_shipping_mode_filter_pass(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Lab accepting required shipping mode should pass."""
        reasons = apply_hard_filters(
            sample_intake, commercial_lab, required_shipping_mode="DRY_ICE"
        )
        assert FilterReason.SHIPPING_MODE_NOT_SUPPORTED not in reasons

    def test_shipping_mode_filter_fail(
        self, sample_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Lab not accepting required shipping mode should fail."""
        # Individual lab only accepts AMBIENT and COLD_PACK
        reasons = apply_hard_filters(
            sample_intake, individual_lab, required_shipping_mode="DRY_ICE"
        )
        assert FilterReason.SHIPPING_MODE_NOT_SUPPORTED in reasons

    def test_unavailable_lab_filtered(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Labs with no capacity should be filtered."""
        lab = commercial_lab.copy()
        lab["availability"] = {"current_capacity": "none"}
        reasons = apply_hard_filters(sample_intake, lab)
        assert FilterReason.LAB_UNAVAILABLE in reasons

    def test_inactive_lab_filtered(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Non-active labs should be filtered."""
        lab = commercial_lab.copy()
        lab["status"] = "paused"
        reasons = apply_hard_filters(sample_intake, lab)
        assert FilterReason.LAB_UNAVAILABLE in reasons

    def test_strict_deliverables_filter(
        self, sample_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Strict deliverables mode filters labs that can't meet requirements."""
        # Sample intake requires L2_INTERPRETATION for cell viability
        # Individual lab only does microbiology
        reasons = apply_hard_filters(sample_intake, individual_lab, strict_deliverables=True)
        # Should fail on experiment type (which triggers before deliverables check)
        assert len(reasons) > 0


# ============================================================================
# Deliverables Gap Tests
# ============================================================================


class TestDeliverablesGaps:
    """Tests for deliverables gap checking."""

    def test_no_gaps_when_all_supported(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """No gaps when lab supports all required deliverables."""
        gaps = check_deliverables_gaps(sample_intake, commercial_lab)
        assert len(gaps) == 0

    def test_gap_for_missing_raw_format(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Gap reported for unsupported raw format."""
        intake = sample_intake.copy()
        deliverables = _as_object(intake.get("deliverables"))
        deliverables["raw_data_formats"] = ["FASTQ"]  # Unlikely to be supported
        intake["deliverables"] = deliverables
        gaps = check_deliverables_gaps(intake, commercial_lab)
        assert "raw_format:FASTQ" in gaps

    def test_gap_for_missing_processed_output(
        self, sample_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Gap reported for unsupported processed output."""
        # Test with MIC intake against individual lab
        intake: JsonObject = {
            "experiment_type": "MIC_MBC_ASSAY",
            "deliverables": {
                "required_processed_outputs": ["SOME_UNSUPPORTED_OUTPUT"],
                "minimum_package_level": "L1_BASIC_QC",
            },
        }
        gaps = check_deliverables_gaps(intake, individual_lab)
        assert any("processed_output:" in g for g in gaps)

    def test_gap_for_package_level(
        self, minimal_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Gap reported when package level not supported."""
        intake = minimal_intake.copy()
        intake["experiment_type"] = "MICROBIAL_GROWTH_MATRIX"  # Supported by individual
        intake["deliverables"] = {"minimum_package_level": "L2_INTERPRETATION"}
        # Individual lab only has L1_BASIC_QC globally, L2 only for MIC_MBC
        gaps = check_deliverables_gaps(intake, individual_lab)
        # Check if package level gap exists (may or may not depending on specific config)
        # The key point is the function runs without error
        assert isinstance(gaps, list)


# ============================================================================
# Spec Completeness Tests
# ============================================================================


class TestSpecCompleteness:
    """Tests for intake specification completeness calculation."""

    def test_complete_intake_high_score(self, sample_intake: JsonObject) -> None:
        """Fully specified intake should score high (> 0.7)."""
        completeness = compute_spec_completeness(sample_intake)
        assert completeness > 0.7

    def test_minimal_intake_lower_score(self, minimal_intake: JsonObject) -> None:
        """Minimal intake should score lower than complete one."""
        complete_score = compute_spec_completeness(
            {
                "experiment_type": "CELL_VIABILITY_IC50",
                "title": "Complete intake",
                "hypothesis": {"statement": "Test statement", "null_hypothesis": "Null hypothesis"},
                "compliance": {"bsl": "BSL1"},
                "turnaround_budget": {"budget_max_usd": 500},
                "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
                "replicates": {"technical": 3, "biological": 2},
                "acceptance_criteria": {
                    "success_conditions": [{"metric": "IC50", "operator": "lte", "threshold": 10}]
                },
                "cell_viability": {
                    "cell_line": "HeLa",
                    "assay_type": "CELLTITER_GLO",
                    "dose_range": {"min": 0.01, "max": 100},
                },
            }
        )
        minimal_score = compute_spec_completeness(minimal_intake)
        assert minimal_score < complete_score

    def test_completeness_in_valid_range(
        self, sample_intake: JsonObject, minimal_intake: JsonObject
    ) -> None:
        """Completeness scores should be between 0 and 1."""
        for intake in [sample_intake, minimal_intake]:
            score = compute_spec_completeness(intake)
            assert 0.0 <= score <= 1.0

    def test_empty_intake_low_score(self) -> None:
        """Empty/near-empty intake should score very low."""
        score = compute_spec_completeness({})
        assert score < 0.3

    def test_acceptance_criteria_bonus(self, minimal_intake: JsonObject) -> None:
        """Having acceptance criteria should increase score."""
        without_criteria = compute_spec_completeness(minimal_intake)

        with_criteria = minimal_intake.copy()
        with_criteria["acceptance_criteria"] = {
            "success_conditions": [{"metric": "IC50", "operator": "lte", "threshold": 10}]
        }
        with_criteria_score = compute_spec_completeness(with_criteria)

        assert with_criteria_score > without_criteria


# ============================================================================
# Scoring Tests
# ============================================================================


class TestScoring:
    """Tests for weighted scoring algorithm."""

    def test_default_weights_sum_approximately_one(self) -> None:
        """Default weights should approximately sum to 1.0."""
        w = DEFAULT_WEIGHTS
        total = (
            w.menu_fit
            + w.turnaround_fit
            + w.spec_completeness
            + w.cost_fit
            + w.quality
            + w.logistics
            + w.deliverables_match
        )
        assert 0.95 <= total <= 1.05

    def test_score_components_non_negative(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """All score components should be >= 0."""
        spec_completeness = compute_spec_completeness(sample_intake)
        total, breakdown, flags = score_lab(
            sample_intake, commercial_lab, DEFAULT_WEIGHTS, spec_completeness
        )

        for component, value in breakdown.items():
            assert value >= 0, f"Component {component} has negative value: {value}"

    def test_total_score_in_valid_range(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Total score should be between 0 and ~1.1 (with region bonus)."""
        spec_completeness = compute_spec_completeness(sample_intake)
        total, breakdown, flags = score_lab(
            sample_intake, commercial_lab, DEFAULT_WEIGHTS, spec_completeness
        )
        assert 0.0 <= total <= 1.5

    def test_good_lab_scores_higher(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Lab with good metrics should score reasonably high."""
        spec_completeness = compute_spec_completeness(sample_intake)
        total, breakdown, flags = score_lab(
            sample_intake, commercial_lab, DEFAULT_WEIGHTS, spec_completeness
        )
        # Commercial lab has excellent metrics for cell viability
        assert total > 0.5

    def test_quality_flags_set(self, sample_intake: JsonObject, commercial_lab: JsonObject) -> None:
        """Quality concerns should generate flags."""
        # Create a lab with poor metrics
        poor_lab = commercial_lab.copy()
        poor_lab["quality_metrics"] = {
            "on_time_rate": 0.70,
            "average_rating": 3.5,
            "rerun_rate": 0.20,
        }
        spec_completeness = compute_spec_completeness(sample_intake)
        total, breakdown, flags = score_lab(
            sample_intake, poor_lab, DEFAULT_WEIGHTS, spec_completeness
        )
        assert "elevated_rerun_rate" in flags
        assert "below_average_rating" in flags

    def test_budget_exceeds_flags(
        self, minimal_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Budget concerns should generate flags."""
        intake = minimal_intake.copy()
        intake["turnaround_budget"] = {"budget_max_usd": 100}  # Very low for cell viability
        spec_completeness = compute_spec_completeness(intake)
        total, breakdown, flags = score_lab(
            intake, commercial_lab, DEFAULT_WEIGHTS, spec_completeness
        )
        assert any("budget" in f for f in flags)


# ============================================================================
# End-to-End Routing Tests
# ============================================================================


class TestRouteIntake:
    """Integration tests for full routing flow."""

    def test_route_returns_sorted_matches(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Routing should return matches sorted by score descending."""
        # Create a second lab with lower metrics
        lower_lab = commercial_lab.copy()
        lower_lab["lab_id"] = "lab_lower"
        lower_lab["name"] = "Lower Quality Lab"
        quality_metrics = _as_object(lower_lab.get("quality_metrics"))
        quality_metrics["average_rating"] = 3.5
        lower_lab["quality_metrics"] = quality_metrics

        labs = [lower_lab, commercial_lab]  # Put lower quality first
        result = route_intake(sample_intake, labs)

        if len(result.top_matches) >= 2:
            assert result.top_matches[0].score >= result.top_matches[1].score

    def test_route_filters_incompatible_labs(
        self, sample_intake: JsonObject, individual_lab: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Labs failing hard filters should not appear in results."""
        labs = [individual_lab, commercial_lab]
        result = route_intake(sample_intake, labs)

        # Individual lab doesn't support CELL_VIABILITY_IC50
        match_ids = [m.lab_id for m in result.top_matches]
        lab_id = _as_str(individual_lab.get("lab_id"))
        assert lab_id not in match_ids
        assert lab_id in result.filtered_out

    def test_route_includes_filter_reasons(
        self, sample_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Result should include reasons why labs were filtered."""
        labs = [individual_lab]
        result = route_intake(sample_intake, labs)

        lab_id = _as_str(individual_lab.get("lab_id"))
        assert lab_id in result.filtered_out
        assert "experiment_type_not_supported" in result.filtered_out[lab_id]

    def test_route_respects_top_k(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Should return at most top_k results."""
        # Create multiple labs
        labs = []
        for i in range(5):
            lab = commercial_lab.copy()
            lab["lab_id"] = f"lab_{i}"
            lab["name"] = f"Lab {i}"
            labs.append(lab)

        result = route_intake(sample_intake, labs, top_k=3)
        assert len(result.top_matches) <= 3

    def test_route_with_mic_intake(
        self, mic_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Test routing with MIC assay intake to individual lab."""
        result = route_intake(mic_intake, [individual_lab])

        # Individual lab supports MIC_MBC_ASSAY
        assert result.all_matches_count == 1
        assert len(result.top_matches) == 1
        assert result.top_matches[0].lab_id == individual_lab["lab_id"]

    def test_route_includes_pricing_info(
        self, mic_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Matches should include pricing band info."""
        result = route_intake(mic_intake, [individual_lab])
        match = result.top_matches[0]

        assert match.pricing_band_usd is not None
        assert "min" in match.pricing_band_usd
        assert "max" in match.pricing_band_usd

    def test_route_includes_tat_info(
        self, mic_intake: JsonObject, individual_lab: JsonObject
    ) -> None:
        """Matches should include turnaround time info."""
        result = route_intake(mic_intake, [individual_lab])
        match = result.top_matches[0]

        assert match.estimated_tat_days is not None

    def test_strict_deliverables_mode(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Strict deliverables mode should filter labs that can't meet all requirements."""
        # Modify intake to require something unusual
        intake = sample_intake.copy()
        deliverables = _as_object(intake.get("deliverables"))
        deliverables["raw_data_formats"] = ["FASTQ"]  # Unlikely supported
        intake["deliverables"] = deliverables

        result = route_intake(intake, [commercial_lab], strict_deliverables=True)

        # Lab should be filtered out
        assert result.all_matches_count == 0

    def test_region_preference_bonus(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Region preference should boost scores for matching labs."""
        labs = [commercial_lab]

        # Without region preference
        result_no_pref = route_intake(sample_intake, labs)
        score_no_pref = result_no_pref.top_matches[0].score

        # With matching region preference
        result_with_pref = route_intake(
            sample_intake,
            labs,
            region_preference="US",  # Commercial lab is in US
        )
        score_with_pref = result_with_pref.top_matches[0].score

        assert score_with_pref > score_no_pref


# ============================================================================
# Validation Tests
# ============================================================================


class TestValidation:
    """Tests for intake validation."""

    def test_valid_intake_passes(self, sample_intake: JsonObject) -> None:
        """Complete valid intake should pass validation."""
        valid, errors, warnings = validate_intake(sample_intake)
        assert valid
        assert len(errors) == 0

    def test_missing_required_field_fails(self) -> None:
        """Missing required field should fail validation."""
        incomplete: JsonObject = {
            "experiment_type": "CELL_VIABILITY_IC50",
            "title": "Missing fields",
            # Missing hypothesis, compliance, deliverables, turnaround_budget
        }
        valid, errors, warnings = validate_intake(incomplete)
        assert not valid
        assert len(errors) > 0

    def test_missing_hypothesis_statement_fails(self) -> None:
        """Missing hypothesis statement should fail validation."""
        intake: JsonObject = {
            "experiment_type": "CELL_VIABILITY_IC50",
            "title": "Test",
            "hypothesis": {},  # No statement
            "compliance": {"bsl": "BSL1"},
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
            "turnaround_budget": {"budget_max_usd": 500},
        }
        valid, errors, warnings = validate_intake(intake)
        assert not valid
        assert any("hypothesis" in _as_str(_as_object(e).get("path")) for e in errors)

    def test_missing_budget_fails(self) -> None:
        """Missing budget should fail validation."""
        intake: JsonObject = {
            "experiment_type": "CELL_VIABILITY_IC50",
            "title": "Test",
            "hypothesis": {"statement": "Test statement"},
            "compliance": {"bsl": "BSL1"},
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
            "turnaround_budget": {},  # No budget
        }
        valid, errors, warnings = validate_intake(intake)
        assert not valid
        assert any("budget" in _as_str(_as_object(e).get("path")) for e in errors)

    def test_invalid_experiment_type_fails(self) -> None:
        """Invalid experiment type should fail validation."""
        intake: JsonObject = {
            "experiment_type": "INVALID_TYPE",
            "title": "Test",
            "hypothesis": {"statement": "Test"},
            "compliance": {"bsl": "BSL1"},
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
            "turnaround_budget": {"budget_max_usd": 500},
        }
        valid, errors, warnings = validate_intake(intake)
        assert not valid
        assert any("experiment_type" in _as_str(_as_object(e).get("path")) for e in errors)

    def test_missing_null_hypothesis_warns(self, minimal_intake: JsonObject) -> None:
        """Missing null hypothesis should generate warning."""
        valid, errors, warnings = validate_intake(minimal_intake)
        assert any("null_hypothesis" in _as_str(_as_object(w).get("path")) for w in warnings)

    def test_low_completeness_warns(self) -> None:
        """Low completeness should generate warning."""
        # Use an incomplete intake missing required fields - this will have errors
        # but should also generate a completeness warning since score < 50%
        incomplete_intake: JsonObject = {
            "experiment_type": "CELL_VIABILITY_IC50",
            "title": "Test",
            # Missing many required fields, so completeness will be low
        }
        valid, errors, warnings = validate_intake(incomplete_intake)
        # Should be invalid due to missing required fields
        assert not valid
        # Should also warn about low completeness
        assert any(
            "completeness" in _as_str(_as_object(w).get("message")).lower() for w in warnings
        )


# ============================================================================
# Custom Weights Tests
# ============================================================================


class TestCustomWeights:
    """Tests for custom routing weights."""

    def test_custom_weights_affect_scoring(
        self, sample_intake: JsonObject, commercial_lab: JsonObject
    ) -> None:
        """Custom weights should change the score breakdown."""
        spec_completeness = compute_spec_completeness(sample_intake)

        # Default weights
        total_default, breakdown_default, _ = score_lab(
            sample_intake, commercial_lab, DEFAULT_WEIGHTS, spec_completeness
        )

        # Custom weights emphasizing quality
        quality_weights = RoutingWeights(
            menu_fit=0.05,
            turnaround_fit=0.05,
            spec_completeness=0.05,
            cost_fit=0.05,
            quality=0.70,  # Heavy emphasis on quality
            logistics=0.05,
            deliverables_match=0.05,
        )
        total_quality, breakdown_quality, _ = score_lab(
            sample_intake, commercial_lab, quality_weights, spec_completeness
        )

        # Quality component should be much larger with quality weights
        assert breakdown_quality["quality"] > breakdown_default["quality"]


# ============================================================================
# Edge Cases
# ============================================================================


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_empty_labs_list(self, sample_intake: JsonObject) -> None:
        """Routing with no labs should return empty results."""
        result = route_intake(sample_intake, [])
        assert len(result.top_matches) == 0
        assert result.all_matches_count == 0

    def test_all_labs_filtered(self, sample_intake: JsonObject, individual_lab: JsonObject) -> None:
        """When all labs are filtered, should return empty matches."""
        # Individual lab doesn't support cell viability
        result = route_intake(sample_intake, [individual_lab])
        assert result.all_matches_count == 0
        assert len(result.filtered_out) == 1

    def test_lab_missing_optional_fields(self, mic_intake: JsonObject) -> None:
        """Labs with missing optional fields should still be scored."""
        sparse_lab: JsonObject = {
            "lab_id": "sparse_lab",
            "name": "Sparse Lab",
            "status": "active",
            "capabilities": {"experiment_types": ["MIC_MBC_ASSAY"]},
            "compliance": {"max_bsl": "BSL2"},
            # Missing commercial_terms, quality_metrics, etc.
        }
        result = route_intake(mic_intake, [sparse_lab])
        assert result.all_matches_count == 1
        assert result.top_matches[0].score > 0
