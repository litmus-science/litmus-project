"""
Cloud Lab Integration Layer for Litmus Science.

Provides translators and API clients for cloud lab providers:
- Emerald Cloud Lab (ECL) - Uses Symbolic Lab Language (SLL)
- Strateos - Uses Autoprotocol (JSON)
"""

from .base import (
    CloudLabTranslator,
    CloudLabProvider,
    TranslationResult,
    SubmissionResult,
    StatusResult,
    CloudLabError,
    TranslationError,
    SubmissionError,
)
from .registry import get_translator, get_provider, list_providers, PROVIDERS

__all__ = [
    "CloudLabTranslator",
    "CloudLabProvider",
    "TranslationResult",
    "SubmissionResult",
    "StatusResult",
    "CloudLabError",
    "TranslationError",
    "SubmissionError",
    "get_translator",
    "get_provider",
    "list_providers",
    "PROVIDERS",
]
