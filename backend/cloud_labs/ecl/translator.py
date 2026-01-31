"""
ECL (Emerald Cloud Lab) SLL translator.

Translates Litmus experiment intake specifications to SLL (Symbolic Lab Language) format.
SLL is built on Wolfram Language (Mathematica).
"""

from typing import Any

from ..base import CloudLabTranslator, TranslationResult, ValidationIssue
from . import sll_templates as sll


class ECLTranslator(CloudLabTranslator):
    """Translator for ECL Symbolic Lab Language format."""

    # Mapping of Litmus experiment types to translation methods
    EXPERIMENT_TRANSLATORS = {
        "SANGER_PLASMID_VERIFICATION": "_translate_sanger",
        "QPCR_EXPRESSION": "_translate_qpcr",
        "CELL_VIABILITY_IC50": "_translate_cell_viability",
        "ENZYME_INHIBITION_IC50": "_translate_enzyme_inhibition",
        "MICROBIAL_GROWTH_MATRIX": "_translate_microbial_growth",
        "MIC_MBC_ASSAY": "_translate_mic_mbc",
        "ZONE_OF_INHIBITION": "_translate_zone_of_inhibition",
        "CUSTOM": "_translate_custom",
    }

    @property
    def provider_name(self) -> str:
        return "ecl"

    @property
    def protocol_format(self) -> str:
        return "sll"

    def supported_experiment_types(self) -> list[str]:
        return list(self.EXPERIMENT_TRANSLATORS.keys())

    def validate_intake(self, intake: dict) -> list[ValidationIssue]:
        """Validate intake for ECL compatibility."""
        issues = []

        # Check experiment type
        exp_type = intake.get("experiment_type", "")
        if not exp_type:
            issues.append(ValidationIssue(
                path="experiment_type",
                code="missing_field",
                message="experiment_type is required",
                severity="error"
            ))
        elif exp_type not in self.EXPERIMENT_TRANSLATORS:
            issues.append(ValidationIssue(
                path="experiment_type",
                code="unsupported_type",
                message=f"Experiment type '{exp_type}' is not supported by ECL",
                severity="error",
                suggestion=f"Supported types: {', '.join(self.supported_experiment_types())}"
            ))

        # Check compliance
        compliance = intake.get("compliance", {})
        bsl = compliance.get("bsl", "BSL1")
        if bsl not in ["BSL1", "BSL2"]:
            issues.append(ValidationIssue(
                path="compliance.bsl",
                code="unsupported_bsl",
                message=f"BSL level '{bsl}' is not supported by ECL",
                severity="error"
            ))

        # ECL has specific requirements for human-derived materials
        if compliance.get("human_derived_material"):
            issues.append(ValidationIssue(
                path="compliance.human_derived_material",
                code="special_handling",
                message="Human-derived materials require IRB approval documentation for ECL",
                severity="warning"
            ))

        # Validate experiment-specific fields
        exp_type_lower = self._get_exp_type_field_name(exp_type)
        if exp_type_lower and exp_type_lower not in intake:
            issues.append(ValidationIssue(
                path=exp_type_lower,
                code="missing_section",
                message=f"Missing experiment-specific section: {exp_type_lower}",
                severity="error"
            ))

        return issues

    def translate(self, intake: dict) -> TranslationResult:
        """Translate Litmus intake to SLL."""
        # Validate first
        issues = self.validate_intake(intake)
        errors = [i for i in issues if i.severity == "error"]

        if errors:
            return TranslationResult(
                provider=self.provider_name,
                format=self.protocol_format,
                protocol=None,
                protocol_readable="Translation failed due to validation errors",
                success=False,
                errors=errors,
                warnings=[i for i in issues if i.severity == "warning"]
            )

        # Get the appropriate translator method
        exp_type = intake["experiment_type"]
        translator_method = getattr(self, self.EXPERIMENT_TRANSLATORS[exp_type])

        try:
            sll_code = translator_method(intake)

            # Add header comment with metadata
            header = self._generate_header(intake)
            full_protocol = header + "\n\n" + sll_code

            return TranslationResult(
                provider=self.provider_name,
                format=self.protocol_format,
                protocol=full_protocol,
                protocol_readable=full_protocol,
                success=True,
                warnings=[i for i in issues if i.severity == "warning"],
                metadata={
                    "experiment_type": exp_type,
                    "title": intake.get("title", "Untitled"),
                    "ecl_function": self._get_ecl_function(exp_type),
                }
            )
        except Exception as e:
            return TranslationResult(
                provider=self.provider_name,
                format=self.protocol_format,
                protocol=None,
                protocol_readable=f"Translation error: {str(e)}",
                success=False,
                errors=[ValidationIssue(
                    path="",
                    code="translation_error",
                    message=str(e),
                    severity="error"
                )]
            )

    def _get_exp_type_field_name(self, exp_type: str) -> str | None:
        """Map experiment type to its field name in intake."""
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
        return mapping.get(exp_type)

    def _get_ecl_function(self, exp_type: str) -> str:
        """Get the ECL function name for an experiment type."""
        mapping = {
            "SANGER_PLASMID_VERIFICATION": "ExperimentSequencing",
            "QPCR_EXPRESSION": "ExperimentqPCR",
            "CELL_VIABILITY_IC50": "ExperimentCellViability",
            "ENZYME_INHIBITION_IC50": "ExperimentEnzymeActivity",
            "MICROBIAL_GROWTH_MATRIX": "ExperimentGrowthCurve",
            "MIC_MBC_ASSAY": "ExperimentAntibioticSusceptibility",
            "ZONE_OF_INHIBITION": "ExperimentDiskDiffusion",
            "CUSTOM": "CustomProtocol",
        }
        return mapping.get(exp_type, "Unknown")

    def _generate_header(self, intake: dict) -> str:
        """Generate SLL header comment with experiment metadata."""
        title = intake.get("title", "Untitled Experiment")
        exp_type = intake.get("experiment_type", "Unknown")
        hypothesis = intake.get("hypothesis", {}).get("statement", "")

        lines = [
            "(* =================================================== *)",
            f"(* Experiment: {title} *)",
            f"(* Type: {exp_type} *)",
            "(* Generated by: Litmus Science Platform *)",
            "(* =================================================== *)",
            "",
            f"(* Hypothesis: {hypothesis[:100]}{'...' if len(hypothesis) > 100 else ''} *)",
            "",
        ]
        return "\n".join(lines)

    def _translate_sanger(self, intake: dict) -> str:
        """Translate Sanger sequencing experiment to SLL."""
        sanger_data = intake.get("sanger", {})
        replicates = intake.get("replicates", {})

        # Get primers
        primers = sanger_data.get("primers", [])
        primer_refs = []
        for p in primers:
            if p.get("provided_by") == "operator":
                # Use standard primer names
                primer_refs.append(f'Model[Sample, "StandardPrimer", "{p.get("name", "")}"]')
            else:
                # Requester-provided primers - create sample references
                primer_refs.append(sll.sample_ref(p.get("name", f"primer_{len(primer_refs)}")))

        # Coverage mapping
        coverage = None
        if sanger_data.get("regions_of_interest"):
            num_regions = len(sanger_data["regions_of_interest"])
            if num_regions > 2:
                coverage = "tiled"
            elif num_regions == 2:
                coverage = "double_end"
            else:
                coverage = "single_end"

        # Build sample references (assuming sample will be registered in ECL)
        samples = [sll.sample_ref("sample_plasmid")]

        return sll.experiment_sequencing(
            samples=samples,
            primers=primer_refs if primer_refs else None,
            method="Sanger",
            read_length=sanger_data.get("expected_insert_size_bp"),
            coverage=coverage
        )

    def _translate_qpcr(self, intake: dict) -> str:
        """Translate qPCR experiment to SLL."""
        qpcr_data = intake.get("qpcr", {})
        replicates = intake.get("replicates", {})

        # Get targets and build primer info
        targets = qpcr_data.get("targets", [])
        primers = []
        probes = []

        for target in targets:
            primer_seqs = target.get("primer_sequences", {})
            if primer_seqs:
                primers.append({
                    "name": target.get("gene_symbol", "target"),
                    "forward": primer_seqs.get("forward", ""),
                    "reverse": primer_seqs.get("reverse", ""),
                })
            probe = primer_seqs.get("probe")
            if probe:
                probes.append({
                    "name": f"{target.get('gene_symbol', 'target')}_probe",
                    "sequence": probe,
                })

        # Reference genes
        ref_genes = qpcr_data.get("housekeeping_genes", [])
        reference_samples = [f"ref_{g}" for g in ref_genes] if ref_genes else None

        # Build sample list
        num_samples = qpcr_data.get("number_of_samples", 6)
        samples = [sll.sample_ref(f"sample_{i+1}") for i in range(num_samples)]

        # Check chemistry type
        chemistry = qpcr_data.get("chemistry", "SYBR_GREEN")
        reverse_transcription = qpcr_data.get("sample_type", "cDNA") == "RNA"

        return sll.experiment_qpcr(
            samples=samples,
            primers=primers,
            probes=probes if probes else None,
            reference_samples=reference_samples,
            number_of_replicates=replicates.get("technical", 3),
            reaction_volume=20,  # Standard qPCR volume
            reverse_transcription=reverse_transcription
        )

    def _translate_cell_viability(self, intake: dict) -> str:
        """Translate cell viability experiment to SLL."""
        cv_data = intake.get("cell_viability", {})
        replicates = intake.get("replicates", {})

        cell_line = cv_data.get("cell_line", "HeLa")
        compound_name = cv_data.get("compound_name", "test_compound")
        assay_type = cv_data.get("assay_type", "MTT")
        exposure_hours = cv_data.get("exposure_time_hours", 48)
        dose_range = cv_data.get("dose_range", {})

        # Build concentration range
        min_conc = dose_range.get("min", 0.01)
        max_conc = dose_range.get("max", 100)

        compounds = [{"name": compound_name}]

        return sll.experiment_cell_viability(
            cells=f"cells_{cell_line}",
            compounds=compounds,
            assay_method=assay_type,
            concentration_range=(min_conc, max_conc),
            incubation_time=exposure_hours,
            plate_format=96 if cv_data.get("plate_format") == "96-well" else 384,
            replicates=replicates.get("technical", 3)
        )

    def _translate_enzyme_inhibition(self, intake: dict) -> str:
        """Translate enzyme inhibition experiment to SLL."""
        ei_data = intake.get("enzyme_inhibition", {})
        replicates = intake.get("replicates", {})

        enzyme = ei_data.get("target_enzyme", "enzyme")
        substrate = ei_data.get("substrate", "substrate")
        inhibitor_name = ei_data.get("inhibitor_name", "test_inhibitor")
        inhibitors = [{"name": inhibitor_name}]
        assay_time = ei_data.get("incubation_time_minutes", 30)
        temperature = ei_data.get("incubation_temperature_c", 37)
        wavelength = ei_data.get("detection_wavelength_nm", 405)

        inhibitor_concs = ei_data.get("inhibitor_concentrations", [])
        values = [c.get("value") for c in inhibitor_concs if c.get("value") is not None]
        if values:
            min_conc = min(values)
            max_conc = max(values)
        else:
            min_conc = 0.01
            max_conc = 100

        return sll.experiment_enzyme_activity(
            enzyme=enzyme,
            substrate=substrate,
            inhibitors=inhibitors,
            concentration_range=(min_conc, max_conc),
            assay_time=assay_time,
            temperature=temperature,
            detection_wavelength=wavelength,
            replicates=replicates.get("technical", 3)
        )

    def _translate_microbial_growth(self, intake: dict) -> str:
        """Translate microbial growth curve experiment to SLL."""
        mg_data = intake.get("microbial_growth", {})
        replicates = intake.get("replicates", {})

        organism = mg_data.get("organism", "E. coli")
        media = mg_data.get("base_medium", "LB")
        temperature = mg_data.get("incubation_temperature_c", 37)
        duration = mg_data.get("incubation_hours", 24)
        read_schedule = mg_data.get("read_schedule", [])
        if len(read_schedule) >= 2 and read_schedule[0].get("time_hours") is not None and read_schedule[1].get("time_hours") is not None:
            read_interval = (read_schedule[1]["time_hours"] - read_schedule[0]["time_hours"]) * 60
        else:
            read_interval = 30
        shaking = mg_data.get("aeration", "shaking") == "shaking"

        # Build sample list from condition_matrix
        conditions = mg_data.get("condition_matrix", [])
        samples = []
        if conditions:
            for i, cond in enumerate(conditions):
                samples.append(f"culture_{cond.get('variable', i+1)}")
        else:
            num_samples = replicates.get("biological", 3)
            samples = [f"culture_{i+1}" for i in range(num_samples)]

        return sll.experiment_growth_curve(
            samples=samples,
            media=media,
            temperature=temperature,
            duration=duration,
            read_interval=read_interval,
            shaking=shaking
        )

    def _translate_mic_mbc(self, intake: dict) -> str:
        """Translate MIC/MBC assay to SLL."""
        mic_data = intake.get("mic_mbc", {})

        organism = mic_data.get("organism", "E. coli")
        compound_name = mic_data.get("compound_name", "test_compound")
        antibiotics = [{"name": compound_name}]

        method_map = {
            "broth_microdilution": "BrothMicrodilution",
            "broth_macrodilution": "BrothMicrodilution",
            "agar_dilution": "AgarDilution",
        }
        method = method_map.get(mic_data.get("method", "broth_microdilution"), "BrothMicrodilution")
        dilution_factor = 2  # Standard 2-fold dilution
        num_dilutions = 8
        incubation_hours = mic_data.get("incubation_hours", 18)

        return sll.experiment_antibiotic_susceptibility(
            organisms=[organism],
            antibiotics=antibiotics,
            method=method,
            dilution_factor=dilution_factor,
            num_dilutions=num_dilutions,
            incubation_time=incubation_hours
        )

    def _translate_zone_of_inhibition(self, intake: dict) -> str:
        """Translate zone of inhibition assay to SLL."""
        zoi_data = intake.get("zone_of_inhibition", {})

        organism = zoi_data.get("organism", "E. coli")
        compound_name = zoi_data.get("compound_name", "test_compound")
        compounds = [{"name": compound_name}]

        agar_type = zoi_data.get("medium", "Mueller-Hinton")
        incubation_hours = zoi_data.get("incubation_hours", 18)

        return sll.experiment_disk_diffusion(
            organisms=[organism],
            compounds=compounds,
            agar_type=agar_type,
            incubation_time=incubation_hours
        )

    def _translate_custom(self, intake: dict) -> str:
        """Translate custom protocol to SLL."""
        custom_data = intake.get("custom_protocol", {})

        name = custom_data.get("protocol_title", intake.get("title", "Custom Protocol"))
        description = custom_data.get("brief_description", "No description provided")
        steps_raw = custom_data.get("steps", [])
        steps = [
            {
                "name": f"Step {s.get('step_number', i+1)}",
                "description": s.get("action", "No description"),
            }
            for i, s in enumerate(steps_raw)
        ]

        return sll.custom_protocol(
            name=name,
            description=description,
            steps=steps
        )
