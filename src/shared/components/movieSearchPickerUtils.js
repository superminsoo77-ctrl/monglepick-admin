/**
 * MovieSearchPicker 용 순수 helper.
 *
 * 2026-04-14: 원래 MovieSearchPicker.jsx 안에 있던 `normalizeMovie` 를 별도 파일로 분리.
 * eslint `react-refresh/only-export-components` 는 컴포넌트 파일이 순수 함수를 함께
 * export 할 때 경고하므로, 공용으로 재사용하려면 이런 helper 파일로 분리해야 한다.
 *
 * 재사용처:
 *  - QuizManagementTab.jsx : 편집 모드에서 fetchMovieDetail 결과를 chip 으로 복원
 *  - OcrEventTab.jsx       : 동일
 */

/**
 * Agent /admin/movies & /admin/movies/{id} 응답을 픽커 공통 스키마로 정규화한다.
 *
 * Agent 는 snake_case (movie_id/title_en/release_year/poster_path/release_date),
 * 다른 관리자 탭에서는 camelCase 로 변환되어 쓰이기도 해서 양쪽을 모두 허용한다.
 * release_year 가 없고 release_date 만 있을 경우 앞 4자리를 연도로 추출한다.
 *
 * @param {Object} raw - Agent 응답 원본
 * @returns {?{movieId:string, title:string, titleEn:string, releaseYear:string, posterPath:string}}
 */
export function normalizeMovie(raw) {
  if (!raw) return null;
  return {
    movieId: String(raw.movie_id ?? raw.movieId ?? ''),
    title: raw.title ?? '-',
    titleEn: raw.title_en ?? raw.titleEn ?? '',
    releaseYear:
      raw.release_year ?? raw.releaseYear ?? (raw.release_date ? String(raw.release_date).slice(0, 4) : ''),
    posterPath: raw.poster_path ?? raw.posterPath ?? '',
  };
}
