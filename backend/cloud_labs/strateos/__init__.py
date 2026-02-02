"""
Strateos cloud lab integration.

Strateos uses Autoprotocol, an open-source JSON-based specification
for describing scientific experiments.
"""

from .provider import StrateosProvider
from .translator import StrateosTranslator

__all__ = ["StrateosTranslator", "StrateosProvider"]
