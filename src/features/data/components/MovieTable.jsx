/**
 * 영화 데이터 테이블 컴포넌트.
 * 키워드 검색 + 소스 필터, 테이블 목록, 페이징,
 * 행 클릭 시 상세 모달(수정/삭제 포함).
 *
 * @param {Object} props - 없음 (자체 데이터 fetch)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { MdSearch, MdEdit, MdDelete, MdChevronLeft, MdChevronRight, MdClose, MdStorage } from 'react-icons/md';
import StatusBadge from '@/shared/components/StatusBadge';
import { fetchMovies, fetchMovieDetail, updateMovie, deleteMovie } from '../api/dataApi';

// 2026-04-15: `fetchMovieDbStatus` 는 Agent 미제공이라 import 에서 제거.
// 5DB 동기 상태는 `fetchMovieDetail` 응답 자체에 `qdrant.exists` / `elasticsearch.exists` /
// `neo4j.relations` 등이 포함되므로 상세 응답에서 파생하여 표시한다.

/** 소스 옵션 */
const SOURCE_OPTIONS = [
  { value: '', label: '전체 소스' },
  { value: 'tmdb', label: 'TMDB' },
  { value: 'kobis', label: 'KOBIS' },
  { value: 'kmdb', label: 'KMDb' },
  { value: 'kaggle', label: 'Kaggle' },
  { value: 'manual', label: '수동 등록' },
];

/**
 * DB 상태 표시 라벨.
 *
 * 2026-04-15: Redis 는 영화 단위 키가 없고 (캐시만 존재) Agent 도 영화별 Redis 상태를
 * 반환하지 않으므로 배지 목록에서 제외한다. MySQL/Qdrant/Neo4j/ES 4개만 표시.
 */
const DB_LABELS = ['MySQL', 'Qdrant', 'Neo4j', 'ES'];
const DB_KEYS = ['mysql', 'qdrant', 'neo4j', 'elasticsearch'];

export default function MovieTable() {
  /* ── 목록 상태 ── */
  const [movies, setMovies] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [page, setPage] = useState(0);
  const [size] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);

  /* ── 모달 상태 ── */
  const [selectedMovie, setSelectedMovie] = useState(null);  // 상세 데이터
  const [dbStatus, setDbStatus] = useState(null);            // 5DB 상태
  const [modalLoading, setModalLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  /* 검색 디바운스 타이머 */
  const searchTimer = useRef(null);

  /** 목록 조회 */
  const loadMovies = useCallback(async (pageNum = 0) => {
    setListLoading(true);
    setListError(null);
    try {
      const result = await fetchMovies({
        keyword: keyword || undefined,
        source: source || undefined,
        page: pageNum,
        size,
      });
      setMovies(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
      setTotalElements(result?.totalElements ?? 0);
      setPage(pageNum);
    } catch (err) {
      setListError(err.message);
    } finally {
      setListLoading(false);
    }
  }, [keyword, source, size]);

  /* 초기 로드 */
  useEffect(() => { loadMovies(0); }, [loadMovies]);

  /* 키워드 변경 시 디바운스 검색 */
  function handleKeywordChange(e) {
    const val = e.target.value;
    setKeyword(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadMovies(0), 400);
  }

  /* 소스 필터 변경 */
  function handleSourceChange(e) {
    setSource(e.target.value);
  }

  /* 컴포넌트 언마운트 시 타이머 정리 */
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  /** 행 클릭 → 상세 모달 열기.
   *
   * Agent 의 `GET /admin/movies/{id}` 는 응답에 5DB 정보를 통합해서 내려주므로
   * 별도 db-status 호출 없이 detail 응답에서 각 DB 존재 여부를 파생한다.
   */
  async function handleRowClick(movie) {
    setModalLoading(true);
    setEditMode(false);
    setDeleteConfirm(false);
    setDbStatus(null);
    try {
      const detail = await fetchMovieDetail(movie.id);
      setSelectedMovie(detail ?? movie);
      // detail 응답 구조(admin_data.py get_movie_detail):
      //   mysql: {...} | {error}
      //   qdrant: {exists, payload} | {error}
      //   neo4j: {relations: [...]} | {error}
      //   elasticsearch: {exists, source} | {error}
      setDbStatus({
        mysql: detail?.mysql && !detail.mysql.error,
        qdrant: detail?.qdrant?.exists === true,
        neo4j: Array.isArray(detail?.neo4j?.relations) && detail.neo4j.relations.length > 0,
        elasticsearch: detail?.elasticsearch?.exists === true,
        redis: null,  // Agent 미제공 (캐시 상태는 영화 단위가 아닌 전역 키스페이스만 조회 가능)
      });
    } catch {
      setSelectedMovie(movie);
    } finally {
      setModalLoading(false);
    }
  }

  /** 모달 닫기 */
  function closeModal() {
    setSelectedMovie(null);
    setEditMode(false);
    setEditData({});
    setDeleteConfirm(false);
    setDbStatus(null);
  }

  /** 편집 모드 진입 */
  function enterEditMode() {
    setEditData({
      title: selectedMovie?.title ?? '',
      title_ko: selectedMovie?.title_ko ?? '',
      overview: selectedMovie?.overview ?? '',
      release_date: selectedMovie?.release_date ?? '',
      genres: selectedMovie?.genres?.join(', ') ?? '',
    });
    setEditMode(true);
  }

  /** 수정 저장 */
  async function handleSave() {
    if (!selectedMovie?.id) return;
    setSaveLoading(true);
    try {
      const payload = {
        ...editData,
        genres: editData.genres
          ? editData.genres.split(',').map((g) => g.trim()).filter(Boolean)
          : [],
      };
      const updated = await updateMovie(selectedMovie.id, payload);
      setSelectedMovie(updated ?? { ...selectedMovie, ...payload });
      setEditMode(false);
      // 목록 갱신
      loadMovies(page);
    } catch (err) {
      alert(`수정 실패: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  }

  /** 삭제 확정 */
  async function handleDelete() {
    if (!selectedMovie?.id) return;
    setSaveLoading(true);
    try {
      await deleteMovie(selectedMovie.id);
      closeModal();
      loadMovies(page);
    } catch (err) {
      alert(`삭제 실패: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>
          영화 데이터
          {totalElements > 0 && (
            <TotalBadge>{totalElements.toLocaleString()}건</TotalBadge>
          )}
        </SectionTitle>
      </SectionHeader>

      {/* 검색 / 필터 바 */}
      <FilterBar>
        <SearchWrapper>
          <MdSearch size={16} />
          <SearchInput
            type="text"
            placeholder="제목, ID로 검색"
            value={keyword}
            onChange={handleKeywordChange}
          />
        </SearchWrapper>
        <Select value={source} onChange={handleSourceChange}>
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <ReloadButton onClick={() => loadMovies(0)} disabled={listLoading}>
          검색
        </ReloadButton>
      </FilterBar>

      {listError && <ErrorMsg>{listError}</ErrorMsg>}

      {/* 테이블 */}
      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <Th style={{ width: '140px' }}>ID</Th>
              <Th>제목</Th>
              <Th style={{ width: '100px' }}>개봉일</Th>
              <Th style={{ width: '80px' }}>소스</Th>
              <Th style={{ width: '70px' }}>평점</Th>
              <Th style={{ width: '80px' }}>작업</Th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={6}>
                  <LoadingRow>데이터를 불러오는 중...</LoadingRow>
                </td>
              </tr>
            ) : movies.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyRow>조건에 맞는 영화가 없습니다.</EmptyRow>
                </td>
              </tr>
            ) : (
              movies.map((movie) => (
                <Tr key={movie.id} onClick={() => handleRowClick(movie)}>
                  <Td>
                    <IdCell>{movie.id}</IdCell>
                  </Td>
                  <Td>
                    <TitleCell>
                      <TitleMain>{movie.title_ko || movie.title || '-'}</TitleMain>
                      {movie.title && movie.title_ko && (
                        <TitleSub>{movie.title}</TitleSub>
                      )}
                    </TitleCell>
                  </Td>
                  <Td>{movie.release_date ?? '-'}</Td>
                  <Td>
                    <StatusBadge status="info" label={movie.source ?? '-'} />
                  </Td>
                  <Td>{movie.vote_average != null ? movie.vote_average.toFixed(1) : '-'}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <ActionButtons>
                      <IconBtn
                        title="수정"
                        onClick={() => { handleRowClick(movie).then(() => setEditMode(true)); }}
                      >
                        <MdEdit size={15} />
                      </IconBtn>
                    </ActionButtons>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrapper>

      {/* 페이징 */}
      {totalPages > 1 && (
        <Pagination>
          <PageButton
            onClick={() => loadMovies(page - 1)}
            disabled={page === 0 || listLoading}
          >
            <MdChevronLeft size={18} />
          </PageButton>
          <PageInfo>
            {page + 1} / {totalPages}
          </PageInfo>
          <PageButton
            onClick={() => loadMovies(page + 1)}
            disabled={page >= totalPages - 1 || listLoading}
          >
            <MdChevronRight size={18} />
          </PageButton>
        </Pagination>
      )}

      {/* 상세 모달 */}
      {selectedMovie && (
        <ModalOverlay onClick={closeModal}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{selectedMovie.title_ko || selectedMovie.title || '영화 상세'}</ModalTitle>
              <CloseButton onClick={closeModal}><MdClose size={20} /></CloseButton>
            </ModalHeader>

            {modalLoading ? (
              <ModalBody><LoadingRow>불러오는 중...</LoadingRow></ModalBody>
            ) : (
              <ModalBody>
                {/* DB 동기화 상태 */}
                {dbStatus && (
                  <DbStatusRow>
                    <MdStorage size={14} />
                    <span>DB 동기화:</span>
                    {DB_KEYS.map((key, i) => (
                      <StatusBadge
                        key={key}
                        status={dbStatus[key] ? 'success' : 'error'}
                        label={DB_LABELS[i]}
                      />
                    ))}
                  </DbStatusRow>
                )}

                {/* 편집 모드 */}
                {editMode ? (
                  <EditForm>
                    {[
                      { field: 'title', label: '원제' },
                      { field: 'title_ko', label: '한국어 제목' },
                      { field: 'release_date', label: '개봉일 (YYYY-MM-DD)' },
                      { field: 'genres', label: '장르 (쉼표 구분)' },
                    ].map(({ field, label }) => (
                      <FieldRow key={field}>
                        <FieldLabel>{label}</FieldLabel>
                        <FieldInput
                          value={editData[field] ?? ''}
                          onChange={(e) => setEditData((prev) => ({ ...prev, [field]: e.target.value }))}
                        />
                      </FieldRow>
                    ))}
                    <FieldRow>
                      <FieldLabel>줄거리</FieldLabel>
                      <FieldTextarea
                        rows={4}
                        value={editData.overview ?? ''}
                        onChange={(e) => setEditData((prev) => ({ ...prev, overview: e.target.value }))}
                      />
                    </FieldRow>
                  </EditForm>
                ) : (
                  /* 읽기 모드 */
                  <DetailGrid>
                    {[
                      { label: 'ID', value: selectedMovie.id },
                      { label: '원제', value: selectedMovie.title },
                      { label: '한국어 제목', value: selectedMovie.title_ko },
                      { label: '개봉일', value: selectedMovie.release_date },
                      { label: '평점', value: selectedMovie.vote_average?.toFixed(1) },
                      { label: '인기도', value: selectedMovie.popularity?.toFixed(1) },
                      { label: '소스', value: selectedMovie.source },
                      { label: '장르', value: Array.isArray(selectedMovie.genres) ? selectedMovie.genres.join(', ') : selectedMovie.genres },
                    ].map(({ label, value }) => value != null ? (
                      <DetailRow key={label}>
                        <DetailLabel>{label}</DetailLabel>
                        <DetailValue>{String(value)}</DetailValue>
                      </DetailRow>
                    ) : null)}
                    {selectedMovie.overview && (
                      <DetailRowFull>
                        <DetailLabel>줄거리</DetailLabel>
                        <DetailValue>{selectedMovie.overview}</DetailValue>
                      </DetailRowFull>
                    )}
                  </DetailGrid>
                )}
              </ModalBody>
            )}

            {/* 모달 하단 버튼 */}
            <ModalFooter>
              {deleteConfirm ? (
                <>
                  <ConfirmMsg>정말 삭제하시겠습니까? 5DB에서 모두 제거됩니다.</ConfirmMsg>
                  <DangerButton onClick={handleDelete} disabled={saveLoading}>
                    {saveLoading ? '삭제 중...' : '삭제 확정'}
                  </DangerButton>
                  <GhostButton onClick={() => setDeleteConfirm(false)}>취소</GhostButton>
                </>
              ) : editMode ? (
                <>
                  <PrimaryButton onClick={handleSave} disabled={saveLoading}>
                    {saveLoading ? '저장 중...' : '저장'}
                  </PrimaryButton>
                  <GhostButton onClick={() => setEditMode(false)}>취소</GhostButton>
                </>
              ) : (
                <>
                  <PrimaryButton onClick={enterEditMode}>수정</PrimaryButton>
                  <DangerButton onClick={() => setDeleteConfirm(true)}>삭제</DangerButton>
                  <GhostButton onClick={closeModal}>닫기</GhostButton>
                </>
              )}
            </ModalFooter>
          </ModalBox>
        </ModalOverlay>
      )}
    </Section>
  );
}

/* ── styled-components ── */

const Section = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.heading};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const TotalBadge = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.normal};
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.bgHover};
  padding: 2px 8px;
  border-radius: 10px;
`;

const FilterBar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
`;

const SearchWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex: 1;
  min-width: 200px;
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  padding: 0 ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const SearchInput = styled.input`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm} 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.textPrimary};
  border: none;
  outline: none;

  &::placeholder { color: ${({ theme }) => theme.colors.textMuted}; }
`;

const Select = styled.select`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ReloadButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const TableWrapper = styled.div`
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  background: ${({ theme }) => theme.colors.bgCard};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  text-align: left;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
  background: ${({ theme }) => theme.colors.bgHover};
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background ${({ theme }) => theme.transitions.fast};

  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:not(:last-child) { border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight}; }
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  vertical-align: middle;
`;

const IdCell = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const TitleCell = styled.div``;

const TitleMain = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TitleSub = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const IconBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textMuted};
  border: 1px solid ${({ theme }) => theme.colors.border};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const LoadingRow = styled.div`
  padding: ${({ theme }) => theme.spacing.xxl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const EmptyRow = styled(LoadingRow)``;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const PageButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.bgHover}; }
  &:disabled { opacity: 0.4; }
`;

const PageInfo = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/* ── 모달 ── */

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: ${({ theme }) => theme.spacing.lg};
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  box-shadow: ${({ theme }) => theme.shadows.modal ?? theme.shadows.card};
  width: 100%;
  max-width: 640px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.xl};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const ModalTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.textMuted};
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const DbStatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const DetailGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const DetailRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

const DetailRowFull = styled(DetailRow)`
  flex-direction: column;
`;

const DetailLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  width: 80px;
  flex-shrink: 0;
`;

const DetailValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  word-break: break-all;
`;

const EditForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const FieldRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const FieldLabel = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const FieldInput = styled.input`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgBase ?? theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

const FieldTextarea = styled.textarea`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgBase ?? theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  resize: vertical;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.xl};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  flex-wrap: wrap;
`;

const ConfirmMsg = styled.p`
  flex: 1;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.error};
`;

const PrimaryButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.xl};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; }
`;

const DangerButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.xl};
  background: ${({ theme }) => theme.colors.error};
  color: #fff;
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; }
`;

const GhostButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.xl};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;
