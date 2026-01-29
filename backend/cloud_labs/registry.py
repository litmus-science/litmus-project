"""
Cloud Lab Provider Registry.

Manages registration and lookup of cloud lab translators and providers.
"""

from typing import Any

from .base import CloudLabTranslator, CloudLabProvider, TranslationResult, ValidationIssue
from .ecl import ECLTranslator, ECLProvider
from .strateos import StrateosTranslator, StrateosProvider


# Provider information registry
PROVIDERS = {
    "ecl": {
        "name": "Emerald Cloud Lab",
        "short_name": "ECL",
        "protocol_format": "sll",
        "protocol_format_name": "Symbolic Lab Language (SLL)",
        "description": "Automated cloud lab using Wolfram Language-based SLL for experiment specification",
        "website": "https://www.emeraldcloudlab.com",
        "documentation": "https://www.emeraldcloudlab.com/documentation/",
        "capabilities": [
            "Sanger sequencing",
            "qPCR",
            "Cell viability assays",
            "Enzyme activity assays",
            "Microbial growth curves",
            "MIC/MBC assays",
            "Disk diffusion (zone of inhibition)",
            "Western blot",
            "ELISA",
            "Mass spectrometry",
        ],
        "bsl_levels": ["BSL1", "BSL2"],
        "credential_fields": ["client_id", "client_secret", "organization_id"],
        "api_status": "stub",  # "active", "stub", "maintenance"
    },
    "strateos": {
        "name": "Strateos",
        "short_name": "Strateos",
        "protocol_format": "autoprotocol",
        "protocol_format_name": "Autoprotocol (JSON)",
        "description": "Cloud lab using Autoprotocol JSON specification for experiment definition",
        "website": "https://www.strateos.com",
        "documentation": "https://developers.strateos.com/docs/autoprotocol",
        "capabilities": [
            "Sanger sequencing",
            "PCR/qPCR",
            "Cell-based assays",
            "Plate-based assays",
            "Liquid handling",
            "Incubation",
            "Spectrophotometry",
            "Fluorescence measurements",
        ],
        "bsl_levels": ["BSL1", "BSL2"],
        "credential_fields": ["api_key", "organization_id", "project_id"],
        "api_status": "stub",
    },
}

# Translator instances (lazily created)
_translators: dict[str, CloudLabTranslator] = {}

# Provider instances (lazily created)
_providers: dict[str, CloudLabProvider] = {}


def get_translator(provider_name: str) -> CloudLabTranslator:
    """
    Get a translator instance for the specified provider.

    Args:
        provider_name: The provider identifier ("ecl" or "strateos")

    Returns:
        CloudLabTranslator instance

    Raises:
        ValueError: If provider is not supported
    """
    provider_name = provider_name.lower()

    if provider_name not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider_name}. Supported: {list(PROVIDERS.keys())}")

    if provider_name not in _translators:
        if provider_name == "ecl":
            _translators[provider_name] = ECLTranslator()
        elif provider_name == "strateos":
            _translators[provider_name] = StrateosTranslator()

    return _translators[provider_name]


def get_provider(provider_name: str, credentials: dict | None = None) -> CloudLabProvider:
    """
    Get a provider (API client) instance for the specified provider.

    Args:
        provider_name: The provider identifier
        credentials: Optional credentials dict to initialize the provider

    Returns:
        CloudLabProvider instance

    Raises:
        ValueError: If provider is not supported
    """
    provider_name = provider_name.lower()

    if provider_name not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider_name}. Supported: {list(PROVIDERS.keys())}")

    # Create new provider instance with credentials if provided
    if provider_name == "ecl":
        provider = ECLProvider(
            client_id=credentials.get("client_id") if credentials else None,
            client_secret=credentials.get("client_secret") if credentials else None,
            organization_id=credentials.get("organization_id") if credentials else None,
        )
    elif provider_name == "strateos":
        provider = StrateosProvider(
            api_key=credentials.get("api_key") if credentials else None,
            organization_id=credentials.get("organization_id") if credentials else None,
            project_id=credentials.get("project_id") if credentials else None,
        )
    else:
        raise ValueError(f"No provider implementation for: {provider_name}")

    return provider


def list_providers() -> list[dict]:
    """
    List all available cloud lab providers with their capabilities.

    Returns:
        List of provider info dicts
    """
    return [
        {
            "id": provider_id,
            **provider_info
        }
        for provider_id, provider_info in PROVIDERS.items()
    ]


def get_provider_info(provider_name: str) -> dict:
    """
    Get detailed information about a specific provider.

    Args:
        provider_name: The provider identifier

    Returns:
        Provider info dict

    Raises:
        ValueError: If provider is not found
    """
    provider_name = provider_name.lower()
    if provider_name not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider_name}")
    return {"id": provider_name, **PROVIDERS[provider_name]}


def translate_intake(intake: dict, provider_name: str | None = None) -> dict[str, TranslationResult]:
    """
    Translate an intake specification to one or all cloud lab formats.

    Args:
        intake: The Litmus experiment intake dict
        provider_name: Optional specific provider, or None for all compatible

    Returns:
        Dict mapping provider names to TranslationResult objects
    """
    results = {}

    if provider_name:
        # Translate for specific provider
        translator = get_translator(provider_name)
        results[provider_name] = translator.translate(intake)
    else:
        # Translate for all compatible providers
        for prov_name in PROVIDERS:
            translator = get_translator(prov_name)
            if translator.can_translate(intake):
                results[prov_name] = translator.translate(intake)

    return results


def validate_intake_for_provider(intake: dict, provider_name: str) -> list[ValidationIssue]:
    """
    Validate an intake specification for a specific provider.

    Args:
        intake: The Litmus experiment intake dict
        provider_name: The target provider

    Returns:
        List of validation issues
    """
    translator = get_translator(provider_name)
    return translator.validate_intake(intake)


def get_supported_experiment_types(provider_name: str | None = None) -> dict[str, list[str]]:
    """
    Get supported experiment types for one or all providers.

    Args:
        provider_name: Optional specific provider

    Returns:
        Dict mapping provider names to lists of supported experiment types
    """
    if provider_name:
        translator = get_translator(provider_name)
        return {provider_name: translator.supported_experiment_types()}

    return {
        prov_name: get_translator(prov_name).supported_experiment_types()
        for prov_name in PROVIDERS
    }
