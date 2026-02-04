"""
ECL (Emerald Cloud Lab) SLL translator.

Translates Litmus experiment intake specifications to SLL (Symbolic Lab Language) format.
SLL is built on Wolfram Language (Mathematica).
"""

from backend.types import JsonObject, JsonValue

from ..base import CloudLabTranslator, TranslationResult, ValidationIssue
from . import sll_templates as sll


def _as_object(value: JsonValue | None) -> JsonObject:
    if isinstance(value, dict):
        return value
    return {}


def _as_str(value: JsonValue | None, default: str = "") -> str:
    if isinstance(value, str):
        return value
    return default


def _as_int(value: JsonValue | None, default: int) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return default


def _as_int_or_none(value: JsonValue | None) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _as_float(value: JsonValue | None, default: float) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return default


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

    def validate_intake(self, intake: JsonObject) -> list[ValidationIssue]:
        """Validate intake for ECL compatibility."""
        issues = []

        # Check experiment type
        exp_type = _as_str(intake.get("experiment_type"), "")
        if not exp_type:
            issues.append(
                ValidationIssue(
                    path="experiment_type",
                    code="missing_field",
                    message="experiment_type is required",
                    severity="error",
                )
            )
        elif exp_type not in self.EXPERIMENT_TRANSLATORS:
            issues.append(
                ValidationIssue(
                    path="experiment_type",
                    code="unsupported_type",
                    message=f"Experiment type '{exp_type}' is not supported by ECL",
                    severity="error",
                    suggestion=f"Supported types: {', '.join(self.supported_experiment_types())}",
                )
            )

        # Check compliance
        compliance = _as_object(intake.get("compliance"))
        bsl = _as_str(compliance.get("bsl"), "BSL1")
        if bsl not in ["BSL1", "BSL2"]:
            issues.append(
                ValidationIssue(
                    path="compliance.bsl",
                    code="unsupported_bsl",
                    message=f"BSL level '{bsl}' is not supported by ECL",
                    severity="error",
                )
            )

        # ECL has specific requirements for human-derived materials
        if compliance.get("human_derived_material"):
            issues.append(
                ValidationIssue(
                    path="compliance.human_derived_material",
                    code="special_handling",
                    message="Human-derived materials require IRB approval documentation for ECL",
                    severity="warning",
                )
            )

        # Validate experiment-specific fields
        exp_type_lower = self._get_exp_type_field_name(exp_type)
        if exp_type_lower and exp_type_lower not in intake:
            issues.append(
                ValidationIssue(
                    path=exp_type_lower,
                    code="missing_section",
                    message=f"Missing experiment-specific section: {exp_type_lower}",
                    severity="error",
                )
            )

        return issues

    def translate(self, intake: JsonObject) -> TranslationResult:
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
                warnings=[i for i in issues if i.severity == "warning"],
            )

        # Get the appropriate translator method
        exp_type = _as_str(intake.get("experiment_type"), "")
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
                    "title": _as_str(intake.get("title"), "Untitled"),
                    "ecl_function": self._get_ecl_function(exp_type),
                },
            )
        except Exception as e:
            return TranslationResult(
                provider=self.provider_name,
                format=self.protocol_format,
                protocol=None,
                protocol_readable=f"Translation error: {str(e)}",
                success=False,
                errors=[
                    ValidationIssue(
                        path="", code="translation_error", message=str(e), severity="error"
                    )
                ],
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

    def _generate_header(self, intake: JsonObject) -> str:
        """Generate SLL header comment with experiment metadata."""
        title = _as_str(intake.get("title"), "Untitled Experiment")
        exp_type = _as_str(intake.get("experiment_type"), "Unknown")
        hypothesis_section = _as_object(intake.get("hypothesis"))
        hypothesis = _as_str(hypothesis_section.get("statement"), "")

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

    def _translate_sanger(self, intake: JsonObject) -> str:
        """Translate Sanger sequencing experiment to SLL."""
        sanger_data = _as_object(intake.get("sanger"))

        # Get primers
        primers_value = sanger_data.get("primers", [])
        primers = primers_value if isinstance(primers_value, list) else []
        primer_refs = []
        for p in primers:
            if not isinstance(p, dict):
                continue
            if p.get("provided_by") == "operator":
                # Use standard primer names
                primer_name = _as_str(p.get("name"), "")
                primer_refs.append(f'Model[Sample, "StandardPrimer", "{primer_name}"]')
            else:
                # Requester-provided primers - create sample references
                primer_name = _as_str(p.get("name"), f"primer_{len(primer_refs)}")
                primer_refs.append(sll.sample_ref(primer_name))

        # Coverage mapping
        coverage = None
        regions_value = sanger_data.get("regions_of_interest")
        if isinstance(regions_value, list):
            num_regions = len(regions_value)
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
            read_length=_as_int_or_none(sanger_data.get("expected_insert_size_bp")),
            coverage=coverage,
        )

    def _translate_qpcr(self, intake: JsonObject) -> str:
        """Translate qPCR experiment to SLL."""
        qpcr_data = _as_object(intake.get("qpcr"))
        replicates = _as_object(intake.get("replicates"))

        # Get targets and build primer info
        targets_value = qpcr_data.get("targets", [])
        targets = targets_value if isinstance(targets_value, list) else []
        primers: list[JsonObject] = []
        probes: list[JsonObject] = []

        for target in targets:
            if not isinstance(target, dict):
                continue
            primer_seqs = _as_object(target.get("primer_sequences"))
            gene_symbol = _as_str(target.get("gene_symbol"), "target")
            if primer_seqs:
                primer_entry: JsonObject = {
                    "name": gene_symbol,
                    "forward": _as_str(primer_seqs.get("forward"), ""),
                    "reverse": _as_str(primer_seqs.get("reverse"), ""),
                }
                primers.append(primer_entry)
            probe = primer_seqs.get("probe")
            if isinstance(probe, str) and probe:
                probe_entry: JsonObject = {
                    "name": f"{gene_symbol}_probe",
                    "sequence": probe,
                }
                probes.append(probe_entry)

        # Reference genes
        ref_genes_value = qpcr_data.get("housekeeping_genes", [])
        ref_genes = ref_genes_value if isinstance(ref_genes_value, list) else []
        reference_samples = [f"ref_{g}" for g in ref_genes if isinstance(g, str)] or None

        # Build sample list
        num_samples = _as_int(qpcr_data.get("number_of_samples"), 6)
        samples = [sll.sample_ref(f"sample_{i + 1}") for i in range(num_samples)]

        reverse_transcription = _as_str(qpcr_data.get("sample_type"), "cDNA") == "RNA"

        return sll.experiment_qpcr(
            samples=samples,
            primers=primers,
            probes=probes if probes else None,
            reference_samples=reference_samples,
            number_of_replicates=_as_int(replicates.get("technical"), 3),
            reaction_volume=20,  # Standard qPCR volume
            reverse_transcription=reverse_transcription,
        )

    def _translate_cell_viability(self, intake: JsonObject) -> str:
        """Translate cell viability experiment to SLL."""
        cv_data = _as_object(intake.get("cell_viability"))
        replicates = _as_object(intake.get("replicates"))

        cell_line = _as_str(cv_data.get("cell_line"), "HeLa")
        compound_name = _as_str(cv_data.get("compound_name"), "test_compound")
        assay_type = _as_str(cv_data.get("assay_type"), "MTT")
        exposure_hours = _as_int(cv_data.get("exposure_time_hours"), 48)
        dose_range = _as_object(cv_data.get("dose_range"))

        # Build concentration range
        min_conc = _as_float(dose_range.get("min"), 0.01)
        max_conc = _as_float(dose_range.get("max"), 100.0)

        compound_entry: JsonObject = {"name": compound_name}
        compounds = [compound_entry]

        return sll.experiment_cell_viability(
            cells=f"cells_{cell_line}",
            compounds=compounds,
            assay_method=assay_type,
            concentration_range=(min_conc, max_conc),
            incubation_time=exposure_hours,
            plate_format=96
            if _as_str(cv_data.get("plate_format"), "96-well") == "96-well"
            else 384,
            replicates=_as_int(replicates.get("technical"), 3),
        )

    def _translate_enzyme_inhibition(self, intake: JsonObject) -> str:
        """Translate enzyme inhibition experiment to SLL."""
        ei_data = _as_object(intake.get("enzyme_inhibition"))
        replicates = _as_object(intake.get("replicates"))

        enzyme = _as_str(ei_data.get("target_enzyme"), "enzyme")
        substrate = _as_str(ei_data.get("substrate"), "substrate")
        inhibitor_name = _as_str(ei_data.get("inhibitor_name"), "test_inhibitor")
        inhibitor_entry: JsonObject = {"name": inhibitor_name}
        inhibitors = [inhibitor_entry]
        assay_time = _as_int(ei_data.get("incubation_time_minutes"), 30)
        temperature = _as_int(ei_data.get("incubation_temperature_c"), 37)
        wavelength = _as_int(ei_data.get("detection_wavelength_nm"), 405)

        inhibitor_concs_value = ei_data.get("inhibitor_concentrations", [])
        inhibitor_concs = inhibitor_concs_value if isinstance(inhibitor_concs_value, list) else []
        values = []
        for conc in inhibitor_concs:
            if not isinstance(conc, dict):
                continue
            value = conc.get("value")
            if isinstance(value, (int, float)):
                values.append(float(value))
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
            replicates=_as_int(replicates.get("technical"), 3),
        )

    def _translate_microbial_growth(self, intake: JsonObject) -> str:
        """Translate microbial growth curve experiment to SLL."""
        mg_data = _as_object(intake.get("microbial_growth"))
        replicates = _as_object(intake.get("replicates"))

        media = _as_str(mg_data.get("base_medium"), "LB")
        temperature = _as_int(mg_data.get("incubation_temperature_c"), 37)
        duration = _as_int(mg_data.get("incubation_hours"), 24)
        read_schedule_value = mg_data.get("read_schedule", [])
        read_schedule = read_schedule_value if isinstance(read_schedule_value, list) else []
        if (
            len(read_schedule) >= 2
            and isinstance(read_schedule[0], dict)
            and isinstance(read_schedule[1], dict)
        ):
            first_time = _as_float(read_schedule[0].get("time_hours"), -1.0)
            second_time = _as_float(read_schedule[1].get("time_hours"), -1.0)
            if first_time >= 0 and second_time >= 0:
                read_interval = (second_time - first_time) * 60
            else:
                read_interval = 30
        else:
            read_interval = 30
        shaking = _as_str(mg_data.get("aeration"), "shaking") == "shaking"

        # Build sample list from condition_matrix
        conditions_value = mg_data.get("condition_matrix", [])
        conditions = conditions_value if isinstance(conditions_value, list) else []
        samples = []
        if conditions:
            for i, cond in enumerate(conditions):
                if isinstance(cond, dict):
                    variable = _as_str(cond.get("variable")) or str(i + 1)
                else:
                    variable = str(i + 1)
                samples.append(f"culture_{variable}")
        else:
            num_samples = _as_int(replicates.get("biological"), 3)
            samples = [f"culture_{i + 1}" for i in range(num_samples)]

        return sll.experiment_growth_curve(
            samples=samples,
            media=media,
            temperature=temperature,
            duration=duration,
            read_interval=read_interval,
            shaking=shaking,
        )

    def _translate_mic_mbc(self, intake: JsonObject) -> str:
        """Translate MIC/MBC assay to SLL."""
        mic_data = _as_object(intake.get("mic_mbc"))

        organism = _as_str(mic_data.get("organism"), "E. coli")
        compound_name = _as_str(mic_data.get("compound_name"), "test_compound")
        antibiotic_entry: JsonObject = {"name": compound_name}
        antibiotics = [antibiotic_entry]

        method_map = {
            "broth_microdilution": "BrothMicrodilution",
            "broth_macrodilution": "BrothMicrodilution",
            "agar_dilution": "AgarDilution",
        }
        method = method_map.get(
            _as_str(mic_data.get("method"), "broth_microdilution"), "BrothMicrodilution"
        )
        dilution_factor = 2  # Standard 2-fold dilution
        num_dilutions = 8
        incubation_hours = _as_int(mic_data.get("incubation_hours"), 18)

        return sll.experiment_antibiotic_susceptibility(
            organisms=[organism],
            antibiotics=antibiotics,
            method=method,
            dilution_factor=dilution_factor,
            num_dilutions=num_dilutions,
            incubation_time=incubation_hours,
        )

    def _translate_zone_of_inhibition(self, intake: JsonObject) -> str:
        """Translate zone of inhibition assay to SLL."""
        zoi_data = _as_object(intake.get("zone_of_inhibition"))

        organism = _as_str(zoi_data.get("organism"), "E. coli")
        compound_name = _as_str(zoi_data.get("compound_name"), "test_compound")
        compound_entry: JsonObject = {"name": compound_name}
        compounds = [compound_entry]

        agar_type = _as_str(zoi_data.get("medium"), "Mueller-Hinton")
        incubation_hours = _as_int(zoi_data.get("incubation_hours"), 18)

        return sll.experiment_disk_diffusion(
            organisms=[organism],
            compounds=compounds,
            agar_type=agar_type,
            incubation_time=incubation_hours,
        )

    def _translate_custom(self, intake: JsonObject) -> str:
        """Translate custom protocol to SLL."""
        custom_data = _as_object(intake.get("custom_protocol"))

        name = _as_str(custom_data.get("protocol_title"))
        if not name:
            name = _as_str(intake.get("title"), "Custom Protocol")
        description = _as_str(custom_data.get("brief_description"), "No description provided")
        steps_raw_value = custom_data.get("steps", [])
        steps_raw = steps_raw_value if isinstance(steps_raw_value, list) else []
        steps: list[JsonObject] = []
        for i, step in enumerate(steps_raw):
            if isinstance(step, dict):
                step_name = f"Step {step.get('step_number', i + 1)}"
                description = _as_str(step.get("action"), "No description")
            else:
                step_name = f"Step {i + 1}"
                description = "No description"
            step_entry: JsonObject = {
                "name": step_name,
                "description": description,
            }
            steps.append(step_entry)

        return sll.custom_protocol(name=name, description=description, steps=steps)
