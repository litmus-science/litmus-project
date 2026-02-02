"""
Edison Scientific Integration.

Uses Edison's AI research platform for hypothesis generation and literature search,
then feeds the enriched context into the Litmus experiment translation pipeline.

Workflow:
1. User provides a research question/query
2. Edison analyzes literature, molecules, or datasets
3. Edison's insights are used to generate a well-formed hypothesis
4. The hypothesis is fed to Litmus for cloud lab protocol generation
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from backend.types import JsonObject, JsonValue

from .edison_client import EdisonClient, EdisonJobType, get_edison_client
from .edison_types import EdisonTaskResponse
from .experiment_types import get_experiment_field_name
from .llm_service import LLMService, get_llm_service

# Import cloud_labs registry - handle both package and direct execution
if TYPE_CHECKING:
    from backend.cloud_labs.registry import translate_intake as do_translate_intake
else:
    try:
        from backend.cloud_labs.registry import translate_intake as do_translate_intake
    except ImportError:
        from cloud_labs.registry import translate_intake as do_translate_intake


@dataclass
class EdisonToLitmusResult:
    """Result of the Edison-to-Litmus pipeline."""

    success: bool
    # Edison phase
    edison_response: EdisonTaskResponse | None = None
    edison_insights: str | None = None
    # Hypothesis generation phase
    hypothesis: str | None = None
    null_hypothesis: str | None = None
    experiment_type: str = "CUSTOM"
    title: str | None = None
    # Litmus intake
    intake: JsonObject = field(default_factory=dict)
    # Cloud lab translations
    translations: dict[str, JsonObject] | None = None
    # Metadata
    suggestions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    error: str | None = None


def _as_str(value: JsonValue | None, default: str | None = None) -> str | None:
    if isinstance(value, str):
        return value
    return default


def _as_str_list(value: JsonValue | None) -> list[str]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []


HYPOTHESIS_GENERATION_PROMPT = (
    "You are a scientific hypothesis generator. Given research insights from\n"
    "Edison Scientific, generate a well-formed testable hypothesis suitable for wet lab "
    "validation.\n\n"
    "## Edison Research Insights\n\n"
    "{edison_insights}\n\n"
    "## User's Original Query\n\n"
    "{query}\n\n"
    "## Instructions\n\n"
    "Based on the Edison research insights and user query, generate:\n\n"
    "1. A testable hypothesis statement that can be validated in a wet lab\n"
    "2. A corresponding null hypothesis\n"
    "3. The most appropriate experiment type for testing this hypothesis\n"
    "4. A descriptive title for the experiment\n"
    "5. Key experimental parameters that should be tested\n\n"
    "## Available Experiment Types\n\n"
    "- SANGER_PLASMID_VERIFICATION: DNA sequencing verification\n"
    "- QPCR_EXPRESSION: Gene expression analysis\n"
    "- CELL_VIABILITY_IC50: Cell viability and IC50 determination\n"
    "- ENZYME_INHIBITION_IC50: Enzyme inhibition assays\n"
    "- MICROBIAL_GROWTH_MATRIX: Bacterial/yeast growth curves\n"
    "- MIC_MBC_ASSAY: Antibiotic susceptibility testing\n"
    "- ZONE_OF_INHIBITION: Disk diffusion assays\n"
    "- CUSTOM: Custom multi-step protocols\n\n"
    "## Output Format\n\n"
    "Return a JSON object:\n"
    "```json\n"
    "{{\n"
    '  "hypothesis": "Testable hypothesis statement",\n'
    '  "null_hypothesis": "Corresponding null hypothesis",\n'
    '  "experiment_type": "EXPERIMENT_TYPE_ENUM",\n'
    '  "title": "Descriptive experiment title",\n'
    '  "experimental_parameters": {{\n'
    "    // Key parameters extracted from the research\n"
    "  }},\n"
    '  "materials_needed": [\n'
    '    {{"name": "...", "identifier": "CAS/SMILES/etc", "notes": "..."}}\n'
    "  ],\n"
    '  "suggested_protocol": "Brief description of recommended approach",\n'
    '  "confidence": 0.85,\n'
    '  "suggestions": ["..."],\n'
    '  "warnings": ["..."]\n'
    "}}\n"
    "```\n"
)


class EdisonLitmusIntegration:
    """
    Integrates Edison Scientific with Litmus experiment translation.

    Flow:
    1. Query Edison for research insights (literature, molecules, precedent)
    2. Use LLM to generate a testable hypothesis from Edison's output
    3. Create a Litmus intake specification
    4. Translate to cloud lab protocols (ECL, Strateos)
    """

    def __init__(
        self,
        edison_client: EdisonClient | None = None,
        llm_service: LLMService | None = None,
    ):
        self.edison = edison_client or get_edison_client()
        self.llm = llm_service or get_llm_service()

    async def research_and_translate(
        self,
        query: str,
        job_type: EdisonJobType | str = EdisonJobType.MOLECULES,
        additional_context: str | None = None,
        translate_to_cloud_labs: bool = True,
    ) -> EdisonToLitmusResult:
        """
        Full pipeline: Edison research → Hypothesis → Litmus → Cloud Labs.

        Args:
            query: Research question or scientific query
            job_type: Edison job type for initial research
            additional_context: Extra context to include
            translate_to_cloud_labs: Whether to generate cloud lab protocols

        Returns:
            EdisonToLitmusResult with all outputs from the pipeline
        """
        if isinstance(job_type, str):
            try:
                job_type = EdisonJobType(job_type)
            except ValueError:
                return EdisonToLitmusResult(
                    success=False,
                    experiment_type="CUSTOM",
                    intake={},
                    error=f"Unsupported Edison job_type: {job_type}",
                )
        try:
            # Step 1: Query Edison for research insights
            edison_response = await self.edison.run_task_until_done(
                query=query,
                job_type=job_type,
            )

            if not edison_response.success:
                return EdisonToLitmusResult(
                    success=False,
                    edison_response=edison_response,
                    error=edison_response.error or "Edison query failed",
                )

            edison_insights = edison_response.formatted_answer or edison_response.answer
            if edison_insights is None:
                return EdisonToLitmusResult(
                    success=False,
                    edison_response=edison_response,
                    error="Edison response did not include insights",
                )

            # Step 2: Generate hypothesis from Edison insights
            hypothesis_result = await self._generate_hypothesis(
                query=query,
                edison_insights=edison_insights,
                additional_context=additional_context,
            )

            hypothesis_text = _as_str(hypothesis_result.get("hypothesis"))
            if not hypothesis_text:
                return EdisonToLitmusResult(
                    success=False,
                    edison_response=edison_response,
                    edison_insights=edison_insights,
                    error="Failed to generate hypothesis from Edison insights",
                )

            # Step 3: Build Litmus intake
            intake = self._build_intake(hypothesis_result, query)

            experiment_type_value = hypothesis_result.get("experiment_type")
            experiment_type = _as_str(experiment_type_value, "CUSTOM") or "CUSTOM"

            result = EdisonToLitmusResult(
                success=True,
                edison_response=edison_response,
                edison_insights=edison_insights,
                hypothesis=hypothesis_text,
                null_hypothesis=_as_str(hypothesis_result.get("null_hypothesis")),
                experiment_type=experiment_type,
                title=_as_str(hypothesis_result.get("title")),
                intake=intake,
                suggestions=_as_str_list(hypothesis_result.get("suggestions")),
                warnings=_as_str_list(hypothesis_result.get("warnings")),
            )

            # Step 4: Translate to cloud lab protocols
            if translate_to_cloud_labs:
                try:
                    translations = do_translate_intake(intake)
                    result.translations = {
                        provider: {
                            "provider": t.provider,
                            "format": t.format,
                            "protocol_readable": t.protocol_readable,
                            "success": t.success,
                            "errors": [{"message": e.message} for e in t.errors],
                            "warnings": [{"message": w.message} for w in t.warnings],
                        }
                        for provider, t in translations.items()
                    }
                except Exception as e:
                    result.warnings.append(f"Cloud lab translation failed: {str(e)}")

            return result

        except Exception as e:
            return EdisonToLitmusResult(
                success=False,
                error=str(e),
            )

    async def research_only(
        self,
        query: str,
        job_type: EdisonJobType = EdisonJobType.LITERATURE,
    ) -> EdisonTaskResponse:
        """
        Run Edison research without hypothesis generation or translation.

        Useful for pure literature search or molecule analysis.
        """
        return await self.edison.run_task_until_done(query, job_type)

    async def generate_hypothesis_from_insights(
        self,
        query: str,
        edison_insights: str,
        additional_context: str | None = None,
    ) -> JsonObject:
        """
        Generate a hypothesis from pre-existing Edison insights.

        Useful when you already have Edison results and want to
        generate a hypothesis without re-querying.
        """
        return await self._generate_hypothesis(query, edison_insights, additional_context)

    async def translate_from_insights(
        self,
        query: str,
        edison_insights: str,
        additional_context: str | None = None,
        translate_to_cloud_labs: bool = True,
    ) -> EdisonToLitmusResult:
        """
        Generate hypothesis and translations from pre-existing Edison insights.

        Useful for resuming Edison runs without re-querying Edison.
        """
        try:
            hypothesis_result = await self.generate_hypothesis_from_insights(
                query=query,
                edison_insights=edison_insights,
                additional_context=additional_context,
            )

            hypothesis_text = _as_str(hypothesis_result.get("hypothesis"))
            if not hypothesis_text:
                return EdisonToLitmusResult(
                    success=False,
                    edison_insights=edison_insights,
                    error=_as_str(hypothesis_result.get("error"))
                    or "Failed to generate hypothesis",
                )

            intake = self._build_intake(hypothesis_result, query)

            experiment_type_value = hypothesis_result.get("experiment_type")
            experiment_type = _as_str(experiment_type_value, "CUSTOM") or "CUSTOM"

            result = EdisonToLitmusResult(
                success=True,
                edison_insights=edison_insights,
                hypothesis=hypothesis_text,
                null_hypothesis=_as_str(hypothesis_result.get("null_hypothesis")),
                experiment_type=experiment_type,
                title=_as_str(hypothesis_result.get("title")),
                intake=intake,
                suggestions=_as_str_list(hypothesis_result.get("suggestions")),
                warnings=_as_str_list(hypothesis_result.get("warnings")),
            )

            if translate_to_cloud_labs:
                try:
                    translations = do_translate_intake(intake)
                    result.translations = {
                        provider: {
                            "provider": t.provider,
                            "format": t.format,
                            "protocol_readable": t.protocol_readable,
                            "success": t.success,
                            "errors": [{"message": e.message} for e in t.errors],
                            "warnings": [{"message": w.message} for w in t.warnings],
                        }
                        for provider, t in translations.items()
                    }
                except Exception as e:
                    result.warnings.append(f"Cloud lab translation failed: {str(e)}")

            return result
        except Exception as e:
            return EdisonToLitmusResult(
                success=False,
                error=str(e),
            )

    async def _generate_hypothesis(
        self,
        query: str,
        edison_insights: str,
        additional_context: str | None = None,
    ) -> JsonObject:
        """Use LLM to generate a hypothesis from Edison insights."""
        prompt = HYPOTHESIS_GENERATION_PROMPT.format(
            edison_insights=edison_insights,
            query=query,
        )

        if additional_context:
            prompt += f"\n\n## Additional Context\n\n{additional_context}"

        try:
            result = await self.llm.generate_json(
                prompt=prompt,
                temperature=0.2,
                max_tokens=2048,
            )
            return result
        except Exception as e:
            return {"error": str(e)}

    def _build_intake(self, hypothesis_result: JsonObject, original_query: str) -> JsonObject:
        """Build a Litmus intake specification from hypothesis generation results."""
        experiment_type_value = hypothesis_result.get("experiment_type")
        experiment_type = (
            experiment_type_value if isinstance(experiment_type_value, str) else "CUSTOM"
        )
        field_name = get_experiment_field_name(experiment_type)

        title_value = hypothesis_result.get("title")
        title = title_value if isinstance(title_value, str) else "Experiment from Edison query"
        hypothesis_value = hypothesis_result.get("hypothesis")
        hypothesis = hypothesis_value if isinstance(hypothesis_value, str) else ""
        null_hypothesis_value = hypothesis_result.get("null_hypothesis")
        null_hypothesis = null_hypothesis_value if isinstance(null_hypothesis_value, str) else ""

        materials_value = hypothesis_result.get("materials_needed")
        materials: list[JsonObject] = []
        if isinstance(materials_value, list):
            for item in materials_value:
                if isinstance(item, dict):
                    materials.append(item)
                elif isinstance(item, str):
                    materials.append({"name": item})

        params_value = hypothesis_result.get("experimental_parameters")
        params: JsonObject = params_value if isinstance(params_value, dict) else {}

        materials_payload: list[JsonValue] = list(materials)
        intake: JsonObject = {
            "experiment_type": experiment_type,
            "title": title,
            "hypothesis": {
                "statement": hypothesis,
                "null_hypothesis": null_hypothesis,
            },
            "compliance": {
                "bsl": "BSL1",
                "human_derived_material": False,
                "animal_derived_material": False,
                "hazardous_chemicals": self._check_hazardous(hypothesis_result),
            },
            "replicates": {
                "technical": 3,
                "biological": 1,
            },
            "materials_provided": materials_payload,
            "metadata": {
                "source": "edison_integration",
                "original_query": original_query,
                "suggested_protocol": hypothesis_result.get("suggested_protocol"),
                "confidence": hypothesis_result.get("confidence"),
            },
        }

        # Add experiment-specific section
        if experiment_type == "CUSTOM":
            intake["custom_protocol"] = {
                "description": hypothesis_result.get("suggested_protocol", ""),
                **params,
            }
        else:
            intake[field_name] = params

        return intake

    def _check_hazardous(self, result: JsonObject) -> bool:
        """Check if materials include hazardous chemicals."""
        materials_value = result.get("materials_needed")
        materials = materials_value if isinstance(materials_value, list) else []
        hazardous_keywords = [
            "acid",
            "base",
            "toxic",
            "corrosive",
            "flammable",
            "oxidizer",
            "carcinogen",
            "mutagen",
            "teratogen",
            "chromium",
            "cyanide",
            "azide",
        ]
        for material in materials:
            if not isinstance(material, dict):
                continue
            name_value = material.get("name")
            notes_value = material.get("notes")
            name = str(name_value or "").lower()
            notes = str(notes_value or "").lower()
            if any(kw in name or kw in notes for kw in hazardous_keywords):
                return True
        return False


# Singleton
_integration: EdisonLitmusIntegration | None = None


def get_edison_litmus_integration() -> EdisonLitmusIntegration:
    """Get or create the Edison-Litmus integration singleton."""
    global _integration
    if _integration is None:
        _integration = EdisonLitmusIntegration()
    return _integration
