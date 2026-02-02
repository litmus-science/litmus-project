"""
Strateos Autoprotocol translator.

Translates Litmus experiment intake specifications to Autoprotocol JSON format.
"""

import json
from typing import cast

from backend.types import JsonObject, JsonValue

from ..base import CloudLabTranslator, TranslationResult, ValidationIssue
from . import instructions as instr


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


def _as_float(value: JsonValue | None, default: float) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return default


class StrateosTranslator(CloudLabTranslator):
    """Translator for Strateos Autoprotocol format."""

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
        return "strateos"

    @property
    def protocol_format(self) -> str:
        return "autoprotocol"

    def supported_experiment_types(self) -> list[str]:
        return list(self.EXPERIMENT_TRANSLATORS.keys())

    def validate_intake(self, intake: JsonObject) -> list[ValidationIssue]:
        """Validate intake for Strateos compatibility."""
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
                    message=f"Experiment type '{exp_type}' is not supported by Strateos",
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
                    message=f"BSL level '{bsl}' is not supported",
                    severity="error",
                )
            )

        # Check for human/animal materials (may require special handling)
        if compliance.get("human_derived_material"):
            issues.append(
                ValidationIssue(
                    path="compliance.human_derived_material",
                    code="special_handling",
                    message="Human-derived materials require special approval from Strateos",
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
        """Translate Litmus intake to Autoprotocol."""
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
            protocol = translator_method(intake)
            readable = json.dumps(protocol, indent=2)

            return TranslationResult(
                provider=self.provider_name,
                format=self.protocol_format,
                protocol=protocol,
                protocol_readable=readable,
                success=True,
                warnings=[i for i in issues if i.severity == "warning"],
                metadata={
                    "experiment_type": exp_type,
                    "title": _as_str(intake.get("title"), "Untitled"),
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

    def _translate_sanger(self, intake: JsonObject) -> JsonObject:
        """Translate Sanger sequencing experiment."""
        sanger = _as_object(intake.get("sanger"))
        replicates = _as_object(intake.get("replicates"))
        tech_reps = _as_int(replicates.get("technical"), 1)

        # Create refs
        refs = {
            "sample_plate": instr.ref("96-pcr", storage="cold_4"),
        }

        # Add primer plate if requester provides primers
        primers_value = sanger.get("primers", [])
        primers = primers_value if isinstance(primers_value, list) else []
        requester_primers = [
            p for p in primers if isinstance(p, dict) and p.get("provided_by") == "requester"
        ]
        if requester_primers:
            refs["primer_plate"] = instr.ref("96-pcr", storage="cold_4")

        instructions = []

        # Prepare wells list - one well per primer per replicate
        wells_to_sequence = []
        well_idx = 0
        for primer in primers:
            if not isinstance(primer, dict):
                continue
            for rep in range(tech_reps):
                well = instr.column_wells(1)[well_idx % 8]  # Use column 1, wrap around
                wells_to_sequence.append(well)
                well_idx += 1

        # Sanger sequencing instruction
        instructions.append(
            instr.sangerseq(
                container="sample_plate",
                wells=wells_to_sequence[:8],  # Limit to 8 wells for standard plate
                dataref="sanger_data",
                type_="standard",
            )
        )

        return cast(
            JsonObject,
            {
                "refs": refs,
                "instructions": instructions,
                "outs": {"sanger_data": {"upload": {"format": "ab1", "urls": True}}},
            },
        )

    def _translate_qpcr(self, intake: JsonObject) -> JsonObject:
        """Translate qPCR experiment."""
        qpcr = _as_object(intake.get("qpcr"))
        chemistry = _as_str(qpcr.get("chemistry"), "SYBR_GREEN")

        # Create refs
        refs = {
            "qpcr_plate": instr.ref("96-pcr", discard=True),
            "sample_plate": instr.existing_ref("__SAMPLE_PLATE_ID__", discard=False),
        }

        instructions = []

        # Seal plate for thermocycling
        instructions.append(instr.seal("qpcr_plate", seal_type="ultra-clear"))

        # qPCR thermocycling protocol
        # Standard qPCR cycling conditions
        if chemistry == "SYBR_GREEN":
            groups = [
                # Initial denaturation
                instr.thermocycle_group(1, [instr.thermocycle_step("95:celsius", "10:minute")]),
                # Cycling (40 cycles with SYBR Green read at extension)
                instr.thermocycle_group(
                    40,
                    [
                        instr.thermocycle_step("95:celsius", "15:second"),
                        instr.thermocycle_step("60:celsius", "60:second", read=True),
                    ],
                ),
                # Melt curve (for SYBR Green)
                instr.thermocycle_group(
                    1,
                    [
                        instr.thermocycle_step("95:celsius", "15:second"),
                        instr.thermocycle_step("60:celsius", "60:second"),
                        instr.thermocycle_step("95:celsius", "15:second", read=True),
                    ],
                ),
            ]
        else:  # TaqMan/probe-based
            groups = [
                # Initial denaturation
                instr.thermocycle_group(1, [instr.thermocycle_step("95:celsius", "10:minute")]),
                # Cycling (40 cycles, read at annealing)
                instr.thermocycle_group(
                    40,
                    [
                        instr.thermocycle_step("95:celsius", "15:second"),
                        instr.thermocycle_step("60:celsius", "60:second", read=True),
                    ],
                ),
            ]

        instructions.append(
            instr.thermocycle(
                container="qpcr_plate",
                groups=groups,
                lid_temperature="105:celsius",
                volume="20:microliter",
                dataref="qpcr_data",
            )
        )

        return cast(
            JsonObject,
            {
                "refs": refs,
                "instructions": instructions,
                "outs": {"qpcr_data": {"upload": {"format": "csv", "urls": True}}},
            },
        )

    def _translate_cell_viability(self, intake: JsonObject) -> JsonObject:
        """Translate cell viability/IC50 experiment."""
        cv = _as_object(intake.get("cell_viability"))
        replicates = _as_object(intake.get("replicates"))
        tech_reps = _as_int(replicates.get("technical"), 3)
        assay_type = _as_str(cv.get("assay_type"), "MTT")
        exposure_hours = _as_int(cv.get("exposure_time_hours"), 48)
        dose_range = _as_object(cv.get("dose_range"))
        num_points = _as_int(dose_range.get("points"), 8)
        plate_format = _as_str(cv.get("plate_format"), "96-well")

        # Determine read type based on assay
        read_mode: str
        absorbance_wavelength: str | None = None
        fluorescence_excitation: str | None = None
        fluorescence_emission: str | None = None

        if assay_type == "XTT":
            read_mode = "absorbance"
            absorbance_wavelength = "450:nanometer"
        elif assay_type == "RESAZURIN":
            read_mode = "fluorescence"
            fluorescence_excitation = "560:nanometer"
            fluorescence_emission = "590:nanometer"
        elif assay_type == "CELLTITER_GLO":
            read_mode = "luminescence"
        else:
            read_mode = "absorbance"
            absorbance_wavelength = "570:nanometer"

        # Create refs
        refs = {
            "assay_plate": instr.ref(
                "96-flat" if plate_format == "96-well" else "384-flat", discard=True
            ),
            "compound_plate": instr.existing_ref("__COMPOUND_PLATE_ID__"),
        }

        instructions = []

        # Calculate wells for dose-response (use columns 2-11 for compounds, 1 & 12 for controls)
        compound_wells = []
        for col in range(2, 2 + num_points):
            compound_wells.extend(instr.column_wells(col, rows="ABCDEFGH"[:tech_reps]))

        control_wells = instr.column_wells(1, rows="ABCDEFGH"[:tech_reps])  # Negative control
        positive_wells = instr.column_wells(12, rows="ABCDEFGH"[:tech_reps])  # Positive control

        # Incubate cells with compound
        instructions.append(
            instr.incubate(
                container="assay_plate",
                where="warm_37",
                duration=f"{exposure_hours}:hour",
                shaking=False,
                co2_percent=5.0,
            )
        )

        # Read based on assay type
        all_wells = control_wells + compound_wells + positive_wells
        if read_mode == "absorbance":
            instructions.append(
                instr.absorbance(
                    container="assay_plate",
                    wells=all_wells,
                    wavelength=absorbance_wavelength or "570:nanometer",
                    dataref="viability_data",
                )
            )
        elif read_mode == "fluorescence":
            exc = fluorescence_excitation or "560:nanometer"
            em = fluorescence_emission or "590:nanometer"
            instructions.append(
                instr.fluorescence(
                    container="assay_plate",
                    wells=all_wells,
                    excitation=exc,
                    emission=em,
                    dataref="viability_data",
                )
            )
        elif read_mode == "luminescence":
            instructions.append(
                instr.luminescence(
                    container="assay_plate", wells=all_wells, dataref="viability_data"
                )
            )

        return cast(
            JsonObject,
            {
                "refs": refs,
                "instructions": instructions,
                "outs": {"viability_data": {"upload": {"format": "csv", "urls": True}}},
            },
        )

    def _translate_enzyme_inhibition(self, intake: JsonObject) -> JsonObject:
        """Translate enzyme inhibition/IC50 experiment."""
        ei = _as_object(intake.get("enzyme_inhibition"))
        replicates = _as_object(intake.get("replicates"))
        tech_reps = _as_int(replicates.get("technical"), 3)
        wavelength = _as_int(ei.get("detection_wavelength_nm"), 405)
        read_interval = 30
        total_time = _as_int(ei.get("incubation_time_minutes"), 30)
        num_reads = (total_time * 60) // read_interval

        # Create refs
        refs = {
            "assay_plate": instr.ref("96-flat", discard=True),
            "enzyme_plate": instr.existing_ref("__ENZYME_PLATE_ID__"),
            "substrate_plate": instr.existing_ref("__SUBSTRATE_PLATE_ID__"),
            "inhibitor_plate": instr.existing_ref("__INHIBITOR_PLATE_ID__"),
        }

        instructions = []

        # All wells for kinetic read
        all_wells = instr.well_range(1, 12, "ABCDEFGH"[:tech_reps])

        # Kinetic read - multiple absorbance reads over time
        for i in range(int(num_reads)):
            instructions.append(
                instr.absorbance(
                    container="assay_plate",
                    wells=all_wells,
                    wavelength=f"{wavelength}:nanometer",
                    dataref=f"kinetic_read_{i}",
                )
            )
            if i < num_reads - 1:
                # Wait between reads
                instructions.append(
                    instr.incubate(
                        container="assay_plate", where="ambient", duration=f"{read_interval}:second"
                    )
                )

        return cast(
            JsonObject,
            {
                "refs": refs,
                "instructions": instructions,
                "outs": {
                    f"kinetic_read_{i}": {"upload": {"format": "csv", "urls": True}}
                    for i in range(int(num_reads))
                },
            },
        )

    def _translate_microbial_growth(self, intake: JsonObject) -> JsonObject:
        """Translate microbial growth curve experiment."""
        mg = _as_object(intake.get("microbial_growth"))
        replicates = _as_object(intake.get("replicates"))
        tech_reps = _as_int(replicates.get("technical"), 3)
        temperature = _as_int(mg.get("incubation_temperature_c"), 37)
        total_hours = _as_int(mg.get("incubation_hours"), 24)
        read_schedule_value = mg.get("read_schedule", [])
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
        shaking = _as_str(mg.get("aeration"), "shaking") == "shaking"

        num_reads = int((total_hours * 60) / read_interval)

        # Create refs
        refs = {
            "growth_plate": instr.ref("96-flat", storage="cold_4"),
            "inoculum_plate": instr.existing_ref("__INOCULUM_PLATE_ID__"),
        }

        instructions = []

        # Growth curve - repeated incubation and OD reads
        all_wells = instr.well_range(1, 12, "ABCDEFGH"[:tech_reps])

        for i in range(num_reads):
            # Read OD600
            instructions.append(
                instr.absorbance(
                    container="growth_plate",
                    wells=all_wells,
                    wavelength="600:nanometer",
                    dataref=f"od600_read_{i}",
                )
            )
            # Incubate between reads
            if i < num_reads - 1:
                instructions.append(
                    instr.incubate(
                        container="growth_plate",
                        where=f"warm_{temperature}",
                        duration=f"{read_interval}:minute",
                        shaking=shaking,
                    )
                )

        return cast(
            JsonObject,
            {
                "refs": refs,
                "instructions": instructions,
                "outs": {
                    f"od600_read_{i}": {"upload": {"format": "csv", "urls": True}}
                    for i in range(num_reads)
                },
            },
        )

    def _translate_mic_mbc(self, intake: JsonObject) -> JsonObject:
        """Translate MIC/MBC assay."""
        mic = _as_object(intake.get("mic_mbc"))
        replicates = _as_object(intake.get("replicates"))
        tech_reps = _as_int(replicates.get("technical"), 3)
        incubation_hours = _as_int(mic.get("incubation_hours"), 18)
        num_dilutions = 8

        # Create refs
        refs = {
            "mic_plate": instr.ref("96-flat", storage="cold_4"),
            "inoculum_plate": instr.existing_ref("__INOCULUM_PLATE_ID__"),
            "antibiotic_plate": instr.existing_ref("__ANTIBIOTIC_PLATE_ID__"),
        }

        instructions = []

        # Seal and incubate
        instructions.append(instr.seal("mic_plate", seal_type="breathable"))
        instructions.append(
            instr.incubate(
                container="mic_plate",
                where="warm_37",
                duration=f"{incubation_hours}:hour",
                shaking=False,
            )
        )

        # Unseal and read OD
        instructions.append(instr.unseal("mic_plate"))
        all_wells = instr.well_range(1, num_dilutions + 2, "ABCDEFGH"[:tech_reps])
        instructions.append(
            instr.absorbance(
                container="mic_plate",
                wells=all_wells,
                wavelength="600:nanometer",
                dataref="mic_od_data",
            )
        )

        # For MBC: subculture and read again
        # Simplified - just add a note in metadata
        return cast(
            JsonObject,
            {
                "refs": refs,
                "instructions": instructions,
                "outs": {"mic_od_data": {"upload": {"format": "csv", "urls": True}}},
            },
        )

    def _translate_zone_of_inhibition(self, intake: JsonObject) -> JsonObject:
        """Translate zone of inhibition (disk diffusion) assay."""
        zoi = _as_object(intake.get("zone_of_inhibition"))
        incubation_hours = _as_int(zoi.get("incubation_hours"), 18)

        # Zone of inhibition typically uses agar plates, not microplates
        # This is a simplified protocol - real ZOI would need custom handling
        refs = {
            "agar_plate": instr.existing_ref("__AGAR_PLATE_ID__"),
        }

        instructions = []

        # Incubate agar plate
        instructions.append(
            instr.incubate(
                container="agar_plate",
                where="warm_37",
                duration=f"{incubation_hours}:hour",
                shaking=False,
            )
        )

        # Image the plate to measure zones
        instructions.append(
            instr.image_plate(
                container="agar_plate", dataref="zone_image", mode="top", magnification=1.0
            )
        )

        return cast(
            JsonObject,
            {
                "refs": refs,
                "instructions": instructions,
                "outs": {"zone_image": {"upload": {"format": "png", "urls": True}}},
            },
        )

    def _translate_custom(self, intake: JsonObject) -> JsonObject:
        """Translate custom protocol."""
        custom = _as_object(intake.get("custom_protocol"))
        protocol_steps_value = custom.get("steps", [])
        protocol_steps = protocol_steps_value if isinstance(protocol_steps_value, list) else []

        # For custom protocols, create a basic structure
        # The actual steps would need manual review
        refs = {
            "main_plate": instr.ref("96-flat", storage="cold_4"),
        }

        instructions = []

        # Add a comment instruction (not standard autoprotocol, but useful)
        # For now, just create placeholder structure
        instructions.append(
            {
                "op": "comment",
                "message": (
                    f"Custom protocol with {len(protocol_steps)} steps - requires manual review"
                ),
            }
        )

        return cast(JsonObject, {"refs": refs, "instructions": instructions, "outs": {}})
