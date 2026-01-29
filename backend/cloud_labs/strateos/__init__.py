"""
Strateos cloud lab integration.

Strateos uses Autoprotocol, an open-source JSON-based specification
for describing scientific experiments.
"""

from .translator import StrateosTranslator
from .provider import StrateosProvider

__all__ = ["StrateosTranslator", "StrateosProvider"]
