"""
Tests for cloud lab integration.

Run with: pytest tests/test_cloud_labs.py -v
"""

import json
import pytest
from pathlib import Path
from pydantic import ValidationError

# Import the cloud labs module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.cloud_labs import get_translator, get_provider, list_providers, PROVIDERS
from backend.cloud_labs.base import TranslationResult, ValidationIssue
from backend.cloud_labs.models import EdisonTranslateRequest
from backend.cloud_labs.registry import (
    translate_intake,
    validate_intake_for_provider,
    get_supported_experiment_types,
)


# Test fixtures
EXAMPLES_DIR = Path(__file__).parent.parent / "examples"

def load_example(name: str) -> dict:
    """Load an example intake file."""
    with open(EXAMPLES_DIR / name) as f:
        return json.load(f)


# Provider tests
class TestProviders:
    def test_list_providers(self):
        """Test that providers are listed correctly."""
        providers = list_providers()
        assert len(providers) == 2

        provider_ids = [p["id"] for p in providers]
        assert "ecl" in provider_ids
        assert "strateos" in provider_ids

    def test_get_ecl_translator(self):
        """Test getting ECL translator."""
        translator = get_translator("ecl")
        assert translator.provider_name == "ecl"
        assert translator.protocol_format == "sll"
        assert len(translator.supported_experiment_types()) == 8

    def test_get_strateos_translator(self):
        """Test getting Strateos translator."""
        translator = get_translator("strateos")
        assert translator.provider_name == "strateos"
        assert translator.protocol_format == "autoprotocol"
        assert len(translator.supported_experiment_types()) == 8

    def test_invalid_provider(self):
        """Test error handling for invalid provider."""
        with pytest.raises(ValueError, match="Unknown provider"):
            get_translator("invalid_provider")


# ECL Translation tests
class TestECLTranslation:
    def test_translate_sanger(self):
        """Test Sanger sequencing translation to SLL."""
        intake = load_example("intake_sanger_verification.json")
        translator = get_translator("ecl")

        result = translator.translate(intake)

        assert result.success
        assert result.format == "sll"
        assert "ExperimentSequencing" in result.protocol_readable
        assert "Object[Sample" in result.protocol_readable

    def test_translate_qpcr(self):
        """Test qPCR translation to SLL."""
        intake = load_example("intake_qpcr_expression.json")
        translator = get_translator("ecl")

        result = translator.translate(intake)

        assert result.success
        assert "ExperimentqPCR" in result.protocol_readable
        assert "Primers" in result.protocol_readable
        assert "NumberOfReplicates" in result.protocol_readable

    def test_translate_cell_viability(self):
        """Test cell viability translation to SLL."""
        intake = load_example("intake_cell_viability.json")
        translator = get_translator("ecl")

        result = translator.translate(intake)

        assert result.success
        assert "ExperimentCellViability" in result.protocol_readable
        assert "Compounds" in result.protocol_readable

    def test_translate_mic_mbc(self):
        """Test MIC/MBC translation to SLL."""
        intake = load_example("intake_mic_assay.json")
        translator = get_translator("ecl")

        result = translator.translate(intake)

        assert result.success
        assert "ExperimentAntibioticSusceptibility" in result.protocol_readable


# Strateos Translation tests
class TestStrateosTranslation:
    def test_translate_sanger(self):
        """Test Sanger sequencing translation to Autoprotocol."""
        intake = load_example("intake_sanger_verification.json")
        translator = get_translator("strateos")

        result = translator.translate(intake)

        assert result.success
        assert result.format == "autoprotocol"

        # Parse the JSON protocol
        protocol = result.protocol
        assert "refs" in protocol
        assert "instructions" in protocol
        assert any(i["op"] == "sanger_sequence" for i in protocol["instructions"])

    def test_translate_qpcr(self):
        """Test qPCR translation to Autoprotocol."""
        intake = load_example("intake_qpcr_expression.json")
        translator = get_translator("strateos")

        result = translator.translate(intake)

        assert result.success

        protocol = result.protocol
        assert "refs" in protocol
        assert "instructions" in protocol
        # Should have thermocycle instruction for qPCR
        assert any(i["op"] == "thermocycle" for i in protocol["instructions"])

    def test_translate_cell_viability(self):
        """Test cell viability translation to Autoprotocol."""
        intake = load_example("intake_cell_viability.json")
        translator = get_translator("strateos")

        result = translator.translate(intake)

        assert result.success

        protocol = result.protocol
        # Should have incubate and absorbance/luminescence instructions
        ops = [i["op"] for i in protocol["instructions"]]
        assert "incubate" in ops

    def test_autoprotocol_structure(self):
        """Test that Autoprotocol output has correct structure."""
        intake = load_example("intake_qpcr_expression.json")
        translator = get_translator("strateos")

        result = translator.translate(intake)
        protocol = result.protocol

        # Check refs structure
        for ref_name, ref_def in protocol["refs"].items():
            assert isinstance(ref_name, str)
            assert "new" in ref_def or "id" in ref_def

        # Check instructions structure
        for instr in protocol["instructions"]:
            assert "op" in instr


# Validation tests
class TestValidation:
    def test_validate_missing_experiment_type(self):
        """Test validation catches missing experiment type."""
        intake = {"title": "Test"}

        translator = get_translator("ecl")
        issues = translator.validate_intake(intake)

        errors = [i for i in issues if i.severity == "error"]
        assert any(i.code == "missing_field" and "experiment_type" in i.path for i in errors)

    def test_validate_unsupported_bsl(self):
        """Test validation catches unsupported BSL level."""
        intake = {
            "experiment_type": "QPCR_EXPRESSION",
            "compliance": {"bsl": "BSL3"},
            "qpcr": {}
        }

        translator = get_translator("ecl")
        issues = translator.validate_intake(intake)

        errors = [i for i in issues if i.severity == "error"]
        assert any("bsl" in i.path.lower() for i in errors)

    def test_validate_missing_section(self):
        """Test validation catches missing experiment-specific section."""
        intake = {
            "experiment_type": "QPCR_EXPRESSION",
            "compliance": {"bsl": "BSL1"}
            # Missing "qpcr" section
        }

        translator = get_translator("ecl")
        issues = translator.validate_intake(intake)

        errors = [i for i in issues if i.severity == "error"]
        assert any(i.code == "missing_section" for i in errors)


# Multi-provider tests
class TestMultiProvider:
    def test_translate_all_providers(self):
        """Test translating to all providers at once."""
        intake = load_example("intake_qpcr_expression.json")

        results = translate_intake(intake)

        assert "ecl" in results
        assert "strateos" in results

        assert results["ecl"].success
        assert results["strateos"].success

    def test_get_supported_types_all(self):
        """Test getting supported types for all providers."""
        types = get_supported_experiment_types()

        assert "ecl" in types
        assert "strateos" in types

        # Both should support the same 8 types
        assert len(types["ecl"]) == 8
        assert len(types["strateos"]) == 8
        assert set(types["ecl"]) == set(types["strateos"])


class TestEdisonSchema:
    def test_invalid_job_type_rejected(self):
        """Test Edison schema rejects invalid job_type values."""
        with pytest.raises(ValidationError):
            EdisonTranslateRequest(query="test", job_type="invalid")


# Provider API tests (stubbed)
class TestProviderAPI:
    @pytest.mark.asyncio
    async def test_ecl_provider_not_authenticated(self):
        """Test ECL provider returns error when not authenticated."""
        provider = get_provider("ecl")

        result = await provider.submit_experiment({"test": "protocol"})

        assert not result.success
        assert "Not authenticated" in result.message

    @pytest.mark.asyncio
    async def test_strateos_provider_not_authenticated(self):
        """Test Strateos provider returns error when not authenticated."""
        provider = get_provider("strateos")

        result = await provider.submit_experiment({"test": "protocol"})

        assert not result.success
        assert "Not authenticated" in result.message

    @pytest.mark.asyncio
    async def test_ecl_authenticate_with_credentials(self):
        """Test ECL authentication with credentials."""
        provider = get_provider("ecl", {
            "client_id": "test",
            "client_secret": "test",
            "organization_id": "test"
        })

        result = await provider.authenticate({
            "client_id": "test",
            "client_secret": "test",
            "organization_id": "test"
        })

        # Should return True (stubbed implementation)
        assert result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
