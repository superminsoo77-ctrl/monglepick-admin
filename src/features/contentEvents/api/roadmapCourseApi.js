/**
 * 운영 도구 — 도장깨기(RoadmapCourse) 템플릿 관리 API 호출.
 *
 * 백엔드 AdminRoadmapCourseController(/api/v1/admin/roadmap/courses) 5개 EP 호출.
 *
 * - 목록 조회 (페이징, 활성/비활성 모두)
 * - 단건 조회
 * - 신규 등록 (course_id UNIQUE — 중복 시 409)
 * - 수정 (course_id 제외)
 * - 활성/비활성 토글
 *
 * 모든 함수는 backendApi(JWT 자동 갱신) 인스턴스를 사용한다.
 */

import { backendApi } from '@/shared/api/axiosInstance';

/** 도장깨기 코스 관리자 EP 베이스 */
const BASE = '/api/v1/admin/roadmap/courses';

/**
 * 도장깨기 코스 목록 조회 (페이징).
 *
 * @param {Object} params
 * @param {number} [params.page=0]  페이지 번호 (0-based)
 * @param {number} [params.size=20] 페이지 크기
 * @returns {Promise<Object>} Page<CourseResponse>
 */
export function fetchCourses(params = {}) {
  return backendApi.get(BASE, { params });
}

/**
 * 도장깨기 코스 단건 조회.
 * @param {number|string} id - roadmap_course_id
 */
export function fetchCourse(id) {
  return backendApi.get(`${BASE}/${id}`);
}

/**
 * 신규 도장깨기 코스 등록.
 *
 * @param {Object} payload
 * @param {string}   payload.courseId    슬러그 (UNIQUE, 영문 소문자+하이픈)
 * @param {string}   payload.title       제목
 * @param {string}   [payload.description] 설명
 * @param {string}   [payload.theme]     테마 (감독별/장르별/시대별 등)
 * @param {string[]} payload.movieIds    영화 ID 목록 (1개 이상)
 * @param {string}   [payload.difficulty] beginner/intermediate/advanced
 * @param {boolean}  [payload.quizEnabled] 퀴즈 활성화
 */
export function createCourse(payload) {
  return backendApi.post(BASE, payload);
}

/**
 * 도장깨기 코스 수정 (course_id 제외).
 *
 * @param {number|string} id
 * @param {Object} payload - title/description/theme/movieIds/difficulty/quizEnabled
 */
export function updateCourse(id, payload) {
  return backendApi.put(`${BASE}/${id}`, payload);
}

/**
 * 활성/비활성 토글.
 * @param {number|string} id
 * @param {boolean} isActive
 */
export function updateCourseActive(id, isActive) {
  return backendApi.patch(`${BASE}/${id}/active`, { isActive });
}

/**
 * 영화 제목 검색 (도장깨기 코스에 추가할 영화 선택용).
 *
 * @param {string} keyword - 검색 키워드 (한글/영문 모두 가능)
 * @param {number} [size=10] - 최대 결과 수 (백엔드 최대 30)
 * @returns {Promise<Array<{movieId, title, titleEn, releaseYear, director, posterPath}>>}
 */
export function searchMovies(keyword, size = 10) {
  return backendApi.get(`${BASE}/movies/search`, { params: { keyword, size } });
}
