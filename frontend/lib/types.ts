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

export interface EdisonTranslateResponse {
  success: boolean;
  experiment_type: string;
  intake: Record<string, unknown>;
  translations?: Record<string, unknown>;
  suggestions: string[];
  warnings: string[];
  error?: string;
}
