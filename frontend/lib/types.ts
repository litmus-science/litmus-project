export type ExperimentStatus =
  | "draft"
  | "pending_review"
  | "open"
  | "claimed"
  | "in_progress"
  | "completed"
  | "disputed"
  | "cancelled";

export type HypothesisStatus = "draft" | "used" | "archived";

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

export type RefundStatus = "processed" | "pending" | "none";

export interface CancelResponse {
  experiment_id: string;
  status: "cancelled";
  refund_amount_usd: number | null;
  refund_status: RefundStatus;
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
export type EdisonJobType =
  | "literature"
  | "molecules"
  | "analysis"
  | "precedent";

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

export type EdisonRunStatus = "pending" | "running" | "completed" | "failed";

// Edison Reasoning Trace types for streaming UI
export interface EdisonPlanStep {
  id: number;
  objective: string;
  rationale: string;
  status: string;
  result?: string;
  evaluation?: string;
}

export interface EdisonPaperResult {
  doc_id: string;
  title: string;
  authors: string[];
  journal?: string;
  year?: number;
  citation_count?: number;
  is_peer_reviewed: boolean;
  relevance_score?: number;
  url?: string;
}

export interface EdisonEvidence {
  doc_id: string;
  context: string;
  summary?: string;
  relevance?: number;
}

export interface EdisonReasoningTrace {
  current_step: string;
  steps_completed: string[];
  plan: EdisonPlanStep[];
  papers: EdisonPaperResult[];
  evidence: EdisonEvidence[];
  paper_count: number;
  relevant_papers: number;
  evidence_count: number;
  current_cost?: number;
  status_message?: string;
}

export interface EdisonRunStartResponse {
  run_id: string;
  status: EdisonRunStatus;
  intake_id: string;
}

export interface EdisonRunStatusResponse {
  run_id: string;
  status: EdisonRunStatus;
  result?: EdisonTranslateResponse;
  error?: string;
  reasoning_trace?: EdisonReasoningTrace;
  draft?: EdisonRunDraft;
}

export interface EdisonRunSummary {
  run_id: string;
  status: EdisonRunStatus;
  query: string;
  job_type: EdisonJobType;
  started_at: string;
  reasoning_trace?: EdisonReasoningTrace;
  experiment_type?: string;
  draft?: EdisonRunDraft;
}

export interface EdisonRunDraft {
  hypothesis?: string;
  null_hypothesis?: string;
  intake_id?: string;
}

export interface EdisonRunDraftUpdate {
  hypothesis?: string;
  null_hypothesis?: string;
  intake_id?: string;
}

export interface EdisonRunListResponse {
  runs: EdisonRunSummary[];
  pagination?: { total: number; cursor?: string; has_more: boolean };
}

export interface EdisonClearHistoryResponse {
  success: boolean;
  cleared: number;
}

// Hypothesis types
export interface HypothesisCreate {
  title: string;
  statement: string;
  null_hypothesis?: string;
  experiment_type: string;
  edison_agent?: string;
  edison_query?: string;
  edison_response?: EdisonTranslateResponse;
  intake_draft?: EdisonIntake;
}

export interface HypothesisUpdate {
  title?: string;
  statement?: string;
  null_hypothesis?: string;
  experiment_type?: string;
  intake_draft?: EdisonIntake;
}

export interface HypothesisResponse {
  id: string;
  user_id: string;
  title: string;
  statement: string;
  null_hypothesis?: string;
  experiment_type?: string;
  status: HypothesisStatus;
  edison_agent?: string;
  edison_query?: string;
  edison_response?: EdisonTranslateResponse;
  intake_draft?: EdisonIntake;
  created_at: string;
  updated_at: string;
  experiments_count: number;
}

export interface HypothesisListItem {
  id: string;
  title: string;
  statement: string;
  experiment_type?: string;
  status: HypothesisStatus;
  created_at: string;
}

export interface HypothesisListResponse {
  hypotheses: HypothesisListItem[];
  pagination?: { total: number; cursor?: string; has_more: boolean };
}

export interface HypothesisToExperimentRequest {
  budget_max_usd?: number;
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

// Lab Packet types

// ── New schema (v2) ──────────────────────────────────────────────────────────

export interface StudyParameters {
  test_compounds?: string;
  concentration_points?: string;
  replicates?: string;
  cell_line_or_organism?: string;
  incubation_duration?: string;
  plate_format?: string;
  total_wells_per_plate?: string;
}

export interface TestArticle {
  id: string;
  role: string;
  top_concentration?: string;
  dilution_scheme?: string;
  vehicle?: string;
}

export interface CellRequirements {
  cell_line?: string;
  passage_range?: string;
  mycoplasma_testing?: string;
  authentication?: string;
  culture_medium?: string;
  incubation_conditions?: string;
  confluency_at_seeding?: string;
}

export interface ProtocolStep {
  step: number;
  day?: string;
  title: string;
  procedure: string;
  critical_notes?: string;
}

export interface ReagentItem {
  item: string;
  specification?: string;
  supplier?: string;
  catalog_or_id?: string;
  link?: string;
}

export interface AcceptanceCriterion {
  parameter: string;
  requirement: string;
}

export interface Deliverable {
  name: string;
  description: string;
}

// ── Legacy schema (v1) ───────────────────────────────────────────────────────

export interface MaterialItem {
  item: string;
  supplier?: string;
  catalog_or_id?: string;
  link?: string;
  purpose?: string;
}

export interface ProtocolReference {
  title: string;
  use?: string;
}

export interface ExperimentDesign {
  overview?: string;
  work_packages: string[];
  controls: string[];
  sample_size_plan?: string;
  success_criteria: string[];
  estimated_timeline_weeks?: number;
}

export interface DirectCostEstimate {
  low: number;
  high: number;
  scope?: string;
}

export interface LabPacket {
  id: string;
  experiment_id: string;
  title: string;
  objective: string;
  // v2 fields
  study_parameters?: StudyParameters;
  test_articles?: TestArticle[];
  compound_supply_instructions?: string;
  cell_requirements?: CellRequirements;
  protocol_steps?: ProtocolStep[];
  reagents_and_consumables?: ReagentItem[];
  acceptance_criteria?: AcceptanceCriterion[];
  deliverables?: Deliverable[];
  sponsor_provided_inputs?: string[];
  // v1 fields (kept for backward compat)
  readouts?: string[];
  design?: ExperimentDesign;
  materials?: MaterialItem[];
  handoff_package_for_lab?: string[];
  // shared
  estimated_direct_cost_usd?: DirectCostEstimate;
  protocol_references?: ProtocolReference[];
  llm_model?: string;
  llm_cost_usd?: number;
  created_at: string;
  updated_at: string;
}

export interface RfqTimeline {
  rfq_issue_date: string;
  questions_due: string;
  quote_due: string;
  target_kickoff: string;
}

// Lab Matching types
export interface LabMatch {
  lab_id: string;
  lab_name: string;
  location: string;
  logo_initials: string;
  score: number;
  score_breakdown: {
    menu_fit: number;
    quality: number;
    cost_fit: number;
    turnaround_fit: number;
    deliverables_match: number;
    spec_completeness: number;
    logistics: number;
  };
  flags: string[];
  deliverables_gaps: string[];
  estimated_tat_days: number | null;
  pricing_band_usd: { min: number | null; max: number | null } | null;
  capabilities: string[];
  quality_metrics: {
    on_time_rate: number;
    average_rating: number;
    rerun_rate: number;
  };
}

export interface RoutingResult {
  experiment_id: string;
  experiment_type: string;
  top_matches: LabMatch[];
  all_matches_count: number;
  filtered_out: Record<string, string[]>;
}

export interface RfqPackage {
  id: string;
  rfq_id: string;
  experiment_id: string;
  title: string;
  objective: string;
  scope_of_work: string[];
  client_provided_inputs: string[];
  required_deliverables: string[];
  acceptance_criteria: string[];
  quote_requirements: string[];
  timeline?: RfqTimeline;
  target_operator_ids: string[];
  status: string;
  created_at: string;
  updated_at: string;
}
