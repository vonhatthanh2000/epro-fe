/**
 * Backend routes relative to VITE_API_BASE_URL. Adjust to match your API.
 */
export const API_ROUTES = {
  login: '/auth/login',
  register: '/auth/register',
  me: '/users/me',
  switchProfile: '/auth/switch-profile',
  correctSentence: '/sentence/correct',
  sentenceHistory: '/sentence/history',
  analyzeSentences: '/sentence/analyze',
  sentenceAnalyses: '/sentence/analyses',
  gradeWriting: '/writing/grade',
  youtubeAnalyze: '/youtube/analyze',
  youtubeHistory: '/youtube/history',
  profiles: '/profiles',
  speechEvaluate: '/speech/evaluate',
  speechHistory: '/speech/history',
  shadowingAttempt: '/shadowing/attempt',
  shadowingHistory: '/shadowing/history',
  shadowingStats: '/shadowing/stats',
} as const;

/** GET sentence analysis list: `/v1/sentence/analyses` */
export function sentenceAnalysesPath(): string {
  return API_ROUTES.sentenceAnalyses;
}

/** GET one sentence analysis by id: `/v1/sentence/analyses/{analysis_id}` */
export function sentenceAnalysisDetailPath(analysisId: string): string {
  return `${API_ROUTES.sentenceAnalyses}/${encodeURIComponent(analysisId)}`;
}

export function profileDetailPath(profileId: string): string {
  return `${API_ROUTES.profiles}/${encodeURIComponent(profileId)}`;
}

/** GET one sentence analysis by id: `/sentence/{sentence_id}` */
export function sentenceDetailPath(sentenceId: string): string {
  return `/sentence/${encodeURIComponent(sentenceId)}`;
}

/** GET one YouTube analysis by id: `/youtube/{analysis_id}` */
export function youtubeAnalysisDetailPath(analysisId: string): string {
  return `/youtube/${encodeURIComponent(analysisId)}`;
}

/** GET one speech recording by id: `/speech/{recording_id}` */
export function speechDetailPath(recordingId: string): string {
  return `/speech/${encodeURIComponent(recordingId)}`;
}

/** GET one shadowing attempt by id: `/shadowing/{attempt_id}` */
export function shadowingDetailPath(attemptId: string): string {
  return `/shadowing/${encodeURIComponent(attemptId)}`;
}

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Base URL from env. Empty string means same-origin (e.g. Vite proxy or static hosting).
 */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== 'string') return '';
  return trimTrailingSlashes(raw.trim());
}

/**
 * Absolute URL for an API path. `path` should start with /.
 */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/**
 * Legacy: Previously used to add X-Profile-Id header.
 * Now profile is handled via token switching (auth/switch-profile).
 * This function is kept for backwards compatibility but no longer adds headers.
 */
export function withProfileId(
  _profileId: string | null | undefined,
  init: RequestInit = {}
): RequestInit {
  // Profile is now handled via token switching, no need for header
  return init;
}

/** localStorage key for the JWT / access token from login & register. */
const TOKEN_KEY = 'access_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** If the API wraps data in `{ data: ... }`, return the inner object. */
export function unwrapApiPayload(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (o.data != null && typeof o.data === 'object') {
    return o.data as Record<string, unknown>;
  }
  return o;
}

function buildJsonHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  if (
    init.body != null &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

/** Login / register: no `Authorization` header (avoids sending a stale token). */
export async function apiFetchPublic(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = buildJsonHeaders(init);
  return fetch(apiUrl(path), { ...init, headers });
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = buildJsonHeaders(init);
  const token = getStoredToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(apiUrl(path), { ...init, headers });
}

// ==================== YouTube analysis (timed transcript / shadowing) ====================

/** One timed sentence line from `GET/POST` YouTube analysis (`transcript_segments`). */
export type TranscriptSegment = {
  text: string;
  start_time: number;
  end_time: number;
};

// ==================== Shadowing API Types ====================

export interface WordDifference {
  expected: string;
  actual: string;
}

export interface ShadowingEvaluation {
  similarity_score: number;
  differences: WordDifference[];
  feedback: string;
}

export interface ShadowingAttemptResponse {
  id: string; // Composite format: {profile_id}:{youtube_gem_id}:{target_sentence_index}
  created_at: string;
  updated_at?: string; // Present when re-practicing (updates existing record)
  youtube_gem_id: string;
  target_sentence: string;
  target_sentence_index: number; // Now required (part of composite key)
  audio_url: string;
  audio_duration_seconds: number | null;
  user_transcript: string;
  evaluation: ShadowingEvaluation;
}

export interface ShadowingHistoryItem {
  id: string; // Composite format
  created_at: string;
  youtube_gem_id: string;
  target_sentence: string;
  target_sentence_index: number; // Now required
  audio_url: string;
  audio_duration_seconds: number | null;
  similarity_score: number | null;
}

export interface ShadowingHistoryResponse {
  items: ShadowingHistoryItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ShadowingStatsResponse {
  youtube_gem_id: string;
  total_attempts: number;
  sentences_practiced: number;
  average_similarity_score: number | null;
  best_attempt_id: string | null;
  best_similarity_score: number | null;
  progress_by_sentence: Array<{
    sentence_index: number;
    attempts: number;
    best_score: number;
  }>;
}

// ==================== Shadowing API Service Functions ====================

/**
 * Submit a shadowing attempt for a YouTube sentence.
 * Audio file is uploaded and evaluated against the target sentence.
 */
export async function submitShadowingAttempt(
  audioFile: File,
  youtubeGemId: string,
  targetSentence: string,
  targetSentenceIndex?: number,
  durationSeconds?: number
): Promise<ShadowingAttemptResponse> {
  const formData = new FormData();
  formData.append('audio', audioFile);
  formData.append('youtube_gem_id', youtubeGemId);
  formData.append('target_sentence', targetSentence);

  if (targetSentenceIndex !== undefined) {
    formData.append('target_sentence_index', targetSentenceIndex.toString());
  }
  if (durationSeconds !== undefined) {
    formData.append('duration_seconds', durationSeconds.toString());
  }

  // For FormData, we must NOT set Content-Type header - browser sets it with boundary
  const headers = new Headers();
  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // Content-Type is intentionally NOT set - browser handles it

  const response = await fetch(apiUrl(API_ROUTES.shadowingAttempt), {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to submit shadowing attempt');
  }

  const data = await response.json();
  const unwrapped = unwrapApiPayload(data);
  return (unwrapped || data) as ShadowingAttemptResponse;
}

/**
 * Get paginated list of shadowing attempts.
 * Optionally filter by youtube_gem_id.
 */
export async function getShadowingHistory(
  youtubeGemId?: string,
  page = 0,
  pageSize = 20
): Promise<ShadowingHistoryResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (youtubeGemId) {
    params.append('youtube_gem_id', youtubeGemId);
  }

  const response = await apiFetch(`${API_ROUTES.shadowingHistory}?${params}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch shadowing history');
  }

  const data = await response.json();
  const unwrapped = unwrapApiPayload(data);
  return (unwrapped || data) as ShadowingHistoryResponse;
}

/**
 * Get detailed shadowing attempt by ID.
 */
export async function getShadowingDetail(attemptId: string): Promise<ShadowingAttemptResponse> {
  const response = await apiFetch(shadowingDetailPath(attemptId), {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch shadowing details');
  }

  const data = await response.json();
  const unwrapped = unwrapApiPayload(data);
  return (unwrapped || data) as ShadowingAttemptResponse;
}

/**
 * Get shadowing stats for a specific YouTube video.
 */
export async function getShadowingStats(
  youtubeGemId: string
): Promise<ShadowingStatsResponse> {
  const response = await apiFetch(
    `${API_ROUTES.shadowingStats}/${encodeURIComponent(youtubeGemId)}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch shadowing stats');
  }

  const data = await response.json();
  const unwrapped = unwrapApiPayload(data);
  return (unwrapped || data) as ShadowingStatsResponse;
}
