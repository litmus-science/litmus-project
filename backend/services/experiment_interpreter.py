"""
Experiment Interpreter Service.

Uses LLM to interpret natural language experiment descriptions
and extract structured parameters for cloud lab translation.
"""

from dataclasses import dataclass, field
from typing import Any

from .llm_service import LLMService, get_llm_service
from .prompts import SYSTEM_PROMPT, get_interpretation_prompt


@dataclass
class InterpretationResult:
    """Result of experiment interpretation."""

    success: bool
    enriched_intake: dict[str, Any]
    suggestions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    confidence: float = 0.0
    error: str | None = None


class ExperimentInterpreter:
    """
    Interprets natural language experiment descriptions using LLM.

    Takes user input (hypothesis, notes, experiment type) and extracts
    structured parameters that can be fed to the existing cloud lab translators.
    """

    def __init__(self, llm_service: LLMService | None = None):
        self.llm_service = llm_service or get_llm_service()

    async def interpret(
        self,
        experiment_type: str,
        title: str,
        hypothesis: str,
        notes: str | None = None,
        existing_intake: dict | None = None,
    ) -> InterpretationResult:
        """
        Interpret an experiment description and extract parameters.

        Args:
            experiment_type: The type of experiment (e.g., QPCR_EXPRESSION)
            title: The experiment title
            hypothesis: The hypothesis statement
            notes: Additional notes from the user
            existing_intake: Existing intake data to enhance (optional)

        Returns:
            InterpretationResult with enriched intake and metadata
        """
        # Build the prompt
        prompt = get_interpretation_prompt(
            experiment_type=experiment_type,
            title=title,
            hypothesis=hypothesis,
            notes=notes,
        )

        try:
            # Call LLM to interpret
            result = await self.llm_service.generate_json(
                prompt=prompt,
                system_prompt=SYSTEM_PROMPT,
                temperature=0.1,
                max_tokens=4096,
            )

            # Extract the results
            suggestions = result.pop("suggestions", [])
            warnings = result.pop("warnings", [])
            confidence = result.pop("confidence", 0.8)

            # Merge with existing intake if provided
            enriched_intake = self._merge_intake(
                existing_intake or {},
                result,
                experiment_type,
                title,
                hypothesis,
            )

            return InterpretationResult(
                success=True,
                enriched_intake=enriched_intake,
                suggestions=suggestions,
                warnings=warnings,
                confidence=confidence,
            )

        except Exception as e:
            return InterpretationResult(
                success=False,
                enriched_intake=existing_intake or {},
                error=str(e),
            )

    def _merge_intake(
        self,
        existing: dict,
        interpreted: dict,
        experiment_type: str,
        title: str,
        hypothesis: str,
    ) -> dict:
        """Merge interpreted data with existing intake."""
        # Start with existing data
        result = dict(existing)

        # Ensure required fields
        result["experiment_type"] = experiment_type
        result["title"] = title

        # Set up hypothesis structure if not present
        if "hypothesis" not in result:
            result["hypothesis"] = {}
        result["hypothesis"]["statement"] = hypothesis

        # Merge experiment-specific section
        field_name = self._get_field_name(experiment_type)
        if field_name in interpreted:
            if field_name not in result:
                result[field_name] = {}
            result[field_name] = self._deep_merge(
                result[field_name],
                interpreted[field_name],
            )

        # Merge replicates
        if "replicates" in interpreted:
            if "replicates" not in result:
                result["replicates"] = {}
            result["replicates"] = self._deep_merge(
                result["replicates"],
                interpreted["replicates"],
            )

        # Merge materials
        if "materials_provided" in interpreted:
            if "materials_provided" not in result:
                result["materials_provided"] = []
            # Convert to proper format if needed
            for material in interpreted["materials_provided"]:
                if isinstance(material, str):
                    result["materials_provided"].append({"name": material})
                else:
                    result["materials_provided"].append(material)

        return result

    def _deep_merge(self, base: dict, updates: dict) -> dict:
        """Deep merge two dictionaries, with updates taking precedence."""
        result = dict(base)
        for key, value in updates.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = value
        return result

    def _get_field_name(self, experiment_type: str) -> str:
        """Map experiment type to its field name."""
        mapping = {
            "SANGER_PLASMID_VERIFICATION": "sanger",
            "QPCR_EXPRESSION": "qpcr",
            "CELL_VIABILITY_IC50": "cell_viability",
            "ENZYME_INHIBITION_IC50": "enzyme_inhibition",
            "MICROBIAL_GROWTH_MATRIX": "microbial_growth",
            "MIC_MBC_ASSAY": "mic_mbc",
            "ZONE_OF_INHIBITION": "zone_of_inhibition",
            "CUSTOM": "custom_protocol",
        }
        return mapping.get(experiment_type, "custom_protocol")


# Singleton instance
_interpreter: ExperimentInterpreter | None = None


def get_experiment_interpreter() -> ExperimentInterpreter:
    """Get or create the experiment interpreter singleton."""
    global _interpreter
    if _interpreter is None:
        _interpreter = ExperimentInterpreter()
    return _interpreter
