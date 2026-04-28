/**
 * 운영 도구 — 영화(Movie) 마스터 관리 탭.
 *
 * 기능:
 * - 영화 목록 조회 (페이징 + 제목 키워드 검색)
 * - 신규 등록 모달 (movieId/tmdbId/제목/장르/감독/포스터/평점/관람등급 등)
 * - 수정 모달 (식별자 제외 핵심 필드)
 * - hard delete 버튼 (확인 대화상자)
 *
 * 설계 결정:
 * - 외부 동기화 파이프라인이 주로 적재하는 영화 데이터를 관리자가 수동 보정할 수 있다.
 * - 신규 등록은 source='admin' 으로 고정되며, 이후 수정 시 movieId/tmdbId 변경 불가.
 * - JSON 컬럼(genres/keywords/castMembers/ottPlatforms/moodTags)은 클라이언트가
 *   직접 JSON 문자열을 입력 (예: ["액션","SF"]).
 */

import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdDelete, MdSearch } from 'react-icons/md';
/* 2026-04-08: movieApi.js(backendApi) → dataApi.js(agentApi) 로 통합.
 * 단일 진실 원본 원칙에 따라 영화 CRUD 는 Agent(FastAPI admin_data.py)가 전담한다. */
import {
  fetchMovies,
  fetchMovieDetail,
  createMovie,
  updateMovie,
  deleteMovie,
} from '../api/dataApi';
/* 2026-04-09 P2-⑬: 대량 CSV 등록 UI — 순수 유틸 + 재사용 버튼 컴포넌트 */
import CsvImportButton from '@/shared/components/CsvImportButton';

/** 페이지 크기 */
const PAGE_SIZE = 10;

/** 모달 모드 */
const MODE_CREATE = 'CREATE';
const MODE_EDIT = 'EDIT';

/**
 * CSV 대량 등록 컬럼 정의 — 2026-04-09 P2-⑬.
 *
 * 각 컬럼은 CSV 헤더 이름과 Backend `createMovie` payload 의 필드 키를 매핑한다.
 * `required` 는 CSV 행 검증에만 쓰이고, `transform` 은 문자열 → 적절한 타입 변환을 담당.
 *
 * ## CSV 파일 작성 규칙
 * - 1행: 헤더 (아래 header 값과 정확히 일치해야 함)
 * - movieId, title 만 필수. 나머지는 생략 가능
 * - 숫자 필드(tmdbId/releaseYear/runtime/rating)는 빈 값이면 전송 안 함
 * - JSON 필드(genres): `["액션","SF"]` 형식 (선택, 잘못된 JSON 이면 행 에러)
 * - 불리언 필드(adult): `true`/`false`/`1`/`0` 모두 허용
 *
 * ## Transform 에러 정책
 * 변환 실패 시 throw 하면 `rowToPayload()` 가 잡아서 해당 행을 실패로 기록한다.
 */
const CSV_IMPORT_COLUMNS = [
  {
    key: 'movieId', header: 'movieId', required: true,
    description: '고유 영화 ID (영문/숫자/언더스코어)',
    example: 'm_admin_001', example2: 'm_admin_002',
  },
  {
    key: 'title', header: 'title', required: true,
    description: '제목 (한국어)',
    example: '예시 영화 하나', example2: '예시 영화 둘',
  },
  {
    key: 'titleEn', header: 'titleEn', description: '원제/영문 제목',
    example: 'Sample Movie One', example2: 'Sample Movie Two',
  },
  {
    key: 'overview', header: 'overview', description: '줄거리/요약',
    example: '한 줄로 쓴 샘플 줄거리입니다.', example2: '',
  },
  {
    key: 'tmdbId',
    header: 'tmdbId',
    description: 'TMDB 정수 ID (선택)',
    example: 12345,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n)) throw new Error('정수 형식이 아닙니다');
      return n;
    },
  },
  {
    key: 'genres',
    header: 'genres',
    description: 'JSON 배열 (예: ["액션","SF"])',
    example: '["액션","SF"]', example2: '["드라마"]',
    transform: (raw) => {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('JSON 배열이어야 합니다');
        return parsed;
      } catch (err) {
        throw new Error(err.message.startsWith('JSON') ? err.message : `JSON 파싱 실패: ${err.message}`);
      }
    },
  },
  {
    key: 'director', header: 'director', description: '감독명',
    example: '홍길동', example2: '김감독',
  },
  {
    key: 'releaseYear',
    header: 'releaseYear',
    description: '개봉 연도 (정수, 예: 2024)',
    example: 2024, example2: 2023,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1800 || n > 2100) throw new Error('1800~2100 사이 정수');
      return n;
    },
  },
  {
    key: 'releaseDate', header: 'releaseDate', description: 'YYYY-MM-DD',
    example: '2024-05-15',
  },
  {
    key: 'runtime',
    header: 'runtime',
    description: '상영 시간 (분, 정수)',
    example: 120, example2: 95,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error('0 이상의 정수');
      return n;
    },
  },
  {
    key: 'rating',
    header: 'rating',
    description: '평점 0.0~10.0',
    example: 8.5, example2: 7.2,
    transform: (raw) => {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 10) throw new Error('0.0~10.0 범위');
      return n;
    },
  },
  { key: 'posterPath',    header: 'posterPath',    description: '포스터 URL', example: 'https://example.com/poster.jpg' },
  { key: 'certification', header: 'certification', description: '관람등급 (전체/12/15/청불)', example: '15', example2: '전체' },
  { key: 'trailerUrl',    header: 'trailerUrl',    description: '트레일러 URL' },
  { key: 'tagline',       header: 'tagline',       description: '한 줄 소개', example: '잊지 못할 이야기' },
  { key: 'originalLanguage', header: 'originalLanguage', description: 'ISO 639-1 (ko/en/ja...)', example: 'ko', example2: 'en' },
  { key: 'backdropPath',  header: 'backdropPath',  description: '배경 이미지 URL' },
  {
    key: 'adult',
    header: 'adult',
    description: '성인 콘텐츠 여부 (true/false/1/0)',
    example: 'false', example2: 'false',
    transform: (raw) => {
      const v = String(raw).toLowerCase().trim();
      if (['true', '1', 'y', 'yes'].includes(v)) return true;
      if (['false', '0', 'n', 'no', ''].includes(v)) return false;
      throw new Error('true/false/1/0 중 하나여야 합니다');
    },
  },
];

/** 빈 폼 초기값 */
const EMPTY_FORM = {
  movieId: '',
  tmdbId: '',
  title: '',
  titleEn: '',
  overview: '',
  genres: '',
  director: '',
  releaseYear: '',
  releaseDate: '',
  runtime: '',
  rating: '',
  posterPath: '',
  certification: '',
  trailerUrl: '',
  tagline: '',
  originalLanguage: '',
  backdropPath: '',
  adult: false,
};

export default function MovieMasterTab() {
  /* ── 목록 상태 ── */
  const [movies, setMovies] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── 모달 상태 ── */
  const [modalMode, setModalMode] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  /* 2026-04-14: 상세 모달에서 MySQL 전체 컬럼을 로드할 동안 표시할 로딩 플래그.
   * 목록 API 는 최소 컬럼만 내려주므로(payload 최소화) 수정/상세 모달 진입 시
   * fetchMovieDetail 로 전체 필드를 다시 가져와 폼을 덮어써야 한다. */
  const [detailLoading, setDetailLoading] = useState(false);

  /* ── 삭제 진행 상태 ── */
  const [deletingId, setDeletingId] = useState(null);

  /** 목록 조회 */
  const loadMovies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (keyword) params.keyword = keyword;
      const result = await fetchMovies(params);
      setMovies(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page, keyword]);

  useEffect(() => {
    loadMovies();
  }, [loadMovies]);

  /** 검색 확정 */
  function handleSearch() {
    setKeyword(keywordInput.trim());
    setPage(0);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch();
  }

  /** 신규 등록 모달 */
  function openCreateModal() {
    setForm(EMPTY_FORM);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }

  /** 수정 모달 — 기존 값 로드.
   *
   * 2026-04-14 버그 수정: 목록 API(`GET /admin/data/movies`) 는 응답 최소화를 위해
   * `overview/genres/tmdbId/certification/trailerUrl/tagline/originalLanguage/backdropPath/adult`
   * 를 내려주지 않는다. 이 때문에 모달을 열면 해당 필드가 전부 공란으로 보였다.
   *
   * 전략:
   *   1) 목록 item 으로 폼을 즉시 선채우기(시각적 공백 방지)
   *   2) 모달을 먼저 띄우고 비동기로 `fetchMovieDetail` 호출 → `mysql` 객체의
   *      전체 컬럼(snake_case)을 camelCase 로 매핑해 폼에 덮어쓰기
   *   3) JSON 컬럼(genres)은 서버가 JSON 문자열 또는 배열로 반환할 수 있으므로
   *      배열이면 `JSON.stringify` 해서 입력창 포맷(`["액션","SF"]`)과 통일
   */
  async function openEditModal(item) {
    // 1) 목록 데이터로 일단 채우기 (누락 필드는 빈 값)
    setForm({
      movieId: item.movieId ?? '',
      tmdbId: item.tmdbId ?? '',
      title: item.title ?? '',
      titleEn: item.titleEn ?? '',
      overview: item.overview ?? '',
      genres: item.genres ?? '',
      director: item.director ?? '',
      releaseYear: item.releaseYear ?? '',
      releaseDate: item.releaseDate ?? '',
      runtime: item.runtime ?? '',
      rating: item.rating ?? '',
      posterPath: item.posterPath ?? '',
      certification: item.certification ?? '',
      trailerUrl: item.trailerUrl ?? '',
      tagline: item.tagline ?? '',
      originalLanguage: item.originalLanguage ?? '',
      backdropPath: item.backdropPath ?? '',
      adult: !!item.adult,
    });
    setEditTargetId(item.movieId);
    setModalMode(MODE_EDIT);

    // 2) 상세 API 호출하여 전체 컬럼 가져오기
    try {
      setDetailLoading(true);
      const detail = await fetchMovieDetail(item.movieId);
      const m = detail?.mysql;
      if (!m || m.error) return;

      // JSON 컬럼(genres) 정규화 — 배열이면 문자열로, null/''이면 빈 문자열
      const genresRaw = m.genres;
      let genresStr = '';
      if (Array.isArray(genresRaw)) {
        genresStr = JSON.stringify(genresRaw);
      } else if (typeof genresRaw === 'string') {
        genresStr = genresRaw;
      }

      // release_date 는 LocalDate('YYYY-MM-DD') 문자열 또는 ISO 문자열일 수 있음 →
      // <input type="date"> 에 맞게 앞 10자만 사용
      const rawReleaseDate = m.release_date;
      const releaseDateStr =
        typeof rawReleaseDate === 'string' && rawReleaseDate.length >= 10
          ? rawReleaseDate.slice(0, 10)
          : '';

      setForm({
        movieId: m.movie_id ?? item.movieId ?? '',
        tmdbId: m.tmdb_id ?? '',
        title: m.title ?? '',
        titleEn: m.title_en ?? '',
        overview: m.overview ?? '',
        genres: genresStr,
        director: m.director ?? '',
        releaseYear: m.release_year ?? '',
        releaseDate: releaseDateStr,
        runtime: m.runtime ?? '',
        rating: m.rating ?? '',
        posterPath: m.poster_path ?? '',
        certification: m.certification ?? '',
        trailerUrl: m.trailer_url ?? '',
        tagline: m.tagline ?? '',
        originalLanguage: m.original_language ?? '',
        backdropPath: m.backdrop_path ?? '',
        adult: !!m.adult,
      });
    } catch (err) {
      // 상세 실패해도 목록 데이터로 폴백 — 사용자에겐 경고만 노출
      // eslint-disable-next-line no-console
      console.warn('[MovieMasterTab] 영화 상세 조회 실패:', err);
    } finally {
      setDetailLoading(false);
    }
  }

  /** 모달 닫기 */
  function closeModal() {
    setModalMode(null);
    setEditTargetId(null);
    setForm(EMPTY_FORM);
    setSubmitting(false);
  }

  /** 폼 입력 핸들러 */
  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  /** 폼 제출 */
  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);

      // 숫자 변환 (빈 문자열 → null)
      const toIntOrNull = (v) => (v === '' || v == null ? null : parseInt(v, 10));
      const toFloatOrNull = (v) => (v === '' || v == null ? null : parseFloat(v));

      const payload = {
        title: form.title?.trim(),
        titleEn: form.titleEn || null,
        overview: form.overview || null,
        genres: form.genres || null,
        director: form.director || null,
        releaseYear: toIntOrNull(form.releaseYear),
        releaseDate: form.releaseDate || null,
        runtime: toIntOrNull(form.runtime),
        rating: toFloatOrNull(form.rating),
        posterPath: form.posterPath || null,
        certification: form.certification || null,
        trailerUrl: form.trailerUrl || null,
        tagline: form.tagline || null,
        originalLanguage: form.originalLanguage || null,
        backdropPath: form.backdropPath || null,
        adult: !!form.adult,
        // CRUD 모달에서는 아래 필드는 미입력 — 기존 값 유지 X (null로 덮어쓰기 됨)
        // 사용 빈도 낮은 필드는 향후 별도 모달로 분리 가능
        castMembers: null,
        keywords: null,
        ottPlatforms: null,
        moodTags: null,
        awards: null,
        filmingLocation: null,
      };

      if (modalMode === MODE_CREATE) {
        payload.movieId = form.movieId?.trim();
        payload.tmdbId = toIntOrNull(form.tmdbId);
        await createMovie(payload);
      } else if (modalMode === MODE_EDIT && editTargetId != null) {
        await updateMovie(editTargetId, payload);
      }
      closeModal();
      loadMovies();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  /** 삭제 */
  async function handleDelete(item) {
    if (deletingId === item.movieId) return;
    if (!confirm(
      `정말 영화 "${item.title}"(${item.movieId})를 삭제하시겠습니까?\n\n` +
      `※ 이 영화를 참조하는 리뷰/플레이리스트의 movie_id가 orphan으로 남을 수 있습니다.\n` +
      `이 작업은 되돌릴 수 없습니다.`
    )) {
      return;
    }
    try {
      setDeletingId(item.movieId);
      await deleteMovie(item.movieId);
      loadMovies();
    } catch (err) {
      alert(err.message || '삭제 실패');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Container>
      {/* ── 툴바 ── */}
      <Toolbar>
        <ToolbarLeft>
          <ToolbarTitle>영화 마스터 관리</ToolbarTitle>
          <SearchWrap>
            <SearchInput
              type="text"
              placeholder="제목 검색..."
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <SearchButton onClick={handleSearch} title="검색">
              <MdSearch size={16} />
            </SearchButton>
          </SearchWrap>
        </ToolbarLeft>
        <ToolbarRight>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} /> 신규 등록
          </PrimaryButton>
          {/*
            CSV 대량 등록 — 2026-04-09 P2-⑬ 신규.
            각 행을 createMovie() 로 순차 호출하며, 완료 후 목록 재조회.
            파싱 실패/API 실패는 모달 내부에서 행별로 집계 표시된다.
          */}
          <CsvImportButton
            label="CSV 가져오기"
            columns={CSV_IMPORT_COLUMNS}
            onRowImport={createMovie}
            onComplete={(result) => {
              /* 하나라도 성공했으면 목록 재조회 */
              if (result.succeeded > 0) loadMovies();
            }}
            disabled={loading}
            templateName="movies"
          />
          <IconButton onClick={loadMovies} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      <HelperText>
        외부 동기화 파이프라인(TMDB/Kaggle/KMDb/KOBIS)이 주로 적재하는 영화 데이터를
        관리자가 직접 추가/수정/삭제할 수 있습니다. 신규 등록은 <strong>source=admin</strong>으로 표시되며,
        삭제는 hard delete이므로 신중하게 사용하세요.
      </HelperText>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* ── 테이블 ── */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="120px">영화 ID</Th>
              <Th>제목</Th>
              <Th $w="120px">감독</Th>
              <Th $w="80px">평점</Th>
              <Th $w="100px">개봉일</Th>
              <Th $w="80px">소스</Th>
              <Th $w="160px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : movies.length === 0 ? (
              <tr><td colSpan={7}><CenterCell>등록된 영화가 없습니다.</CenterCell></td></tr>
            ) : (
              movies.map((item) => (
                <Tr key={item.movieId}>
                  <Td><CodeText>{item.movieId}</CodeText></Td>
                  <Td>
                    <NameText>{item.title}</NameText>
                    {item.titleEn && <DescText>{item.titleEn}</DescText>}
                  </Td>
                  <Td><MutedText>{item.director ?? '-'}</MutedText></Td>
                  <Td><MutedText>{item.rating ?? '-'}</MutedText></Td>
                  <Td><MutedText>{item.releaseDate ?? item.releaseYear ?? '-'}</MutedText></Td>
                  <Td>
                    <SourceBadge $admin={item.source === 'admin'}>
                      {item.source ?? '-'}
                    </SourceBadge>
                  </Td>
                  <Td>
                    <ActionGroup>
                      <SmallButton onClick={() => openEditModal(item)}>
                        <MdEdit size={13} /> 수정
                      </SmallButton>
                      <DangerSmallButton
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.movieId}
                      >
                        <MdDelete size={13} /> 삭제
                      </DangerSmallButton>
                    </ActionGroup>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>

      {/* ── 페이지네이션 ── */}
      {totalPages > 1 && (
        <Pagination>
          <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
            이전
          </PageButton>
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>
            다음
          </PageButton>
        </Pagination>
      )}

      {/* ── 등록/수정 모달 ── */}
      {modalMode && (
        <Overlay onClick={closeModal}>
          <DialogBox onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              {modalMode === MODE_CREATE ? '영화 신규 등록' : '영화 수정'}
              {/* 2026-04-14: 상세 API 로드 중 표시 — 사용자가 빈 칸을 오해하지 않도록 */}
              {modalMode === MODE_EDIT && detailLoading && (
                <span style={{ marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400 }}>
                  (상세 정보 불러오는 중...)
                </span>
              )}
            </DialogTitle>
            <form onSubmit={handleSubmit}>
              <FieldRow>
                <Field>
                  <Label>영화 ID *</Label>
                  <Input
                    type="text"
                    name="movieId"
                    value={form.movieId}
                    onChange={handleFormChange}
                    required={modalMode === MODE_CREATE}
                    disabled={modalMode === MODE_EDIT}
                    maxLength={50}
                    placeholder="VARCHAR(50) PK"
                  />
                </Field>
                <Field>
                  <Label>TMDB ID</Label>
                  <Input
                    type="number"
                    name="tmdbId"
                    value={form.tmdbId}
                    onChange={handleFormChange}
                    disabled={modalMode === MODE_EDIT}
                    placeholder="외부 ID (선택)"
                  />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field>
                  <Label>제목 (한국어) *</Label>
                  <Input
                    type="text"
                    name="title"
                    value={form.title}
                    onChange={handleFormChange}
                    required
                    maxLength={500}
                  />
                </Field>
                <Field>
                  <Label>영문 제목</Label>
                  <Input
                    type="text"
                    name="titleEn"
                    value={form.titleEn}
                    onChange={handleFormChange}
                    maxLength={500}
                  />
                </Field>
              </FieldRow>
              <Field>
                <Label>줄거리</Label>
                <Textarea
                  name="overview"
                  value={form.overview}
                  onChange={handleFormChange}
                  rows={3}
                />
              </Field>
              <FieldRow>
                <Field>
                  <Label>장르 (JSON 배열)</Label>
                  <Input
                    type="text"
                    name="genres"
                    value={form.genres}
                    onChange={handleFormChange}
                    placeholder='["액션","SF"]'
                  />
                </Field>
                <Field>
                  <Label>감독</Label>
                  <Input
                    type="text"
                    name="director"
                    value={form.director}
                    onChange={handleFormChange}
                    maxLength={500}
                  />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field>
                  <Label>개봉 연도</Label>
                  <Input
                    type="number"
                    name="releaseYear"
                    value={form.releaseYear}
                    onChange={handleFormChange}
                  />
                </Field>
                <Field>
                  <Label>개봉일</Label>
                  <Input
                    type="date"
                    name="releaseDate"
                    value={form.releaseDate}
                    onChange={handleFormChange}
                  />
                </Field>
                <Field>
                  <Label>상영시간(분)</Label>
                  <Input
                    type="number"
                    name="runtime"
                    value={form.runtime}
                    onChange={handleFormChange}
                  />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field>
                  <Label>평점 (0~10)</Label>
                  <Input
                    type="number"
                    name="rating"
                    value={form.rating}
                    onChange={handleFormChange}
                    step="0.1"
                    min="0"
                    max="10"
                  />
                </Field>
                <Field>
                  <Label>관람등급</Label>
                  <Input
                    type="text"
                    name="certification"
                    value={form.certification}
                    onChange={handleFormChange}
                    placeholder="15세이상관람가 / R / PG-13"
                    maxLength={50}
                  />
                </Field>
                <Field>
                  <Label>원어</Label>
                  <Input
                    type="text"
                    name="originalLanguage"
                    value={form.originalLanguage}
                    onChange={handleFormChange}
                    placeholder="ko / en / ja"
                    maxLength={10}
                  />
                </Field>
              </FieldRow>
              <Field>
                <Label>포스터 경로</Label>
                <Input
                  type="text"
                  name="posterPath"
                  value={form.posterPath}
                  onChange={handleFormChange}
                  placeholder="/abcdef.jpg"
                  maxLength={500}
                />
              </Field>
              <Field>
                <Label>배경 이미지 경로</Label>
                <Input
                  type="text"
                  name="backdropPath"
                  value={form.backdropPath}
                  onChange={handleFormChange}
                  maxLength={500}
                />
              </Field>
              <FieldRow>
                <Field>
                  <Label>예고편 URL</Label>
                  <Input
                    type="text"
                    name="trailerUrl"
                    value={form.trailerUrl}
                    onChange={handleFormChange}
                    maxLength={500}
                  />
                </Field>
                <Field>
                  <Label>태그라인</Label>
                  <Input
                    type="text"
                    name="tagline"
                    value={form.tagline}
                    onChange={handleFormChange}
                    maxLength={500}
                  />
                </Field>
              </FieldRow>
              <Field>
                <CheckboxLabel>
                  <input
                    type="checkbox"
                    name="adult"
                    checked={form.adult}
                    onChange={handleFormChange}
                  />
                  <span>성인 영화 (adult=true)</span>
                </CheckboxLabel>
              </Field>
              <DialogFooter>
                <CancelButton type="button" onClick={closeModal}>취소</CancelButton>
                <PrimaryButton type="submit" disabled={submitting}>
                  {submitting ? '저장 중...' : '저장'}
                </PrimaryButton>
              </DialogFooter>
            </form>
          </DialogBox>
        </Overlay>
      )}
    </Container>
  );
}

/* ── styled-components ── */

const Container = styled.div``;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ToolbarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const ToolbarTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SearchWrap = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  overflow: hidden;
`;

const SearchInput = styled.input`
  padding: 6px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: none;
  outline: none;
  width: 200px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SearchButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  background: ${({ theme }) => theme.colors.bgHover};
  border-left: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { background: ${({ theme }) => theme.colors.border}; }
`;

const HelperText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgHover};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 4px;
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 4px;
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; }
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const TableWrap = styled.div`
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const Th = styled.th`
  text-align: left;
  padding: 10px 12px;
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  white-space: nowrap;
  width: ${({ $w }) => $w ?? 'auto'};
`;

const Tr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const Td = styled.td`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;

const CodeText = styled.code`
  display: inline-block;
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.bgHover};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const NameText = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const DescText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
`;

const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;

const SourceBadge = styled.span`
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 3px;
  color: ${({ $admin, theme }) => ($admin ? '#fff' : theme.colors.textSecondary)};
  background: ${({ $admin, theme }) =>
    $admin ? theme.colors.primary : theme.colors.bgHover};
  border: 1px solid
    ${({ $admin, theme }) => ($admin ? theme.colors.primary : theme.colors.border)};
`;

const ActionGroup = styled.div`
  display: flex;
  gap: 4px;
`;

const SmallButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled { opacity: 0.4; }
`;

const DangerSmallButton = styled(SmallButton)`
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.error};
    color: ${({ theme }) => theme.colors.error};
  }
`;

const CenterCell = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxxl};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const PageButton = styled.button`
  padding: 5px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* ── 모달 ── */

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const DialogBox = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  width: 100%;
  max-width: 720px;
  max-height: 90vh;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.xxl};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const DialogTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Field = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex: 1;
`;

const FieldRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const Input = styled.input`
  width: 100%;
  padding: 7px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
  &:disabled { background: ${({ theme }) => theme.colors.bgHover}; opacity: 0.7; }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 7px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  resize: vertical;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;

const CheckboxLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const CancelButton = styled.button`
  padding: 7px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.bgCard};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;
