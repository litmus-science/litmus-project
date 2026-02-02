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
  EdisonJobType,
  EdisonTranslateResponse,
  EdisonRunStatus,
  EdisonRunStartResponse,
  EdisonRunStatusResponse,
  EdisonRunSummary,
  EdisonRunListResponse,
  EdisonRunDraft,
  EdisonRunDraftUpdate,
  EdisonClearHistoryResponse,
  HypothesisCreate,
  HypothesisUpdate,
  HypothesisResponse,
  HypothesisListResponse,
  HypothesisToExperimentRequest,
  ExperimentCreatedResponse,
} from "./types";

export type RateLimitInfo = {
  limit?: string;
  remaining?: string;
  reset?: string;
};

type RequestOptions = {
  signal?: AbortSignal;
};

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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public rateLimit?: RateLimitInfo
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const headers: HeadersInit = isFormData
    ? { ...options.headers }
    : {
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

  const rateLimit: RateLimitInfo = {
    limit: response.headers.get("X-RateLimit-Limit") ?? undefined,
    remaining: response.headers.get("X-RateLimit-Remaining") ?? undefined,
    reset: response.headers.get("X-RateLimit-Reset") ?? undefined,
  };

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: "Request failed" }))) as unknown;
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === "object" && value !== null;
    let message = "Request failed";
    if (typeof error === "string") {
      message = error;
    } else if (isRecord(error)) {
      const detail = error.detail;
      if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0];
        if (isRecord(first)) {
          const msg = typeof first.msg === "string" ? first.msg : undefined;
          const loc = Array.isArray(first.loc)
            ? first.loc.map((part) => String(part)).join(".")
            : undefined;
          message = loc && msg ? `${loc}: ${msg}` : msg || message;
        }
      } else if (isRecord(detail) && typeof detail.message === "string") {
        message = detail.message;
      } else if (typeof error.message === "string") {
        message = error.message;
      }
    }
    throw new ApiError(response.status, message, rateLimit);
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
export async function estimateCost(
  data: Record<string, unknown>,
  options?: RequestOptions
): Promise<{
  estimated_cost_usd: { low: number; typical: number; high: number };
  estimated_turnaround_days: { standard: number; expedited?: number };
  operator_availability: string;
}> {
  return request(`/estimate`, {
    method: "POST",
    body: JSON.stringify(data),
    signal: options?.signal,
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

// Edison - Hypothesis Generation
export async function generateHypothesis(data: {
  query: string;
  job_type: EdisonJobType;
  context?: string;
  files?: File[];
}): Promise<EdisonTranslateResponse> {
  if (data.files && data.files.length > 0) {
    const formData = new FormData();
    formData.append("query", data.query);
    formData.append("job_type", data.job_type);
    if (data.context) {
      formData.append("context", data.context);
    }
    for (const file of data.files) {
      formData.append("files", file);
    }
    return request<EdisonTranslateResponse>("/cloud-labs/edison", {
      method: "POST",
      body: formData,
    });
  }
  return request<EdisonTranslateResponse>("/cloud-labs/edison", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function startEdisonRun(data: {
  query: string;
  job_type: EdisonJobType;
  context?: string;
  files?: File[];
}): Promise<EdisonRunStartResponse> {
  if (data.files && data.files.length > 0) {
    const formData = new FormData();
    formData.append("query", data.query);
    formData.append("job_type", data.job_type);
    if (data.context) {
      formData.append("context", data.context);
    }
    for (const file of data.files) {
      formData.append("files", file);
    }
    return request<EdisonRunStartResponse>("/cloud-labs/edison/start", {
      method: "POST",
      body: formData,
    });
  }
  return request<EdisonRunStartResponse>("/cloud-labs/edison/start", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getEdisonRunStatus(runId: string): Promise<EdisonRunStatusResponse> {
  return request<EdisonRunStatusResponse>(`/cloud-labs/edison/status/${runId}`);
}

export async function getActiveEdisonRun(): Promise<EdisonRunSummary | null> {
  return request<EdisonRunSummary | null>("/cloud-labs/edison/active");
}

export async function listEdisonRuns(params?: {
  status?: EdisonRunStatus;
  limit?: number;
}): Promise<EdisonRunListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  const query = searchParams.toString();
  return request<EdisonRunListResponse>(`/cloud-labs/edison/runs${query ? `?${query}` : ""}`);
}

export async function updateEdisonRunDraft(
  runId: string,
  data: EdisonRunDraftUpdate
): Promise<EdisonRunDraft> {
  return request<EdisonRunDraft>(`/cloud-labs/edison/runs/${runId}/draft`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function clearEdisonHistory(): Promise<EdisonClearHistoryResponse> {
  return request<EdisonClearHistoryResponse>("/cloud-labs/edison/runs/clear-history", {
    method: "POST",
  });
}

// Hypotheses
export async function createHypothesis(
  data: HypothesisCreate
): Promise<HypothesisResponse> {
  return request<HypothesisResponse>("/hypotheses", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listHypotheses(params?: {
  status?: string;
  experiment_type?: string;
  limit?: number;
  cursor?: string;
}, options?: RequestOptions): Promise<HypothesisListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.experiment_type) searchParams.set("experiment_type", params.experiment_type);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  const query = searchParams.toString();
  return request<HypothesisListResponse>(`/hypotheses${query ? `?${query}` : ""}`, {
    signal: options?.signal,
  });
}

export async function getHypothesis(
  id: string,
  options?: RequestOptions
): Promise<HypothesisResponse> {
  return request<HypothesisResponse>(`/hypotheses/${id}`, {
    signal: options?.signal,
  });
}

export async function updateHypothesis(
  id: string,
  data: HypothesisUpdate
): Promise<HypothesisResponse> {
  return request<HypothesisResponse>(`/hypotheses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteHypothesis(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/hypotheses/${id}`, {
    method: "DELETE",
  });
}

export async function hypothesisToExperiment(
  id: string,
  data: HypothesisToExperimentRequest
): Promise<ExperimentCreatedResponse> {
  return request<ExperimentCreatedResponse>(`/hypotheses/${id}/to-experiment`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
