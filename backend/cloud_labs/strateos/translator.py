"""
Strateos Autoprotocol translator.

Translates Litmus experiment intake specifications to Autoprotocol JSON format.
"""

import json
from typing import Any

from ..base import CloudLabTranslator, TranslationResult, ValidationIssue
from . import instructions as instr


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

    def validate_intake(self, intake: dict) -> list[ValidationIssue]:
        """Validate intake for Strateos compatibility."""
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
                message=f"Experiment type '{exp_type}' is not supported by Strateos",
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
                message=f"BSL level '{bsl}' is not supported",
                severity="error"
            ))

        # Check for human/animal materials (may require special handling)
        if compliance.get("human_derived_material"):
            issues.append(ValidationIssue(
                path="compliance.human_derived_material",
                code="special_handling",
                message="Human-derived materials require special approval from Strateos",
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
                warnings=[i for i in issues if i.severity == "warning"]
            )

        # Get the appropriate translator method
        exp_type = intake["experiment_type"]
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
                    "title": intake.get("title", "Untitled"),
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

    def _translate_sanger(self, intake: dict) -> dict:
        """Translate Sanger sequencing experiment."""
        sanger = intake.get("sanger", {})
        replicates = intake.get("replicates", {})
        tech_reps = replicates.get("technical", 1)

        # Create refs
        refs = {
            "sample_plate": instr.ref("96-pcr", storage="cold_4"),
        }

        # Add primer plate if requester provides primers
        primers = sanger.get("primers", [])
        requester_primers = [p for p in primers if p.get("provided_by") == "requester"]
        if requester_primers:
            refs["primer_plate"] = instr.ref("96-pcr", storage="cold_4")

        instructions = []

        # Prepare wells list - one well per primer per replicate
        wells_to_sequence = []
        well_idx = 0
        for primer in primers:
            for rep in range(tech_reps):
                well = instr.column_wells(1)[well_idx % 8]  # Use column 1, wrap around
                wells_to_sequence.append(well)
                well_idx += 1

        # Sanger sequencing instruction
        instructions.append(instr.sangerseq(
            container="sample_plate",
            wells=wells_to_sequence[:8],  # Limit to 8 wells for standard plate
            dataref="sanger_data",
            type_="standard"
        ))

        return {
            "refs": refs,
            "instructions": instructions,
            "outs": {
                "sanger_data": {
                    "upload": {
                        "format": "ab1",
                        "urls": True
                    }
                }
            }
        }

    def _translate_qpcr(self, intake: dict) -> dict:
        """Translate qPCR experiment."""
        qpcr = intake.get("qpcr", {})
        replicates = intake.get("replicates", {})
        tech_reps = replicates.get("technical", 3)
        num_samples = qpcr.get("number_of_samples", 6)

        chemistry = qpcr.get("chemistry", "SYBR_GREEN")
        targets = qpcr.get("targets", [])

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
                instr.thermocycle_group(1, [
                    instr.thermocycle_step("95:celsius", "10:minute")
                ]),
                # Cycling (40 cycles with SYBR Green read at extension)
                instr.thermocycle_group(40, [
                    instr.thermocycle_step("95:celsius", "15:second"),
                    instr.thermocycle_step("60:celsius", "60:second", read=True),
                ]),
                # Melt curve (for SYBR Green)
                instr.thermocycle_group(1, [
                    instr.thermocycle_step("95:celsius", "15:second"),
                    instr.thermocycle_step("60:celsius", "60:second"),
                    instr.thermocycle_step("95:celsius", "15:second", read=True),
                ])
            ]
        else:  # TaqMan/probe-based
            groups = [
                # Initial denaturation
                instr.thermocycle_group(1, [
                    instr.thermocycle_step("95:celsius", "10:minute")
                ]),
                # Cycling (40 cycles, read at annealing)
                instr.thermocycle_group(40, [
                    instr.thermocycle_step("95:celsius", "15:second"),
                    instr.thermocycle_step("60:celsius", "60:second", read=True),
                ])
            ]

        instructions.append(instr.thermocycle(
            container="qpcr_plate",
            groups=groups,
            lid_temperature="105:celsius",
            volume="20:microliter",
            dataref="qpcr_data"
        ))

        return {
            "refs": refs,
            "instructions": instructions,
            "outs": {
                "qpcr_data": {
                    "upload": {
                        "format": "csv",
                        "urls": True
                    }
                }
            }
        }

    def _translate_cell_viability(self, intake: dict) -> dict:
        """Translate cell viability/IC50 experiment."""
        cv = intake.get("cell_viability", {})
        replicates = intake.get("replicates", {})
        tech_reps = replicates.get("technical", 3)

        cell_line = cv.get("cell_line", "HeLa")
        assay_type = cv.get("assay_type", "MTT")
        exposure_hours = cv.get("exposure_time_hours", 48)
        dose_range = cv.get("dose_range", {})
        num_points = dose_range.get("points", 8)
        plate_format = cv.get("plate_format", "96-well")

        # Determine read type based on assay
        read_type = {
            "MTT": ("absorbance", "570:nanometer"),
            "XTT": ("absorbance", "450:nanometer"),
            "RESAZURIN": ("fluorescence", ("560:nanometer", "590:nanometer")),
            "CELLTITER_GLO": ("luminescence", None),
        }.get(assay_type, ("absorbance", "570:nanometer"))

        # Create refs
        refs = {
            "assay_plate": instr.ref("96-flat" if plate_format == "96-well" else "384-flat", discard=True),
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
        instructions.append(instr.incubate(
            container="assay_plate",
            where="warm_37",
            duration=f"{exposure_hours}:hour",
            shaking=False,
            co2_percent=5.0
        ))

        # Read based on assay type
        all_wells = control_wells + compound_wells + positive_wells
        if read_type[0] == "absorbance":
            instructions.append(instr.absorbance(
                container="assay_plate",
                wells=all_wells,
                wavelength=read_type[1],
                dataref="viability_data"
            ))
        elif read_type[0] == "fluorescence":
            exc, em = read_type[1]
            instructions.append(instr.fluorescence(
                container="assay_plate",
                wells=all_wells,
                excitation=exc,
                emission=em,
                dataref="viability_data"
            ))
        elif read_type[0] == "luminescence":
            instructions.append(instr.luminescence(
                container="assay_plate",
                wells=all_wells,
                dataref="viability_data"
            ))

        return {
            "refs": refs,
            "instructions": instructions,
            "outs": {
                "viability_data": {
                    "upload": {
                        "format": "csv",
                        "urls": True
                    }
                }
            }
        }

    def _translate_enzyme_inhibition(self, intake: dict) -> dict:
        """Translate enzyme inhibition/IC50 experiment."""
        ei = intake.get("enzyme_inhibition", {})
        replicates = intake.get("replicates", {})
        tech_reps = replicates.get("technical", 3)

        enzyme = ei.get("enzyme_name", "Unknown")
        substrate = ei.get("substrate_name", "Unknown")
        detection_method = ei.get("detection_method", "absorbance")
        wavelength = ei.get("detection_wavelength_nm", 405)
        read_interval = ei.get("read_interval_seconds", 30)
        total_time = ei.get("total_assay_time_minutes", 30)
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
            instructions.append(instr.absorbance(
                container="assay_plate",
                wells=all_wells,
                wavelength=f"{wavelength}:nanometer",
                dataref=f"kinetic_read_{i}"
            ))
            if i < num_reads - 1:
                # Wait between reads
                instructions.append(instr.incubate(
                    container="assay_plate",
                    where="ambient",
                    duration=f"{read_interval}:second"
                ))

        return {
            "refs": refs,
            "instructions": instructions,
            "outs": {f"kinetic_read_{i}": {"upload": {"format": "csv", "urls": True}} for i in range(int(num_reads))}
        }

    def _translate_microbial_growth(self, intake: dict) -> dict:
        """Translate microbial growth curve experiment."""
        mg = intake.get("microbial_growth", {})
        replicates = intake.get("replicates", {})
        tech_reps = replicates.get("technical", 3)

        organism = mg.get("organism", "E. coli")
        media = mg.get("media", "LB")
        temperature = mg.get("temperature_celsius", 37)
        total_hours = mg.get("duration_hours", 24)
        read_interval = mg.get("read_interval_minutes", 30)
        shaking = mg.get("shaking", True)

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
            instructions.append(instr.absorbance(
                container="growth_plate",
                wells=all_wells,
                wavelength="600:nanometer",
                dataref=f"od600_read_{i}"
            ))
            # Incubate between reads
            if i < num_reads - 1:
                instructions.append(instr.incubate(
                    container="growth_plate",
                    where=f"warm_{temperature}",
                    duration=f"{read_interval}:minute",
                    shaking=shaking
                ))

        return {
            "refs": refs,
            "instructions": instructions,
            "outs": {f"od600_read_{i}": {"upload": {"format": "csv", "urls": True}} for i in range(num_reads)}
        }

    def _translate_mic_mbc(self, intake: dict) -> dict:
        """Translate MIC/MBC assay."""
        mic = intake.get("mic_mbc", {})
        replicates = intake.get("replicates", {})
        tech_reps = replicates.get("technical", 3)

        organism = mic.get("organism", "E. coli")
        antibiotic = mic.get("antibiotic_name", "Unknown")
        incubation_hours = mic.get("incubation_hours", 18)
        dilution_series = mic.get("dilution_series", "2-fold")
        num_dilutions = mic.get("number_of_dilutions", 8)

        # Create refs
        refs = {
            "mic_plate": instr.ref("96-flat", storage="cold_4"),
            "inoculum_plate": instr.existing_ref("__INOCULUM_PLATE_ID__"),
            "antibiotic_plate": instr.existing_ref("__ANTIBIOTIC_PLATE_ID__"),
        }

        instructions = []

        # Seal and incubate
        instructions.append(instr.seal("mic_plate", seal_type="breathable"))
        instructions.append(instr.incubate(
            container="mic_plate",
            where="warm_37",
            duration=f"{incubation_hours}:hour",
            shaking=False
        ))

        # Unseal and read OD
        instructions.append(instr.unseal("mic_plate"))
        all_wells = instr.well_range(1, num_dilutions + 2, "ABCDEFGH"[:tech_reps])
        instructions.append(instr.absorbance(
            container="mic_plate",
            wells=all_wells,
            wavelength="600:nanometer",
            dataref="mic_od_data"
        ))

        # For MBC: subculture and read again
        # Simplified - just add a note in metadata
        return {
            "refs": refs,
            "instructions": instructions,
            "outs": {
                "mic_od_data": {
                    "upload": {
                        "format": "csv",
                        "urls": True
                    }
                }
            }
        }

    def _translate_zone_of_inhibition(self, intake: dict) -> dict:
        """Translate zone of inhibition (disk diffusion) assay."""
        zoi = intake.get("zone_of_inhibition", {})
        replicates = intake.get("replicates", {})
        tech_reps = replicates.get("technical", 3)

        organism = zoi.get("organism", "E. coli")
        compounds = zoi.get("compounds", [])
        incubation_hours = zoi.get("incubation_hours", 18)
        agar_type = zoi.get("agar_type", "Mueller-Hinton")

        # Zone of inhibition typically uses agar plates, not microplates
        # This is a simplified protocol - real ZOI would need custom handling
        refs = {
            "agar_plate": instr.existing_ref("__AGAR_PLATE_ID__"),
        }

        instructions = []

        # Incubate agar plate
        instructions.append(instr.incubate(
            container="agar_plate",
            where="warm_37",
            duration=f"{incubation_hours}:hour",
            shaking=False
        ))

        # Image the plate to measure zones
        instructions.append(instr.image_plate(
            container="agar_plate",
            dataref="zone_image",
            mode="top",
            magnification=1.0
        ))

        return {
            "refs": refs,
            "instructions": instructions,
            "outs": {
                "zone_image": {
                    "upload": {
                        "format": "png",
                        "urls": True
                    }
                }
            }
        }

    def _translate_custom(self, intake: dict) -> dict:
        """Translate custom protocol."""
        custom = intake.get("custom_protocol", {})
        protocol_steps = custom.get("protocol_steps", [])

        # For custom protocols, create a basic structure
        # The actual steps would need manual review
        refs = {
            "main_plate": instr.ref("96-flat", storage="cold_4"),
        }

        instructions = []

        # Add a comment instruction (not standard autoprotocol, but useful)
        # For now, just create placeholder structure
        instructions.append({
            "op": "comment",
            "message": f"Custom protocol with {len(protocol_steps)} steps - requires manual review"
        })

        return {
            "refs": refs,
            "instructions": instructions,
            "outs": {}
        }
