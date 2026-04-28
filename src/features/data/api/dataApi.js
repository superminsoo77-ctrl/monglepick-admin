/**
 * 데이터 관리 탭 API 호출 함수.
 * 모든 엔드포인트는 DATA_ADMIN_ENDPOINTS 상수를 사용.
 * 영화 CRUD 및 파이프라인 트리거는 agentApi (FastAPI Agent :8000) 사용.
 *
 * @service Agent - FastAPI AI Agent (:8000)
 *
 * 2026-04-15: Agent admin_data.py 의 실제 라우트/페이로드 스키마와 정렬.
 *   - runPipeline 요청 본문: `{task, options}` → `{task_code, args[]}` 로 변환.
 *   - cancelPipeline 은 `{job_id}` 를 명시적으로 받음 (Agent 가 필수 필드로 요구).
 *   - SSE URL 에 반드시 `job_id` 쿼리 파라미터를 포함.
 *   - fetchPipelineStatus/fetchPipelineCheckpoint/fetchMovieDbStatus 는 Agent 미제공.
 *       · fetchPipelineStatus 는 `/pipeline/history?status=RUNNING` 로 대체 (현재 진행 중 작업 1건 반환).
 *       · checkpoint/db-status 는 제거 (UI 에서도 호출 제거).
 */

import { agentApi } from '@/shared/api/axiosInstance';
import { DATA_ADMIN_ENDPOINTS } from '@/shared/constants/api';

/* ── 데이터 현황 ── */

/**
 * 5DB(MySQL/Qdrant/Neo4j/ES/Redis) 전체 건수 카드.
 * GET /admin/data/overview
 */
export function fetchDataOverview() {
  return agentApi.get(DATA_ADMIN_ENDPOINTS.OVERVIEW);
}

/**
 * 소스별(TMDB/KOBIS/KMDb 등) 영화 분포.
 * GET /admin/data/distribution
 */
export function fetchDataDistribution() {
  return agentApi.get(DATA_ADMIN_ENDPOINTS.DISTRIBUTION);
}

/**
 * 데이터 품질 지표 (NULL 비율/중복/평균 평점).
 * GET /admin/data/quality
 */
export function fetchDataQuality() {
  return agentApi.get(DATA_ADMIN_ENDPOINTS.QUALITY);
}

/* 레거시 별칭 — 기존 import 호환용 */
export const fetchDataStats = fetchDataOverview;
export const fetchDataHealth = fetchDataDistribution;

/* ── 영화 데이터 CRUD ── */

/** 영화 목록 조회 (검색/필터/페이징). */
export function fetchMovies(params) {
  return agentApi.get(DATA_ADMIN_ENDPOINTS.MOVIES, { params });
}

/** 영화 상세 조회 (5DB 통합). */
export function fetchMovieDetail(id) {
  return agentApi.get(DATA_ADMIN_ENDPOINTS.MOVIE_DETAIL(id));
}

/**
 * 영화 신규 등록 (Agent MySQL INSERT).
 * 검색 인덱스(Qdrant/Neo4j/ES)는 파이프라인 실행 시 반영.
 */
export function createMovie(data) {
  return agentApi.post(DATA_ADMIN_ENDPOINTS.MOVIES, data);
}

/** 영화 정보 수정 (4DB 동기 반영 베스트-에포트). */
export function updateMovie(id, data) {
  return agentApi.put(DATA_ADMIN_ENDPOINTS.MOVIE_DETAIL(id), data);
}

/** 영화 삭제 (4DB 동기 삭제 베스트-에포트). */
export function deleteMovie(id) {
  return agentApi.delete(DATA_ADMIN_ENDPOINTS.MOVIE_DETAIL(id));
}

/* ── 파이프라인 ── */

/**
 * 실행 가능한 파이프라인 작업 목록 (9건).
 * GET /admin/pipeline
 * @returns {Promise<{tasks: Array<{code, name, description, category}>}>}
 */
export function fetchPipelineTasks() {
  return agentApi.get(DATA_ADMIN_ENDPOINTS.PIPELINE_TASKS);
}

/**
 * 데이터 수집/임베딩 파이프라인 실행 트리거.
 *
 * Agent 는 `{task_code: string, args: string[]}` 스키마만 허용하므로
 * UI 쪽에서 사용하는 옵션 플래그(clear_db, resume)를 CLI 인자로 변환한다.
 *
 * @param {{task_code: string, args?: string[]}} payload
 * @returns {Promise<{job_id: string, task_code: string, status: string, started_at: string, message: string}>}
 */
export function runPipeline({ task_code, args = [] }) {
  return agentApi.post(DATA_ADMIN_ENDPOINTS.PIPELINE_RUN, {
    task_code,
    args,
  });
}

/**
 * 실행 중인 파이프라인 취소 (SIGTERM).
 * Agent 는 `{job_id}` 를 본문으로 요구한다.
 * @param {string} jobId
 */
export function cancelPipeline(jobId) {
  return agentApi.post(DATA_ADMIN_ENDPOINTS.PIPELINE_CANCEL, { job_id: jobId });
}

/**
 * 파이프라인 실행 이력 조회 (페이징).
 * @param {{page?: number, size?: number, status?: 'RUNNING'|'SUCCESS'|'FAILED'|'CANCELLED'}} params
 */
export function fetchPipelineHistory(params) {
  return agentApi.get(DATA_ADMIN_ENDPOINTS.PIPELINE_HISTORY, { params });
}

/**
 * 파이프라인 실행 통계 (성공/실패/취소 카운트 + 평균 실행 시간).
 * GET /admin/pipeline/stats
 */
export function fetchPipelineStats() {
  return agentApi.get(DATA_ADMIN_ENDPOINTS.PIPELINE_STATS);
}

/**
 * 현재 실행 중(Active)인 파이프라인 작업을 조회한다.
 *
 * Agent 는 단일 `/pipeline/status` 엔드포인트를 제공하지 않고 대신
 * `/pipeline/history?status=RUNNING` 응답의 첫 레코드가 in-memory RUNNING 작업이다.
 * UI 는 이를 "현재 상태 카드"에 매핑해 사용한다.
 *
 * @returns {Promise<null | {job_id, task_code, task_name, status, started_at}>}
 */
export async function fetchActivePipelineJob() {
  const result = await fetchPipelineHistory({ page: 0, size: 1, status: 'RUNNING' });
  return result?.items?.[0] ?? null;
}

/** 실패한 파이프라인 작업 재시도. */
export function retryFailedPipeline() {
  return agentApi.post(DATA_ADMIN_ENDPOINTS.PIPELINE_RETRY);
}

/**
 * 파이프라인 SSE 로그 스트림 URL 반환 (EventSource 로 직접 구독).
 *
 * Agent (`/admin/pipeline/logs`) 는 `job_id` 쿼리 파라미터를 필수로 요구한다.
 * jobId 없이 호출하면 422 이므로 runPipeline 응답에서 받은 job_id 를 반드시 전달한다.
 *
 * @param {string} jobId - 작업 ID (runPipeline 응답의 job_id)
 * @returns {string} SSE 엔드포인트 URL (쿼리 포함)
 */
export function getPipelineLogUrl(jobId) {
  return `${DATA_ADMIN_ENDPOINTS.PIPELINE_LOGS}?job_id=${encodeURIComponent(jobId)}`;
}
