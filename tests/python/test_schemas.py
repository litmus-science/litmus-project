"""
Schema validation tests.

Validates example files against JSON schemas using jsonschema library.
"""

import json
from pathlib import Path
from typing import cast

import pytest

from backend.types import JsonObject

# Try to import jsonschema, skip tests if not available
try:
    from jsonschema import Draft7Validator, ValidationError, validate

    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
SCHEMAS_DIR = PROJECT_ROOT / "schemas"
EXAMPLES_DIR = PROJECT_ROOT / "examples"


def load_json(path: Path) -> JsonObject:
    """Load JSON file."""
    return cast(JsonObject, json.loads(path.read_text()))


# Skip all tests if jsonschema not installed
pytestmark = pytest.mark.skipif(not HAS_JSONSCHEMA, reason="jsonschema package not installed")


class TestExperimentIntakeSchema:
    """Test experiment_intake.json schema."""

    @pytest.fixture
    def schema(self) -> JsonObject:
        return load_json(SCHEMAS_DIR / "experiment_intake.json")

    def test_schema_is_valid_json_schema(self, schema: JsonObject) -> None:
        """Schema itself should be valid JSON Schema draft-07."""
        Draft7Validator.check_schema(schema)

    def test_intake_cell_viability_valid(self, schema: JsonObject) -> None:
        """Cell viability example should validate."""
        example = load_json(EXAMPLES_DIR / "intake_cell_viability.json")
        validate(instance=example, schema=schema)

    def test_intake_mic_assay_valid(self, schema: JsonObject) -> None:
        """MIC assay example should validate."""
        example = load_json(EXAMPLES_DIR / "intake_mic_assay.json")
        validate(instance=example, schema=schema)

    def test_intake_sanger_verification_valid(self, schema: JsonObject) -> None:
        """Sanger verification example should validate."""
        example = load_json(EXAMPLES_DIR / "intake_sanger_verification.json")
        validate(instance=example, schema=schema)

    def test_intake_qpcr_expression_valid(self, schema: JsonObject) -> None:
        """qPCR expression example should validate."""
        example = load_json(EXAMPLES_DIR / "intake_qpcr_expression.json")
        validate(instance=example, schema=schema)

    def test_intake_enzyme_inhibition_valid(self, schema: JsonObject) -> None:
        """Enzyme inhibition example should validate."""
        example = load_json(EXAMPLES_DIR / "intake_enzyme_inhibition.json")
        validate(instance=example, schema=schema)

    def test_intake_microbial_growth_valid(self, schema: JsonObject) -> None:
        """Microbial growth example should validate."""
        example = load_json(EXAMPLES_DIR / "intake_microbial_growth.json")
        validate(instance=example, schema=schema)

    def test_intake_zone_inhibition_valid(self, schema: JsonObject) -> None:
        """Zone of inhibition example should validate."""
        example = load_json(EXAMPLES_DIR / "intake_zone_inhibition.json")
        validate(instance=example, schema=schema)

    def test_intake_custom_valid(self, schema: JsonObject) -> None:
        """Custom protocol example should validate."""
        example = load_json(EXAMPLES_DIR / "intake_custom.json")
        validate(instance=example, schema=schema)

    def test_missing_experiment_type_fails(self, schema: JsonObject) -> None:
        """Missing experiment_type should fail validation."""
        invalid = {
            "title": "Test",
            "hypothesis": {"statement": "Test hypothesis"},
            "compliance": {"bsl": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 500},
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
        }
        with pytest.raises(ValidationError) as exc_info:
            validate(instance=invalid, schema=schema)
        assert "experiment_type" in str(exc_info.value)

    def test_missing_title_fails(self, schema: JsonObject) -> None:
        """Missing title should fail validation."""
        invalid = {
            "experiment_type": "MIC_MBC_ASSAY",
            "hypothesis": {"statement": "Test hypothesis"},
            "compliance": {"bsl": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 500},
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
        }
        with pytest.raises(ValidationError) as exc_info:
            validate(instance=invalid, schema=schema)
        error_message = str(exc_info.value)
        assert "title" in error_message or "mic_mbc" in error_message

    def test_invalid_experiment_type_fails(self, schema: JsonObject) -> None:
        """Invalid experiment_type should fail validation."""
        invalid = {
            "experiment_type": "INVALID_TYPE",
            "title": "Test experiment",
            "hypothesis": {"statement": "Test hypothesis"},
            "compliance": {"bsl": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 500},
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
        }
        with pytest.raises(ValidationError) as exc_info:
            validate(instance=invalid, schema=schema)
        assert "INVALID_TYPE" in str(exc_info.value)

    def test_invalid_bsl_level_fails(self, schema: JsonObject) -> None:
        """Invalid BSL level should fail validation."""
        invalid = {
            "experiment_type": "MIC_MBC_ASSAY",
            "title": "Test experiment",
            "hypothesis": {"statement": "Test hypothesis"},
            "compliance": {"bsl": "BSL3"},  # Invalid
            "turnaround_budget": {"budget_max_usd": 500},
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
            "mic_mbc": {"organism": "E. coli"},
        }
        with pytest.raises(ValidationError) as exc_info:
            validate(instance=invalid, schema=schema)
        assert "BSL3" in str(exc_info.value)

    def test_missing_experiment_specific_section_fails(self, schema: JsonObject) -> None:
        """Missing experiment-specific section should fail (conditional requirement)."""
        invalid = {
            "experiment_type": "MIC_MBC_ASSAY",
            "title": "Test experiment",
            "hypothesis": {"statement": "Test hypothesis"},
            "compliance": {"bsl": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 500},
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
            # Missing mic_mbc section
        }
        with pytest.raises(ValidationError) as exc_info:
            validate(instance=invalid, schema=schema)
        assert "mic_mbc" in str(exc_info.value)

    def test_budget_too_low_fails(self, schema: JsonObject) -> None:
        """Budget below minimum should fail validation."""
        invalid = {
            "experiment_type": "MIC_MBC_ASSAY",
            "title": "Test experiment",
            "hypothesis": {"statement": "Test hypothesis"},
            "compliance": {"bsl": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 10},  # Below minimum of 50
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
            "mic_mbc": {"organism": "E. coli"},
        }
        with pytest.raises(ValidationError) as exc_info:
            validate(instance=invalid, schema=schema)
        assert "minimum" in str(exc_info.value).lower()

    def test_invalid_privacy_value_fails(self, schema: JsonObject) -> None:
        """Invalid privacy value should fail validation."""
        invalid = {
            "experiment_type": "MIC_MBC_ASSAY",
            "title": "Test experiment",
            "hypothesis": {"statement": "Test hypothesis"},
            "compliance": {"bsl": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 500},
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
            "privacy": "invalid_option",
            "mic_mbc": {"organism": "E. coli"},
        }
        with pytest.raises(ValidationError) as exc_info:
            validate(instance=invalid, schema=schema)
        assert "invalid_option" in str(exc_info.value)


class TestLabProfileSchema:
    """Test lab_profile.json schema."""

    @pytest.fixture
    def schema(self) -> JsonObject:
        return load_json(SCHEMAS_DIR / "lab_profile.json")

    def test_schema_is_valid_json_schema(self, schema: JsonObject) -> None:
        """Schema itself should be valid JSON Schema draft-07."""
        Draft7Validator.check_schema(schema)

    def test_lab_profile_individual_valid(self, schema: JsonObject) -> None:
        """Individual lab profile example should validate."""
        example = load_json(EXAMPLES_DIR / "lab_profile_individual.json")
        validate(instance=example, schema=schema)

    def test_lab_profile_commercial_valid(self, schema: JsonObject) -> None:
        """Commercial lab profile example should validate."""
        example = load_json(EXAMPLES_DIR / "lab_profile_commercial.json")
        validate(instance=example, schema=schema)

    def test_missing_lab_id_fails(self, schema: JsonObject) -> None:
        """Missing lab_id should fail validation."""
        invalid = {
            "name": "Test Lab",
            "status": "active",
        }
        with pytest.raises(ValidationError) as exc_info:
            validate(instance=invalid, schema=schema)
        assert "lab_id" in str(exc_info.value)


class TestRouterValidation:
    """Test that router validation matches schema requirements."""

    def test_router_validate_matches_schema_requirements(self) -> None:
        """Router validation should catch same issues as schema."""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT / "router"))
        from router import validate_intake

        # Missing required fields
        invalid: JsonObject = {"experiment_type": "MIC_MBC_ASSAY"}
        valid, errors, _ = validate_intake(invalid)
        assert not valid
        assert any("hypothesis" in str(e) for e in errors)
        assert any("title" in str(e) for e in errors)

    def test_router_completeness_correlates_with_schema_fields(self) -> None:
        """Spec completeness should increase as more schema fields are filled."""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT / "router"))
        from router import compute_spec_completeness

        # Minimal intake
        minimal: JsonObject = {"experiment_type": "MIC_MBC_ASSAY"}
        minimal_score = compute_spec_completeness(minimal)

        # More complete intake
        better: JsonObject = {
            "experiment_type": "MIC_MBC_ASSAY",
            "title": "Test",
            "hypothesis": {"statement": "Test hypothesis"},
            "compliance": {"bsl": "BSL1"},
            "turnaround_budget": {"budget_max_usd": 500},
            "deliverables": {"minimum_package_level": "L1_BASIC_QC"},
        }
        better_score = compute_spec_completeness(better)

        assert better_score > minimal_score

        # Full intake with experiment-specific section
        full: JsonObject = {
            **better,
            "mic_mbc": {
                "organism": "E. coli",
                "strain": "K-12",
                "medium": "Mueller-Hinton broth",
                "compound_name": "Test compound",
            },
            "acceptance_criteria": {
                "success_conditions": [{"metric": "MIC", "operator": "lte", "threshold": 10}]
            },
        }
        full_score = compute_spec_completeness(full)

        assert full_score > better_score


class TestSchemaConsistency:
    """Test consistency between schemas, examples, and code."""

    def test_all_experiment_types_have_examples(self) -> None:
        """Every experiment type in schema should have an example file."""
        schema = load_json(SCHEMAS_DIR / "experiment_intake.json")
        properties = cast(JsonObject, schema["properties"])
        experiment_type_section = cast(JsonObject, properties["experiment_type"])
        experiment_types = cast(list[str], experiment_type_section["enum"])

        expected_files = {
            "SANGER_PLASMID_VERIFICATION": "intake_sanger_verification.json",
            "QPCR_EXPRESSION": "intake_qpcr_expression.json",
            "CELL_VIABILITY_IC50": "intake_cell_viability.json",
            "ENZYME_INHIBITION_IC50": "intake_enzyme_inhibition.json",
            "MICROBIAL_GROWTH_MATRIX": "intake_microbial_growth.json",
            "MIC_MBC_ASSAY": "intake_mic_assay.json",
            "ZONE_OF_INHIBITION": "intake_zone_inhibition.json",
            "CUSTOM": "intake_custom.json",
        }

        for exp_type in experiment_types:
            expected_file = expected_files.get(exp_type)
            assert expected_file, f"No example mapping for {exp_type}"
            assert (EXAMPLES_DIR / expected_file).exists(), f"Missing example for {exp_type}"

    def test_schema_bsl_field_name_is_bsl_not_bsl_level(self) -> None:
        """Schema should use 'bsl' not 'bsl_level' for consistency."""
        schema = load_json(SCHEMAS_DIR / "experiment_intake.json")
        properties = cast(JsonObject, schema["properties"])
        compliance_section = cast(JsonObject, properties["compliance"])
        compliance_props = cast(JsonObject, compliance_section["properties"])

        assert "bsl" in compliance_props, "Schema should have 'bsl' field"
        assert "bsl_level" not in compliance_props, "Schema should NOT have 'bsl_level' field"

    def test_privacy_is_at_root_level_not_under_compliance(self) -> None:
        """Privacy field should be at root level, not under compliance."""
        schema = load_json(SCHEMAS_DIR / "experiment_intake.json")

        # Privacy should be at root
        properties = cast(JsonObject, schema["properties"])
        assert "privacy" in properties, "privacy should be at root level"

        # Privacy should NOT be under compliance
        compliance_section = cast(JsonObject, properties["compliance"])
        compliance_props = cast(JsonObject, compliance_section["properties"])
        assert "privacy" not in compliance_props, "privacy should NOT be under compliance"
