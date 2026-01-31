"""ECL (Emerald Cloud Lab) context for LLM prompts.

This provides the LLM with knowledge about ECL's SLL (Symbolic Lab Language)
format and available experiment functions.
"""

ECL_CONTEXT = """
## ECL (Emerald Cloud Lab) - SLL Format

ECL uses SLL (Symbolic Lab Language), built on Wolfram Language (Mathematica) syntax.

### Available Experiment Functions:

1. **ExperimentSequencing** - DNA Sanger sequencing
   - Parameters: samples, Primers, Method, ReadLength, Coverage
   - Coverage options: SingleEnd, DoubleEnd, Tiled

2. **ExperimentqPCR** - Quantitative PCR
   - Parameters: samples, Primers, Probes, ReferenceSamples, NumberOfReplicates, ReactionVolume, MasterMix, ReverseTranscription
   - Primer format: Forward/Reverse sequences or sample references

3. **ExperimentCellViability** - Cell viability assays (IC50)
   - Parameters: cells, Compounds, Method, ConcentrationRange, IncubationTime, PlateFormat, NumberOfReplicates
   - Methods: MTT, XTT, Resazurin, CellTiterGlo, CalceinAM

4. **ExperimentEnzymeActivity** - Enzyme inhibition assays
   - Parameters: enzyme, Substrate, Inhibitors, InhibitorConcentrationRange, Temperature, AssayTime, DetectionWavelength, NumberOfReplicates

5. **ExperimentGrowthCurve** - Microbial growth curves
   - Parameters: samples, Media, Temperature, Duration, ReadInterval, Shaking, ShakingRate

6. **ExperimentAntibioticSusceptibility** - MIC/MBC determination
   - Parameters: organisms, Antibiotics, Method, DilutionFactor, NumberOfDilutions, IncubationTime, Temperature
   - Methods: BrothMicrodilution, AgarDilution, DiskDiffusion, Etest

7. **ExperimentDiskDiffusion** - Zone of inhibition assays
   - Parameters: organisms, Compounds, AgarType, DiskConcentration, IncubationTime, Temperature

### SLL Syntax Examples:

```wolfram
(* Sample reference *)
Object[Sample, "sample-id"]

(* Model reference *)
Model[Sample, "StandardPrimer", "M13-Forward"]

(* Option assignment *)
Temperature -> 37 Celsius
ReactionVolume -> 20 Microliter
NumberOfReplicates -> 3

(* Function call *)
ExperimentqPCR[
  {sample_1, sample_2},
  Primers -> {<|"Forward" -> "ATCG...", "Reverse" -> "GCTA..."|>},
  NumberOfReplicates -> 3,
  ReactionVolume -> 20 Microliter
]
```

### Units:
- Volume: Microliter, Milliliter, Liter
- Concentration: Micromolar, Millimolar, Molar, Nanomolar
- Temperature: Celsius
- Time: Second, Minute, Hour
- Length: Basepair, Kilobasepair, Nanometer
- Mass: Gram, Milligram, Microgram
"""
