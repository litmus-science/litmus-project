"""
Cloud Lab Integration Layer for Litmus Science.

Provides translators and API clients for cloud lab providers:
- Emerald Cloud Lab (ECL) - Uses Symbolic Lab Language (SLL)
- Strateos - Uses Autoprotocol (JSON)
"""

from .base import (
    CloudLabError,
    CloudLabProvider,
    CloudLabTranslator,
    StatusResult,
    SubmissionError,
    SubmissionResult,
    TranslationError,
    TranslationResult,
)
from .registry import PROVIDERS, get_provider, get_translator, list_providers

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
