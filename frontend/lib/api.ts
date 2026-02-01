import { getToken } from "./auth";
import type {
  User,
  Token,
  Experiment,
  ExperimentListResponse,
  ExperimentResults,
  Template,
  TemplateListItem,
  Job,
  ClaimResponse,
  SubmitResultsResponse,
} from "./types";

export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
  severity: string;
  suggestion?: string;
};

export type TranslationResult = {
  provider: string;
  format: string;
  protocol?: unknown;
  protocol_readable: string;
  success: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  metadata: Record<string, unknown>;
};

export type TranslateResponse = {
  translations: Record<string, TranslationResult>;
  experiment_type: string;
  title?: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    // Handle both string and object detail formats
    let message = "Request failed";
    if (typeof error.detail === "string") {
      message = error.detail;
    } else if (error.detail?.message) {
      message = error.detail.message;
    } else if (error.message) {
      message = error.message;
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

// Auth
export async function register(data: {
  email: string;
  password: string;
  name?: string;
  organization?: string;
}): Promise<User> {
  return request<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function login(email: string, password: string): Promise<Token> {
  return request<Token>("/auth/token", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(): Promise<User> {
  return request<User>("/auth/me");
}

// Experiments
export async function listExperiments(params?: {
  status?: string;
  limit?: number;
  cursor?: string;
}): Promise<ExperimentListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  const query = searchParams.toString();
  return request<ExperimentListResponse>(`/experiments${query ? `?${query}` : ""}`);
}

export async function getExperiment(id: string): Promise<Experiment> {
  return request<Experiment>(`/experiments/${id}`);
}

export async function createExperiment(data: Record<string, unknown>): Promise<{
  experiment_id: string;
  status: string;
  created_at: string;
  estimated_cost_usd?: number;
  estimated_turnaround_days?: number;
}> {
  return request(`/experiments`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function cancelExperiment(id: string): Promise<{ status: string }> {
  return request(`/experiments/${id}/cancel`, { method: "POST" });
}

// Results
export async function getResults(experimentId: string): Promise<ExperimentResults> {
  return request<ExperimentResults>(`/experiments/${experimentId}/results`);
}

export async function approveResults(
  experimentId: string,
  data: { rating?: number; feedback?: string }
): Promise<{ experiment_id: string; status: string; payment_released: boolean }> {
  return request(`/experiments/${experimentId}/approve`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function disputeResults(
  experimentId: string,
  data: { reason: string; description: string; evidence_urls?: string[] }
): Promise<{ dispute_id: string; experiment_id: string; status: string }> {
  return request(`/experiments/${experimentId}/dispute`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Templates
export async function listTemplates(params?: {
  category?: string;
  bsl_level?: string;
}): Promise<{ templates: TemplateListItem[] }> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set("category", params.category);
  if (params?.bsl_level) searchParams.set("bsl_level", params.bsl_level);
  const query = searchParams.toString();
  return request(`/templates${query ? `?${query}` : ""}`);
}

export async function getTemplate(id: string): Promise<Template> {
  return request<Template>(`/templates/${id}`);
}

// Operator endpoints
export async function listJobs(params?: {
  category?: string;
  bsl_level?: string;
}): Promise<{ jobs: Job[] }> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set("category", params.category);
  if (params?.bsl_level) searchParams.set("bsl_level", params.bsl_level);
  const query = searchParams.toString();
  return request(`/operator/jobs${query ? `?${query}` : ""}`);
}

export async function claimJob(
  experimentId: string,
  data: {
    equipment_confirmation: boolean;
    authorization_confirmation: boolean;
    estimated_start_date: string;
    notes?: string;
  }
): Promise<ClaimResponse> {
  return request(`/operator/jobs/${experimentId}/claim`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function submitResults(
  experimentId: string,
  data: {
    hypothesis_supported: boolean;
    confidence_level?: string;
    summary?: string;
    measurements: Array<{
      metric: string;
      value: number;
      unit?: string;
      condition?: string;
      replicate?: number;
    }>;
    statistics?: {
      test_used?: string;
      p_value?: number;
      effect_size?: number;
    };
    documentation: {
      photos: Array<{ step: number; image_base64: string; caption?: string }>;
      lab_notebook_base64?: string;
    };
    notes?: string;
  }
): Promise<SubmitResultsResponse> {
  return request(`/operator/jobs/${experimentId}/submit`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Cost estimate
export async function estimateCost(data: Record<string, unknown>): Promise<{
  estimated_cost_usd: { low: number; typical: number; high: number };
  estimated_turnaround_days: { standard: number; expedited?: number };
  operator_availability: string;
}> {
  return request(`/estimate`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Config
export async function getConfig(): Promise<{
  auth_disabled: boolean;
  debug_mode: boolean;
}> {
  console.log("[Litmus] Fetching config from:", `${API_BASE}/config`);
  const response = await fetch(`${API_BASE}/config`);
  return response.json();
}

// Cloud Lab - LLM Interpretation
export interface LLMInterpretRequest {
  experiment_type: string;
  title: string;
  hypothesis: string;
  notes?: string;
  existing_intake?: Record<string, unknown>;
}

export interface LLMInterpretResponse {
  success: boolean;
  enriched_intake: Record<string, unknown>;
  suggestions: string[];
  warnings: string[];
  confidence: number;
  error?: string;
}

export async function interpretExperiment(
  data: LLMInterpretRequest
): Promise<LLMInterpretResponse> {
  return request<LLMInterpretResponse>("/cloud-labs/interpret", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Cloud Lab - Translation
export async function translateToCloudLab(data: {
  intake: Record<string, unknown>;
  provider?: string;
  use_llm?: boolean;
}): Promise<TranslateResponse> {
  return request<TranslateResponse>("/cloud-labs/translate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
