export const experimentTypeEntries = [
  {
    value: "sanger",
    label: "Sanger Sequencing",
    backendType: "SANGER_PLASMID_VERIFICATION",
  },
  {
    value: "qpcr",
    label: "qPCR",
    backendType: "QPCR_EXPRESSION",
  },
  {
    value: "cell_viability",
    label: "Cell Viability Assay",
    backendType: "CELL_VIABILITY_IC50",
  },
  {
    value: "enzyme_inhibition",
    label: "Enzyme Inhibition Assay",
    backendType: "ENZYME_INHIBITION_IC50",
  },
  {
    value: "microbial_growth",
    label: "Microbial Growth Curve",
    backendType: "MICROBIAL_GROWTH_MATRIX",
  },
  {
    value: "mic_mbc",
    label: "MIC/MBC Determination",
    backendType: "MIC_MBC_ASSAY",
  },
  {
    value: "zone_of_inhibition",
    label: "Zone of Inhibition",
    backendType: "ZONE_OF_INHIBITION",
  },
  {
    value: "custom_protocol",
    label: "Custom Protocol",
    backendType: "CUSTOM",
  },
] as const;

export type ExperimentTypeValue = (typeof experimentTypeEntries)[number]["value"];

export const experimentTypes: { value: ExperimentTypeValue; label: string }[] =
  experimentTypeEntries.map(({ value, label }) => ({ value, label }));

export const experimentTypeMap: Record<ExperimentTypeValue, string> =
  experimentTypeEntries.reduce(
    (acc, entry) => {
      acc[entry.value] = entry.backendType;
      return acc;
    },
    {} as Record<ExperimentTypeValue, string>
  );

export const isExperimentTypeValue = (value: string): value is ExperimentTypeValue =>
  Object.prototype.hasOwnProperty.call(experimentTypeMap, value);

export type ExperimentForm = {
  experiment_type: ExperimentTypeValue | "";
  title: string;
  hypothesis_statement: string;
  hypothesis_null: string;
  budget_max_usd: number;
  bsl_level: string;
  privacy: string;
  notes: string;
};

export type ExperimentSample = Omit<ExperimentForm, "experiment_type"> & {
  experiment_type: ExperimentTypeValue;
};

export const sampleExperiments: ExperimentSample[] = [
  {
    experiment_type: "sanger",
    title: "pUC19-GFP plasmid verification sequencing",
    hypothesis_statement:
      "The cloned GFP insert in pUC19 vector contains the correct 720bp sequence with no mutations at the BamHI/EcoRI cloning sites",
    hypothesis_null:
      "The GFP insert sequence differs from the expected reference or contains mutations at the cloning junctions",
    budget_max_usd: 150,
    bsl_level: "BSL1",
    privacy: "open",
    notes:
      "Forward and reverse sequencing primers targeting vector backbone. Need confirmation of insert orientation.",
  },
  {
    experiment_type: "sanger",
    title: "CRISPR guide RNA plasmid validation",
    hypothesis_statement:
      "The sgRNA targeting BRCA1 exon 10 has been correctly inserted into the pX459 backbone with the U6 promoter intact",
    hypothesis_null:
      "The sgRNA sequence is incorrect or the U6 promoter region has been disrupted during cloning",
    budget_max_usd: 200,
    bsl_level: "BSL1",
    privacy: "confidential",
    notes:
      "Critical for upcoming gene editing experiment. Please prioritize accuracy over turnaround time.",
  },
  {
    experiment_type: "sanger",
    title: "Gibson assembly verification of 3-fragment construct",
    hypothesis_statement:
      "All three DNA fragments (promoter + coding sequence + terminator) are correctly assembled in the expected order without frameshifts",
    hypothesis_null:
      "One or more junctions contain errors or the fragments are assembled in incorrect order",
    budget_max_usd: 175,
    bsl_level: "BSL1",
    privacy: "open",
    notes:
      "Gibson assembly of synthetic biology construct. Junctions at positions 450 and 1200 need verification.",
  },
  {
    experiment_type: "qpcr",
    title: "GAPDH knockdown efficiency measurement in HeLa cells",
    hypothesis_statement:
      "siRNA treatment reduces GAPDH mRNA expression by at least 70% compared to scrambled control at 48 hours post-transfection",
    hypothesis_null:
      "siRNA treatment does not significantly reduce GAPDH mRNA levels compared to scrambled control",
    budget_max_usd: 300,
    bsl_level: "BSL2",
    privacy: "open",
    notes:
      "Please include 18S rRNA as reference gene. Samples will be provided as cell pellets.",
  },
  {
    experiment_type: "qpcr",
    title: "IL-6 expression after LPS stimulation in THP-1 macrophages",
    hypothesis_statement:
      "LPS stimulation (100ng/mL) increases IL-6 mRNA expression by at least 10-fold compared to unstimulated controls at 4 hours",
    hypothesis_null:
      "LPS stimulation does not significantly increase IL-6 mRNA expression compared to unstimulated controls",
    budget_max_usd: 450,
    bsl_level: "BSL2",
    privacy: "confidential",
    notes:
      "Time course study - need measurements at 0, 2, 4, and 8 hours. Please use HPRT as housekeeping gene.",
  },
  {
    experiment_type: "qpcr",
    title: "Viral load quantification in patient serum samples",
    hypothesis_statement:
      "The qPCR assay can detect and quantify viral RNA copies with a lower limit of detection of 100 copies/mL",
    hypothesis_null:
      "The qPCR assay fails to reliably detect viral RNA below 1000 copies/mL",
    budget_max_usd: 500,
    bsl_level: "BSL2",
    privacy: "confidential",
    notes:
      "Standard curve required. Samples handled according to BSL-2 protocols. Triple technical replicates needed.",
  },
  {
    experiment_type: "cell_viability",
    title: "Doxorubicin IC50 determination in MCF-7 breast cancer cells",
    hypothesis_statement:
      "Doxorubicin exhibits cytotoxicity with an IC50 between 0.1-10 uM in MCF-7 cells after 72-hour exposure",
    hypothesis_null:
      "Doxorubicin shows no dose-dependent cytotoxicity or IC50 falls outside the testable range",
    budget_max_usd: 400,
    bsl_level: "BSL2",
    privacy: "open",
    notes:
      "8-point dose response curve from 0.01 to 100 uM. Include vehicle control and positive control (staurosporine).",
  },
  {
    experiment_type: "cell_viability",
    title: "Novel kinase inhibitor compound screening in A549 lung cancer cells",
    hypothesis_statement:
      "Compound LIT-2847 shows selective cytotoxicity with IC50 < 5 uM while sparing normal lung fibroblasts (IC50 > 50 uM)",
    hypothesis_null:
      "Compound LIT-2847 shows no selectivity between cancer and normal cells or lacks cytotoxic activity",
    budget_max_usd: 600,
    bsl_level: "BSL2",
    privacy: "confidential",
    notes:
      "Test in parallel with normal MRC-5 fibroblasts. 48-hour exposure. MTT assay preferred.",
  },
  {
    experiment_type: "cell_viability",
    title: "Combination therapy synergy assessment - Cisplatin with PARP inhibitor",
    hypothesis_statement:
      "The combination of cisplatin and olaparib shows synergistic cytotoxicity (CI < 0.8) in BRCA1-mutant ovarian cancer cells",
    hypothesis_null:
      "The combination shows additive or antagonistic effects (CI >= 0.8) in BRCA1-mutant cells",
    budget_max_usd: 750,
    bsl_level: "BSL2",
    privacy: "confidential",
    notes:
      "Use Chou-Talalay method. Test 5 fixed-ratio combinations. 72-hour exposure in UWB1.289 cells.",
  },
  {
    experiment_type: "enzyme_inhibition",
    title: "Acetylcholinesterase inhibition by galantamine derivatives",
    hypothesis_statement:
      "Novel galantamine analog GAL-5 inhibits human AChE with IC50 < 1 uM comparable to or better than parent compound",
    hypothesis_null:
      "GAL-5 shows significantly weaker AChE inhibition (IC50 > 10 uM) compared to galantamine",
    budget_max_usd: 350,
    bsl_level: "BSL1",
    privacy: "open",
    notes:
      "Use recombinant human AChE. Ellman assay with DTNB. Include galantamine and donepezil as reference inhibitors.",
  },
  {
    experiment_type: "enzyme_inhibition",
    title: "HDAC6 selective inhibitor characterization",
    hypothesis_statement:
      "Compound HD-103 selectively inhibits HDAC6 (IC50 < 100 nM) with >50-fold selectivity over HDAC1 and HDAC3",
    hypothesis_null:
      "HD-103 lacks selectivity for HDAC6 or shows weak inhibition (IC50 > 1 uM)",
    budget_max_usd: 500,
    bsl_level: "BSL1",
    privacy: "confidential",
    notes:
      "Test against panel: HDAC1 HDAC3 HDAC6 HDAC8. Fluorogenic substrate assay. Include ACY-1215 as reference.",
  },
  {
    experiment_type: "enzyme_inhibition",
    title: "Beta-secretase (BACE1) inhibition kinetics study",
    hypothesis_statement:
      "Peptide inhibitor BACE-P7 inhibits BACE1 with Ki < 50 nM through competitive inhibition mechanism",
    hypothesis_null:
      "BACE-P7 shows weak binding (Ki > 500 nM) or non-competitive inhibition mechanism",
    budget_max_usd: 450,
    bsl_level: "BSL1",
    privacy: "confidential",
    notes:
      "Determine Ki and mechanism using Lineweaver-Burk analysis. FRET-based substrate. Multiple substrate concentrations needed.",
  },
  {
    experiment_type: "microbial_growth",
    title: "E. coli growth optimization in minimal media with glycerol",
    hypothesis_statement:
      "E. coli K-12 achieves maximum growth rate > 0.4/hr in M9 minimal media with 0.4% glycerol at 37C",
    hypothesis_null:
      "E. coli growth rate in glycerol minimal media is < 0.2/hr or shows extended lag phase > 4 hours",
    budget_max_usd: 250,
    bsl_level: "BSL1",
    privacy: "open",
    notes:
      "96-well plate format with continuous OD600 monitoring. Test three biological replicates.",
  },
  {
    experiment_type: "microbial_growth",
    title: "Probiotic strain temperature tolerance profiling",
    hypothesis_statement:
      "Lactobacillus rhamnosus GG maintains >80% viability and growth capacity after 2-hour exposure to 45C",
    hypothesis_null:
      "L. rhamnosus GG shows significant viability loss (>50%) or impaired growth after heat stress",
    budget_max_usd: 300,
    bsl_level: "BSL1",
    privacy: "open",
    notes:
      "Growth curves at 30, 37, and 42C. CFU counts before and after heat treatment. MRS media.",
  },
  {
    experiment_type: "microbial_growth",
    title: "Antibiotic sub-MIC effects on biofilm formation",
    hypothesis_statement:
      "Sub-MIC concentrations (0.25x MIC) of azithromycin reduce P. aeruginosa biofilm formation by >50% compared to untreated",
    hypothesis_null:
      "Sub-MIC azithromycin does not significantly reduce biofilm biomass compared to untreated controls",
    budget_max_usd: 400,
    bsl_level: "BSL2",
    privacy: "confidential",
    notes:
      "Crystal violet biofilm assay. 24-hour biofilm formation. Test PAO1 and two clinical isolates.",
  },
  {
    experiment_type: "mic_mbc",
    title: "Vancomycin MIC determination for MRSA clinical isolates",
    hypothesis_statement:
      "Clinical MRSA isolates show vancomycin MICs within susceptible range (< 2 ug/mL) according to CLSI breakpoints",
    hypothesis_null:
      "One or more MRSA isolates show vancomycin MIC >= 2 ug/mL indicating intermediate or resistant phenotype",
    budget_max_usd: 350,
    bsl_level: "BSL2",
    privacy: "confidential",
    notes:
      "Broth microdilution per CLSI M07. Test 5 clinical isolates plus ATCC 29213 control. Report exact MIC values.",
  },
  {
    experiment_type: "mic_mbc",
    title: "Novel antimicrobial peptide MIC/MBC profiling",
    hypothesis_statement:
      "Antimicrobial peptide AMP-12 shows bactericidal activity (MBC/MIC ratio <= 4) against E. coli and S. aureus",
    hypothesis_null:
      "AMP-12 is bacteriostatic (MBC/MIC > 4) or shows no antimicrobial activity (MIC > 128 ug/mL)",
    budget_max_usd: 400,
    bsl_level: "BSL1",
    privacy: "open",
    notes:
      "Test against E. coli ATCC 25922 and S. aureus ATCC 29213. MHB media. Determine both MIC and MBC.",
  },
  {
    experiment_type: "mic_mbc",
    title: "Antifungal susceptibility testing for Candida panel",
    hypothesis_statement:
      "Fluconazole maintains efficacy (MIC <= 2 ug/mL) against C. albicans clinical isolates from bloodstream infections",
    hypothesis_null:
      "Clinical isolates show fluconazole resistance (MIC > 4 ug/mL) indicating emerging resistance patterns",
    budget_max_usd: 500,
    bsl_level: "BSL2",
    privacy: "confidential",
    notes:
      "CLSI M27 broth microdilution. Test C. albicans C. glabrata C. parapsilosis. Include QC strain.",
  },
  {
    experiment_type: "zone_of_inhibition",
    title: "Antibiotic disk diffusion susceptibility testing",
    hypothesis_statement:
      "E. coli clinical isolate is susceptible to ciprofloxacin ampicillin and gentamicin based on CLSI zone diameter breakpoints",
    hypothesis_null:
      "The isolate shows resistance to one or more tested antibiotics per CLSI interpretive criteria",
    budget_max_usd: 200,
    bsl_level: "BSL2",
    privacy: "open",
    notes:
      "Kirby-Bauer method per CLSI M02. Mueller-Hinton agar. Include E. coli ATCC 25922 as QC.",
  },
  {
    experiment_type: "zone_of_inhibition",
    title: "Plant extract antimicrobial screening",
    hypothesis_statement:
      "Oregano essential oil produces zone of inhibition > 15mm against S. aureus indicating significant antimicrobial activity",
    hypothesis_null:
      "Oregano essential oil shows weak (< 10mm) or no zone of inhibition against S. aureus",
    budget_max_usd: 250,
    bsl_level: "BSL1",
    privacy: "open",
    notes:
      "Agar well diffusion method. Test at 100% 50% and 25% concentrations. Include gentamicin positive control.",
  },
  {
    experiment_type: "zone_of_inhibition",
    title: "Bacteriocin activity spectrum determination",
    hypothesis_statement:
      "Bacteriocin from L. plantarum shows inhibition zones > 12mm against Listeria monocytogenes but not Gram-negative bacteria",
    hypothesis_null:
      "The bacteriocin lacks specificity or fails to inhibit target Gram-positive pathogens",
    budget_max_usd: 300,
    bsl_level: "BSL2",
    privacy: "confidential",
    notes:
      "Test against panel: L. monocytogenes S. aureus E. coli Salmonella. Spot-on-lawn assay.",
  },
  {
    experiment_type: "custom_protocol",
    title: "Protein expression optimization using Design of Experiments",
    hypothesis_statement:
      "DOE-optimized conditions increase GFP expression yield by >2-fold compared to standard IPTG induction in BL21(DE3)",
    hypothesis_null:
      "DOE approach does not identify conditions that significantly improve protein expression over standard protocol",
    budget_max_usd: 600,
    bsl_level: "BSL1",
    privacy: "open",
    notes:
      "Factors: IPTG concentration temperature induction OD and post-induction time. Response: fluorescence/OD600.",
  },
  {
    experiment_type: "custom_protocol",
    title: "CRISPR base editing efficiency quantification",
    hypothesis_statement:
      "ABE8e base editor achieves >30% A-to-G conversion at target site in HEK293T cells with <5% indel formation",
    hypothesis_null:
      "Base editing efficiency is <10% or indel frequency exceeds 20% indicating poor editor performance",
    budget_max_usd: 800,
    bsl_level: "BSL2",
    privacy: "confidential",
    notes:
      "NGS analysis of editing outcomes. Include unedited control and Cas9 nuclease comparison. 72hr post-transfection.",
  },
  {
    experiment_type: "custom_protocol",
    title: "Directed evolution library quality assessment",
    hypothesis_statement:
      "Error-prone PCR library contains >10^6 unique variants with mutation rate of 2-4 mutations per gene",
    hypothesis_null:
      "Library diversity is insufficient (<10^5 variants) or mutation rate falls outside target range",
    budget_max_usd: 450,
    bsl_level: "BSL1",
    privacy: "open",
    notes:
      "NGS for variant calling. Colony PCR of 20 random clones for Sanger verification. Calculate functional variant fraction.",
  },
];
