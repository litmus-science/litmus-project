"""
Tests for cloud lab integration.

Run with: pytest tests/test_cloud_labs.py -v
"""

import json

# Import the cloud labs module
import sys
from pathlib import Path
from typing import cast

import pytest
from pydantic import ValidationError

from backend.types import JsonObject

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.cloud_labs import get_provider, get_translator, list_providers
from backend.cloud_labs.models import EdisonTranslateRequest
from backend.cloud_labs.registry import (
    get_supported_experiment_types,
    translate_intake,
)

# Test fixtures
EXAMPLES_DIR = Path(__file__).parent.parent / "examples"


def load_example(name: str) -> JsonObject:
    """Load an example intake file."""
    with open(EXAMPLES_DIR / name) as f:
        return cast(JsonObject, json.load(f))


# Provider tests
class TestProviders:
    def test_list_providers(self) -> None:
        """Test that providers are listed correctly."""
        providers = list_providers()
        assert len(providers) == 2

        provider_ids = [p["id"] for p in providers]
        assert "ecl" in provider_ids
        assert "strateos" in provider_ids

    def test_get_ecl_translator(self) -> None:
        """Test getting ECL translator."""
        translator = get_translator("ecl")
        assert translator.provider_name == "ecl"
        assert translator.protocol_format == "sll"
        assert len(translator.supported_experiment_types()) == 8

    def test_get_strateos_translator(self) -> None:
        """Test getting Strateos translator."""
        translator = get_translator("strateos")
        assert translator.provider_name == "strateos"
        assert translator.protocol_format == "autoprotocol"
        assert len(translator.supported_experiment_types()) == 8

    def test_invalid_provider(self) -> None:
        """Test error handling for invalid provider."""
        with pytest.raises(ValueError, match="Unknown provider"):
            get_translator("invalid_provider")


# ECL Translation tests
class TestECLTranslation:
    def test_translate_sanger(self) -> None:
        """Test Sanger sequencing translation to SLL."""
        intake = load_example("intake_sanger_verification.json")
        translator = get_translator("ecl")

        result = translator.translate(intake)

        assert result.success
        assert result.format == "sll"
        assert "ExperimentSequencing" in result.protocol_readable
        assert "Object[Sample" in result.protocol_readable

    def test_translate_qpcr(self) -> None:
        """Test qPCR translation to SLL."""
        intake = load_example("intake_qpcr_expression.json")
        translator = get_translator("ecl")

        result = translator.translate(intake)

        assert result.success
        assert "ExperimentqPCR" in result.protocol_readable
        assert "Primers" in result.protocol_readable
        assert "NumberOfReplicates" in result.protocol_readable

    def test_translate_cell_viability(self) -> None:
        """Test cell viability translation to SLL."""
        intake = load_example("intake_cell_viability.json")
        translator = get_translator("ecl")

        result = translator.translate(intake)

        assert result.success
        assert "ExperimentCellViability" in result.protocol_readable
        assert "Compounds" in result.protocol_readable

    def test_translate_mic_mbc(self) -> None:
        """Test MIC/MBC translation to SLL."""
        intake = load_example("intake_mic_assay.json")
        translator = get_translator("ecl")

        result = translator.translate(intake)

        assert result.success
        assert "ExperimentAntibioticSusceptibility" in result.protocol_readable


# Strateos Translation tests
class TestStrateosTranslation:
    def test_translate_sanger(self) -> None:
        """Test Sanger sequencing translation to Autoprotocol."""
        intake = load_example("intake_sanger_verification.json")
        translator = get_translator("strateos")

        result = translator.translate(intake)

        assert result.success
        assert result.format == "autoprotocol"

        # Parse the JSON protocol
        protocol = result.protocol
        assert isinstance(protocol, dict)
        refs = protocol.get("refs")
        instructions = protocol.get("instructions")
        assert isinstance(refs, dict)
        assert isinstance(instructions, list)
        assert any(isinstance(i, dict) and i.get("op") == "sanger_sequence" for i in instructions)

    def test_translate_qpcr(self) -> None:
        """Test qPCR translation to Autoprotocol."""
        intake = load_example("intake_qpcr_expression.json")
        translator = get_translator("strateos")

        result = translator.translate(intake)

        assert result.success

        protocol = result.protocol
        assert isinstance(protocol, dict)
        refs = protocol.get("refs")
        instructions = protocol.get("instructions")
        assert isinstance(refs, dict)
        assert isinstance(instructions, list)
        # Should have thermocycle instruction for qPCR
        assert any(isinstance(i, dict) and i.get("op") == "thermocycle" for i in instructions)

    def test_translate_cell_viability(self) -> None:
        """Test cell viability translation to Autoprotocol."""
        intake = load_example("intake_cell_viability.json")
        translator = get_translator("strateos")

        result = translator.translate(intake)

        assert result.success

        protocol = result.protocol
        assert isinstance(protocol, dict)
        instructions = protocol.get("instructions")
        assert isinstance(instructions, list)
        # Should have incubate and absorbance/luminescence instructions
        ops = [i.get("op") for i in instructions if isinstance(i, dict)]
        assert "incubate" in ops

    def test_autoprotocol_structure(self) -> None:
        """Test that Autoprotocol output has correct structure."""
        intake = load_example("intake_qpcr_expression.json")
        translator = get_translator("strateos")

        result = translator.translate(intake)
        protocol = result.protocol
        assert isinstance(protocol, dict)

        # Check refs structure
        refs = protocol.get("refs")
        assert isinstance(refs, dict)
        for ref_name, ref_def in refs.items():
            assert isinstance(ref_name, str)
            assert isinstance(ref_def, dict)
            assert "new" in ref_def or "id" in ref_def

        # Check instructions structure
        instructions = protocol.get("instructions")
        assert isinstance(instructions, list)
        for instr in instructions:
            assert isinstance(instr, dict)
            assert "op" in instr


# Validation tests
class TestValidation:
    def test_validate_missing_experiment_type(self) -> None:
        """Test validation catches missing experiment type."""
        intake: JsonObject = {"title": "Test"}

        translator = get_translator("ecl")
        issues = translator.validate_intake(intake)

        errors = [i for i in issues if i.severity == "error"]
        assert any(i.code == "missing_field" and "experiment_type" in i.path for i in errors)

    def test_validate_unsupported_bsl(self) -> None:
        """Test validation catches unsupported BSL level."""
        intake: JsonObject = {
            "experiment_type": "QPCR_EXPRESSION",
            "compliance": {"bsl": "BSL3"},
            "qpcr": {},
        }

        translator = get_translator("ecl")
        issues = translator.validate_intake(intake)

        errors = [i for i in issues if i.severity == "error"]
        assert any("bsl" in i.path.lower() for i in errors)

    def test_validate_missing_section(self) -> None:
        """Test validation catches missing experiment-specific section."""
        intake: JsonObject = {
            "experiment_type": "QPCR_EXPRESSION",
            "compliance": {"bsl": "BSL1"},
            # Missing "qpcr" section
        }

        translator = get_translator("ecl")
        issues = translator.validate_intake(intake)

        errors = [i for i in issues if i.severity == "error"]
        assert any(i.code == "missing_section" for i in errors)


# Multi-provider tests
class TestMultiProvider:
    def test_translate_all_providers(self) -> None:
        """Test translating to all providers at once."""
        intake = load_example("intake_qpcr_expression.json")

        results = translate_intake(intake)

        assert "ecl" in results
        assert "strateos" in results

        assert results["ecl"].success
        assert results["strateos"].success

    def test_get_supported_types_all(self) -> None:
        """Test getting supported types for all providers."""
        types = get_supported_experiment_types()

        assert "ecl" in types
        assert "strateos" in types

        # Both should support the same 8 types
        assert len(types["ecl"]) == 8
        assert len(types["strateos"]) == 8
        assert set(types["ecl"]) == set(types["strateos"])


class TestEdisonSchema:
    def test_invalid_job_type_rejected(self) -> None:
        """Test Edison schema rejects invalid job_type values."""
        with pytest.raises(ValidationError):
            EdisonTranslateRequest.model_validate({"query": "test", "job_type": "invalid"})


# Provider API tests (stubbed)
class TestProviderAPI:
    @pytest.mark.asyncio
    async def test_ecl_provider_not_authenticated(self) -> None:
        """Test ECL provider returns error when not authenticated."""
        provider = get_provider("ecl")

        result = await provider.submit_experiment({"test": "protocol"})

        assert not result.success
        assert result.message is not None
        assert "Not authenticated" in result.message

    @pytest.mark.asyncio
    async def test_strateos_provider_not_authenticated(self) -> None:
        """Test Strateos provider returns error when not authenticated."""
        provider = get_provider("strateos")

        result = await provider.submit_experiment({"test": "protocol"})

        assert not result.success
        assert result.message is not None
        assert "Not authenticated" in result.message

    @pytest.mark.asyncio
    async def test_ecl_authenticate_with_credentials(self) -> None:
        """Test ECL authentication with credentials."""
        provider = get_provider(
            "ecl", {"client_id": "test", "client_secret": "test", "organization_id": "test"}
        )

        result = await provider.authenticate(
            {"client_id": "test", "client_secret": "test", "organization_id": "test"}
        )

        # Should return True (stubbed implementation)
        assert result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
