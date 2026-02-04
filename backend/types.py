"""
Shared type aliases for JSON-compatible data.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypeAlias

from pydantic import JsonValue as PydanticJsonValue

JsonValue: TypeAlias = PydanticJsonValue
JsonArray: TypeAlias = Sequence[JsonValue]
JsonObject: TypeAlias = dict[str, JsonValue]
