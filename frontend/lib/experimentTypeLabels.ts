export const EXPERIMENT_TYPE_LABELS = {
  SANGER_PLASMID_VERIFICATION: "Sanger Sequencing",
  QPCR_EXPRESSION: "qPCR Expression",
  CELL_VIABILITY_IC50: "Cell Viability IC50",
  ENZYME_INHIBITION_IC50: "Enzyme Inhibition IC50",
  MICROBIAL_GROWTH_MATRIX: "Microbial Growth",
  MIC_MBC_ASSAY: "MIC/MBC Assay",
  ZONE_OF_INHIBITION: "Zone of Inhibition",
  CUSTOM: "Custom Protocol",
} as const;

export type ExperimentTypeLabelKey = keyof typeof EXPERIMENT_TYPE_LABELS;

export const EXPERIMENT_TYPE_SHORT_LABELS: Record<ExperimentTypeLabelKey, string> = {
  SANGER_PLASMID_VERIFICATION: "Sanger",
  QPCR_EXPRESSION: "qPCR",
  CELL_VIABILITY_IC50: "Cell Viability",
  ENZYME_INHIBITION_IC50: "Enzyme Inhib",
  MICROBIAL_GROWTH_MATRIX: "Microbial Growth",
  MIC_MBC_ASSAY: "MIC/MBC",
  ZONE_OF_INHIBITION: "Zone of Inhib",
  CUSTOM: "Custom",
};

export type ExperimentTypeLabelVariant = "full" | "short";

export const getExperimentTypeLabel = (
  experimentType: string,
  variant: ExperimentTypeLabelVariant = "full"
): string => {
  const labels = variant === "short" ? EXPERIMENT_TYPE_SHORT_LABELS : EXPERIMENT_TYPE_LABELS;
  return Object.prototype.hasOwnProperty.call(labels, experimentType)
    ? labels[experimentType as ExperimentTypeLabelKey]
    : experimentType;
};
