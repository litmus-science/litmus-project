/**
 * Litmus Lab Router (TypeScript)
 * 
 * Routes experiment intakes to best-fit labs using:
 * 1. Hard filters (compliance, shipping, experiment type)
 * 2. Weighted scoring (menu fit, turnaround, cost, quality, deliverables)
 */

// Types

export type ExperimentType =
  | 'SANGER_PLASMID_VERIFICATION'
  | 'QPCR_EXPRESSION'
  | 'CELL_VIABILITY_IC50'
  | 'ENZYME_INHIBITION_IC50'
  | 'MICROBIAL_GROWTH_MATRIX'
  | 'MIC_MBC_ASSAY'
  | 'ZONE_OF_INHIBITION'
  | 'CUSTOM';

export type BSLLevel = 'BSL1' | 'BSL2';
export type PackageLevel = 'L0_RAW_ONLY' | 'L1_BASIC_QC' | 'L2_INTERPRETATION';
export type ShippingMode = 'AMBIENT' | 'COLD_PACK' | 'DRY_ICE' | 'LIQUID_NITROGEN';

export interface RoutingWeights {
  menuFit: number;
  turnaroundFit: number;
  specCompleteness: number;
  costFit: number;
  quality: number;
  logistics: number;
  deliverablesMatch: number;
}

export const DEFAULT_WEIGHTS: RoutingWeights = {
  menuFit: 0.20,
  turnaroundFit: 0.15,
  specCompleteness: 0.10,
  costFit: 0.15,
  quality: 0.20,
  logistics: 0.05,
  deliverablesMatch: 0.15,
};

export interface Intake {
  experiment_type: ExperimentType;
  title: string;
  hypothesis: {
    statement: string;
    null_hypothesis?: string;
  };
  compliance: {
    bsl: BSLLevel;
    human_derived_material?: boolean;
    animal_derived_material?: boolean;
    hazardous_chemicals?: boolean;
  };
  turnaround_budget: {
    desired_turnaround_days?: number;
    budget_max_usd: number;
  };
  deliverables: {
    raw_data_formats?: string[];
    required_processed_outputs?: string[];
    minimum_package_level: PackageLevel;
  };
  replicates?: { technical?: number; biological?: number };
  acceptance_criteria?: {
    success_conditions?: Array<{
      metric: string;
      operator: string;
      threshold: number | { min: number; max: number };
    }>;
  };
  [key: string]: unknown;
}

export interface LabProfile {
  lab_id: string;
  name: string;
  status: 'active' | 'paused' | 'onboarding' | 'suspended';
  region?: string;
  capabilities: {
    experiment_types: ExperimentType[];
    menu_tags?: string[];
  };
  compliance: {
    max_bsl: BSLLevel;
    human_samples_approved?: boolean;
    animal_samples_approved?: boolean;
    hazardous_chemicals_approved?: boolean;
  };
  commercial_terms?: {
    pricing_bands?: Record<string, { min_usd?: number; max_usd?: number; typical_usd?: number }>;
    turnaround_days?: Record<string, { standard?: number; expedited?: number }>;
  };
  quality_metrics?: {
    on_time_rate?: number;
    average_rating?: number;
    rerun_rate?: number;
    data_package_score?: number;
  };
  availability?: { current_capacity?: 'high' | 'medium' | 'low' | 'none' };
  logistics?: {
    shipping_modes_accepted?: ShippingMode[];
    weekend_receiving?: boolean;
  };
  deliverables_support?: {
    global?: {
      raw_formats?: string[];
      processed_outputs?: string[];
      max_package_level?: PackageLevel;
    };
    by_experiment_type?: Record<string, {
      raw_formats?: string[];
      processed_outputs?: string[];
      max_package_level?: PackageLevel;
    }>;
  };
}

export interface LabMatch {
  lab_id: string;
  lab_name: string;
  score: number;
  score_breakdown: Record<string, number>;
  flags: string[];
  deliverables_gaps: string[];
  estimated_tat_days?: number;
  pricing_band_usd?: { min?: number; max?: number };
}

export interface RoutingResult {
  top_matches: LabMatch[];
  all_matches_count: number;
  filtered_out: Record<string, string[]>;
}

export interface RoutingOptions {
  weights?: RoutingWeights;
  topK?: number;
  strictDeliverables?: boolean;
  regionPreference?: string;
  requiredShippingMode?: ShippingMode;
}

export enum FilterReason {
  EXPERIMENT_TYPE_NOT_SUPPORTED = 'experiment_type_not_supported',
  BSL_EXCEEDED = 'bsl_level_exceeded',
  HUMAN_SAMPLES_NOT_APPROVED = 'human_samples_not_approved',
  ANIMAL_SAMPLES_NOT_APPROVED = 'animal_samples_not_approved',
  HAZMAT_NOT_APPROVED = 'hazmat_not_approved',
  SHIPPING_MODE_NOT_SUPPORTED = 'shipping_mode_not_supported',
  LAB_UNAVAILABLE = 'lab_unavailable',
  DELIVERABLES_NOT_SUPPORTED = 'deliverables_not_supported',
}

// Utilities

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((val, key) => 
    val && typeof val === 'object' ? (val as Record<string, unknown>)[key] : undefined, obj);
}

// Hard filters

export function applyHardFilters(intake: Intake, lab: LabProfile, options: RoutingOptions): FilterReason[] {
  const reasons: FilterReason[] = [];
  const bslOrder: Record<BSLLevel, number> = { BSL1: 1, BSL2: 2 };

  if (!lab.capabilities.experiment_types.includes(intake.experiment_type)) {
    reasons.push(FilterReason.EXPERIMENT_TYPE_NOT_SUPPORTED);
  }

  if (bslOrder[intake.compliance.bsl || 'BSL1'] > bslOrder[lab.compliance.max_bsl || 'BSL1']) {
    reasons.push(FilterReason.BSL_EXCEEDED);
  }

  if (intake.compliance.human_derived_material && !lab.compliance.human_samples_approved) {
    reasons.push(FilterReason.HUMAN_SAMPLES_NOT_APPROVED);
  }

  if (intake.compliance.animal_derived_material && !lab.compliance.animal_samples_approved) {
    reasons.push(FilterReason.ANIMAL_SAMPLES_NOT_APPROVED);
  }

  if (intake.compliance.hazardous_chemicals && lab.compliance.hazardous_chemicals_approved === false) {
    reasons.push(FilterReason.HAZMAT_NOT_APPROVED);
  }

  if (options.requiredShippingMode) {
    const accepted = lab.logistics?.shipping_modes_accepted || ['AMBIENT'];
    if (!accepted.includes(options.requiredShippingMode)) {
      reasons.push(FilterReason.SHIPPING_MODE_NOT_SUPPORTED);
    }
  }

  if (lab.availability?.current_capacity === 'none' || lab.status !== 'active') {
    reasons.push(FilterReason.LAB_UNAVAILABLE);
  }

  if (options.strictDeliverables && checkDeliverablesGaps(intake, lab).length > 0) {
    reasons.push(FilterReason.DELIVERABLES_NOT_SUPPORTED);
  }

  return reasons;
}

// Deliverables

export function checkDeliverablesGaps(intake: Intake, lab: LabProfile): string[] {
  const gaps: string[] = [];
  const expType = intake.experiment_type;
  const labGlobal = lab.deliverables_support?.global || {};
  const labSpecific = lab.deliverables_support?.by_experiment_type?.[expType] || {};

  const labRawFormats = new Set([...(labGlobal.raw_formats || []), ...(labSpecific.raw_formats || [])]);
  const labProcessed = new Set([...(labGlobal.processed_outputs || []), ...(labSpecific.processed_outputs || [])]);

  const levelOrder: Record<PackageLevel, number> = { L0_RAW_ONLY: 0, L1_BASIC_QC: 1, L2_INTERPRETATION: 2 };
  const labMaxLevel = labSpecific.max_package_level || labGlobal.max_package_level || 'L0_RAW_ONLY';
  const requiredLevel = intake.deliverables.minimum_package_level || 'L0_RAW_ONLY';

  if (levelOrder[labMaxLevel] < levelOrder[requiredLevel]) {
    gaps.push(`package_level:${requiredLevel}`);
  }

  for (const fmt of intake.deliverables.raw_data_formats || []) {
    if (!labRawFormats.has(fmt)) gaps.push(`raw_format:${fmt}`);
  }

  for (const output of intake.deliverables.required_processed_outputs || []) {
    if (!labProcessed.has(output)) gaps.push(`processed_output:${output}`);
  }

  return gaps;
}

// Completeness

export function computeSpecCompleteness(intake: Intake): number {
  let score = 0, maxScore = 0;

  const coreFields: [string, number][] = [
    ['title', 1.0], ['hypothesis.statement', 2.0], ['hypothesis.null_hypothesis', 1.0],
    ['compliance.bsl', 1.0], ['turnaround_budget.budget_max_usd', 1.5],
    ['deliverables.minimum_package_level', 1.0], ['replicates', 0.5],
  ];

  for (const [path, weight] of coreFields) {
    maxScore += weight;
    if (getNested(intake as unknown as Record<string, unknown>, path) != null) score += weight;
  }

  const typeSections: Record<ExperimentType, string> = {
    SANGER_PLASMID_VERIFICATION: 'sanger', QPCR_EXPRESSION: 'qpcr',
    CELL_VIABILITY_IC50: 'cell_viability', ENZYME_INHIBITION_IC50: 'enzyme_inhibition',
    MICROBIAL_GROWTH_MATRIX: 'microbial_growth', MIC_MBC_ASSAY: 'mic_mbc',
    ZONE_OF_INHIBITION: 'zone_of_inhibition', CUSTOM: 'custom_protocol',
  };

  const sectionKey = typeSections[intake.experiment_type];
  if (sectionKey) {
    maxScore += 3.0;
    const section = intake[sectionKey] as Record<string, unknown> | undefined;
    if (section && typeof section === 'object') {
      const values = Object.values(section);
      const filled = values.filter(v => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)).length;
      score += 3.0 * (filled / Math.max(values.length, 1));
    }
  }

  maxScore += 1.0;
  if (intake.acceptance_criteria?.success_conditions?.length) score += 1.0;

  return maxScore > 0 ? score / maxScore : 0;
}

// Scoring

function scoreLab(intake: Intake, lab: LabProfile, weights: RoutingWeights, specCompleteness: number) {
  const breakdown: Record<string, number> = {};
  const flags: string[] = [];
  const expType = intake.experiment_type;

  // Menu fit
  const labMenuTags = new Set(lab.capabilities.menu_tags || []);
  const expTypeTags: Record<string, string[]> = {
    CELL_VIABILITY_IC50: ['viability_celltiter_glo', 'viability_mtt', 'viability_resazurin'],
    ENZYME_INHIBITION_IC50: ['enzyme_colorimetric', 'enzyme_fluorometric', 'enzyme_kinetics'],
    QPCR_EXPRESSION: ['qpcr_sybr', 'qpcr_taqman'],
    MIC_MBC_ASSAY: ['mic_broth_microdilution', 'mic_agar_dilution'],
    SANGER_PLASMID_VERIFICATION: ['sanger_standard', 'sanger_difficult_templates'],
  };

  const relevantTags = expTypeTags[expType] || [];
  const menuScore = relevantTags.length > 0
    ? relevantTags.filter(t => labMenuTags.has(t)).length / relevantTags.length
    : lab.capabilities.experiment_types.includes(expType) ? 1.0 : 0.0;
  breakdown.menu_fit = menuScore * weights.menuFit;

  // Turnaround
  let tatScore = 0.5;
  const desiredTat = intake.turnaround_budget.desired_turnaround_days;
  const labTat = lab.commercial_terms?.turnaround_days?.[expType]?.standard;
  if (desiredTat && labTat) {
    if (labTat <= desiredTat) tatScore = 1.0;
    else if (labTat <= desiredTat * 1.5) tatScore = 0.5;
    else { tatScore = 0.2; flags.push('turnaround_may_exceed_desired'); }
  }
  breakdown.turnaround_fit = tatScore * weights.turnaroundFit;

  breakdown.spec_completeness = specCompleteness * weights.specCompleteness;

  // Cost
  let costScore = 0.5;
  const budgetMax = intake.turnaround_budget.budget_max_usd;
  const pricing = lab.commercial_terms?.pricing_bands?.[expType];
  if (budgetMax && pricing) {
    const typical = pricing.typical_usd ?? pricing.min_usd ?? 0;
    if (typical <= budgetMax * 0.8) costScore = 1.0;
    else if (typical <= budgetMax) costScore = 0.7;
    else if (typical <= budgetMax * 1.25) { costScore = 0.3; flags.push('may_exceed_budget'); }
    else { costScore = 0.1; flags.push('likely_exceeds_budget'); }
  }
  breakdown.cost_fit = costScore * weights.costFit;

  // Quality
  let qualityScore = 0.5;
  const q = lab.quality_metrics;
  if (q) {
    const c: number[] = [];
    if (q.on_time_rate != null) c.push(q.on_time_rate);
    if (q.average_rating != null) c.push((q.average_rating - 1) / 4);
    if (q.rerun_rate != null) c.push(1 - q.rerun_rate);
    if (q.data_package_score != null) c.push(q.data_package_score);
    if (c.length > 0) qualityScore = c.reduce((a, b) => a + b, 0) / c.length;
    if ((q.rerun_rate ?? 0) > 0.15) flags.push('elevated_rerun_rate');
    if ((q.average_rating ?? 5) < 4.0) flags.push('below_average_rating');
  }
  breakdown.quality = qualityScore * weights.quality;

  // Logistics
  let logisticsScore = 0.7;
  if (lab.availability?.current_capacity === 'high') logisticsScore = 1.0;
  else if (lab.availability?.current_capacity === 'low') { logisticsScore = 0.4; flags.push('limited_capacity'); }
  if (lab.logistics?.weekend_receiving) logisticsScore = Math.min(1.0, logisticsScore + 0.1);
  breakdown.logistics = logisticsScore * weights.logistics;

  // Deliverables
  const gaps = checkDeliverablesGaps(intake, lab);
  const delivScore = gaps.length === 0 ? 1.0 : Math.max(0.0, 1.0 - gaps.length * 0.25);
  if (gaps.length > 0) flags.push('partial_deliverables_match');
  breakdown.deliverables_match = delivScore * weights.deliverablesMatch;

  return { total: Object.values(breakdown).reduce((a, b) => a + b, 0), breakdown, flags };
}

// Main router

export function routeIntake(intake: Intake, labs: LabProfile[], options: RoutingOptions = {}): RoutingResult {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const topK = options.topK ?? 3;
  const specCompleteness = computeSpecCompleteness(intake);

  const matches: LabMatch[] = [];
  const filteredOut: Record<string, string[]> = {};

  for (const lab of labs) {
    const filterReasons = applyHardFilters(intake, lab, options);
    if (filterReasons.length > 0) {
      filteredOut[lab.lab_id] = filterReasons;
      continue;
    }

    let { total, breakdown, flags } = scoreLab(intake, lab, weights, specCompleteness);

    if (options.regionPreference && lab.region === options.regionPreference) {
      total *= 1.1;
      breakdown.region_bonus = total * 0.1;
    }

    const tatInfo = lab.commercial_terms?.turnaround_days?.[intake.experiment_type];
    const pricingInfo = lab.commercial_terms?.pricing_bands?.[intake.experiment_type];

    matches.push({
      lab_id: lab.lab_id,
      lab_name: lab.name,
      score: Math.round(total * 1000) / 1000,
      score_breakdown: Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
      flags,
      deliverables_gaps: checkDeliverablesGaps(intake, lab),
      estimated_tat_days: tatInfo?.standard,
      pricing_band_usd: pricingInfo ? { min: pricingInfo.min_usd, max: pricingInfo.max_usd } : undefined,
    });
  }

  matches.sort((a, b) => b.score - a.score);

  return { top_matches: matches.slice(0, topK), all_matches_count: matches.length, filtered_out: filteredOut };
}

// Validation

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
  completeness?: number;
}

export function validateIntake(intake: Partial<Intake>): ValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  const warnings: Array<{ path: string; message: string }> = [];

  const required = ['experiment_type', 'title', 'hypothesis', 'compliance', 'deliverables', 'turnaround_budget'];
  for (const field of required) {
    if (!(field in intake)) errors.push({ path: `/${field}`, message: `Required field '${field}' is missing` });
  }

  if (!intake.hypothesis?.statement) {
    errors.push({ path: '/hypothesis/statement', message: 'Hypothesis statement is required' });
  }
  if (!intake.hypothesis?.null_hypothesis) {
    warnings.push({ path: '/hypothesis/null_hypothesis', message: 'Null hypothesis is recommended' });
  }
  if (!intake.turnaround_budget?.budget_max_usd) {
    errors.push({ path: '/turnaround_budget/budget_max_usd', message: 'Maximum budget is required' });
  }

  const completeness = intake.experiment_type ? computeSpecCompleteness(intake as Intake) : 0;
  if (completeness < 0.5) {
    warnings.push({ path: '/', message: `Intake completeness is low (${Math.round(completeness * 100)}%).` });
  }

  return { valid: errors.length === 0, errors, warnings, completeness };
}
