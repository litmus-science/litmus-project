export type ExperimentStatus =
  | "draft"
  | "pending_review"
  | "open"
  | "claimed"
  | "in_progress"
  | "completed"
  | "disputed"
  | "cancelled";

export type PaymentStatus = "pending" | "escrowed" | "released" | "refunded";

export type ConfidenceLevel = "high" | "medium" | "low" | "inconclusive";

export type DisputeReason =
  | "results_incomplete"
  | "results_incorrect"
  | "protocol_not_followed"
  | "documentation_insufficient"
  | "other";

export interface User {
  id: string;
  email: string;
  name?: string;
  organization?: string;
  role: string;
  rate_limit_tier: string;
  created_at: string;
  api_key?: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface OperatorInfo {
  id: string;
  reputation_score: number;
  completed_experiments: number;
}

export interface CostInfo {
  estimated_usd?: number;
  final_usd?: number;
  payment_status: PaymentStatus;
}

export interface Experiment {
  id: string;
  status: ExperimentStatus;
  created_at: string;
  updated_at: string;
  claimed_at?: string;
  completed_at?: string;
  specification: Record<string, unknown>;
  operator?: OperatorInfo;
  cost: CostInfo;
}

export interface ExperimentListResponse {
  experiments: Experiment[];
  pagination: {
    total: number;
    cursor?: string;
    has_more: boolean;
  };
}

export interface Measurement {
  metric: string;
  value: number;
  unit?: string;
  condition?: string;
  replicate?: number;
}

export interface Statistics {
  test_used?: string;
  p_value?: number;
  effect_size?: number;
  confidence_interval?: { low: number; high: number };
}

export interface RawDataFile {
  name: string;
  format?: string;
  url: string;
  checksum_sha256?: string;
}

export interface Photo {
  step: number;
  url: string;
  timestamp?: string;
}

export interface Documentation {
  photos: Photo[];
  lab_notebook_url?: string;
}

export interface ExperimentResults {
  experiment_id: string;
  status: ExperimentStatus;
  hypothesis_supported?: boolean;
  confidence_level?: ConfidenceLevel;
  summary?: string;
  structured_data?: {
    measurements: Measurement[];
    statistics?: Statistics;
  };
  raw_data_files: RawDataFile[];
  documentation?: Documentation;
  operator_notes?: string;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  category: string;
  bsl_level: string;
  version: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    default?: string;
    description?: string;
  }>;
  equipment_required: string[];
  typical_materials: Array<{ name: string; amount?: string }>;
  estimated_duration_hours?: number;
  estimated_cost_usd?: { low: number; high: number };
  protocol_steps: Array<{ step: number; description: string }>;
}

export interface TemplateListItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  bsl_level: string;
  estimated_cost_range?: string;
}

export interface Job {
  experiment_id: string;
  title: string;
  category: string;
  budget_usd: number;
  deadline?: string;
  bsl_level: string;
  equipment_required: string[];
  posted_at: string;
}

export interface ClaimResponse {
  experiment_id: string;
  claimed_at: string;
  deadline: string;
}

export interface SubmitResultsResponse {
  experiment_id: string;
  status: string;
  submitted_at: string;
}

// Edison types
export type EdisonJobType = "literature" | "molecules" | "analysis" | "precedent";

export interface EdisonPriorWork {
  type: "doi" | "pmid" | "url" | "litmus_experiment";
  identifier: string;
  relevance?: string;
}

export interface EdisonHypothesis {
  statement: string;
  null_hypothesis?: string;
  why_interesting?: string;
  prior_work?: EdisonPriorWork[];
}

export interface EdisonCompliance {
  bsl: "BSL1" | "BSL2";
  human_derived_material?: boolean;
  animal_derived_material?: boolean;
  hazardous_chemicals?: boolean;
  sds_attached?: boolean;
  export_control_or_sanctions_risk?: boolean;
}

export interface EdisonTurnaroundBudget {
  budget_max_usd: number;
  desired_turnaround_days?: number;
  hard_deadline?: string;
  priority?: "standard" | "expedited" | "urgent";
  budget_flexibility?: "strict" | "flexible_10" | "flexible_25";
}

export interface EdisonDeliverables {
  minimum_package_level: "L0_RAW_ONLY" | "L1_BASIC_QC" | "L2_INTERPRETATION";
  raw_data_formats?: string[];
  required_processed_outputs?: string[];
  photo_documentation?: string;
  lab_notebook_scan?: boolean;
}

export interface EdisonMetadata {
  notes?: string;
  confidence?: number;
  tags?: string[];
  submitter_type?: "human" | "ai_agent" | "automated_pipeline";
  agent_identifier?: string;
  [key: string]: unknown;
}

export interface EdisonIntake {
  experiment_type: string;
  title: string;
  hypothesis: EdisonHypothesis;
  compliance: EdisonCompliance;
  turnaround_budget?: EdisonTurnaroundBudget;
  deliverables?: EdisonDeliverables;
  privacy?: "open" | "delayed_6mo" | "delayed_12mo" | "private";
  metadata?: EdisonMetadata;
  replicates?: {
    technical?: number;
    biological?: number;
  };
  materials_provided?: Array<Record<string, unknown>>;
  sanger?: Record<string, unknown>;
  qpcr?: Record<string, unknown>;
  cell_viability?: Record<string, unknown>;
  enzyme_inhibition?: Record<string, unknown>;
  microbial_growth?: Record<string, unknown>;
  mic_mbc?: Record<string, unknown>;
  zone_of_inhibition?: Record<string, unknown>;
  custom_protocol?: Record<string, unknown>;
}

export interface EdisonTranslationResult {
  provider?: string;
  format?: string;
  protocol_readable?: string;
  success?: boolean;
  errors?: Array<{ message: string }>;
  warnings?: Array<{ message: string }>;
}

export interface EdisonTranslateResponse {
  success: boolean;
  experiment_type: string;
  intake: EdisonIntake;
  translations?: Record<string, EdisonTranslationResult>;
  suggestions: string[];
  warnings: string[];
  error?: string;
}

// Hypothesis types
export interface HypothesisCreate {
  title: string;
  statement: string;
  null_hypothesis?: string;
  experiment_type: string;
  edison_agent?: string;
  edison_query?: string;
  edison_response?: Record<string, unknown>;
  intake_draft?: Record<string, unknown>;
}

export interface HypothesisUpdate {
  title?: string;
  statement?: string;
  null_hypothesis?: string;
  experiment_type?: string;
  intake_draft?: Record<string, unknown>;
}

export interface HypothesisResponse {
  id: string;
  user_id: string;
  title: string;
  statement: string;
  null_hypothesis?: string;
  experiment_type?: string;
  status: string;
  edison_agent?: string;
  edison_query?: string;
  edison_response?: Record<string, unknown>;
  intake_draft?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  experiments_count: number;
}

export interface HypothesisListItem {
  id: string;
  title: string;
  statement: string;
  experiment_type?: string;
  status: string;
  created_at: string;
}

export interface HypothesisListResponse {
  hypotheses: HypothesisListItem[];
  pagination: { total: number; cursor?: string; has_more: boolean };
}

export interface HypothesisToExperimentRequest {
  budget_max_usd: number;
  bsl_level?: string;
  privacy?: string;
  title_override?: string;
}

export interface ExperimentCreatedResponse {
  experiment_id: string;
  status: string;
  created_at: string;
  estimated_cost_usd?: number;
  estimated_turnaround_days?: number;
}
