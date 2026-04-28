/**
 * 운영 도구 — OCR 인증 이벤트(OcrEvent) 관리 탭.
 *
 * 기능:
 * - 이벤트 목록 조회 (페이징 + 상태 필터)
 * - 신규 등록 모달 (movieId/start/end)
 * - 메타 수정 모달
 * - 상태 전이 버튼 (READY → ACTIVE → CLOSED)
 * - hard delete
 *
 * 시작일/종료일은 datetime-local input으로 입력. ISO 형식으로 변환하여 백엔드 전송.
 */

import { useState, useEffect, useCallback, Fragment } from 'react';
import styled from 'styled-components';
import { MdRefresh, MdAdd, MdEdit, MdDelete, MdList, MdCode } from 'react-icons/md';
import {
  fetchOcrEvents,
  createOcrEvent,
  updateOcrEvent,
  updateOcrEventStatus,
  deleteOcrEvent,
  fetchOcrVerifications,
  reviewOcrVerification,
} from '../api/ocrEventApi';
/*
 * 2026-04-14: 운영자가 movie_id(VARCHAR PK) 를 외워 입력하던 부담을 제거하기 위해
 * 모달의 "대상 영화" 필드를 MovieSearchPicker 로 전환.
 *
 *  - state: form.movieId(string) → formMovie(Movie|null)
 *  - 편집 모드에서는 fetchMovieDetail(item.movieId) 로 chip 복원
 *  - @NotBlank 필수값은 submit 전 수동 검증(formMovie null 검사)으로 대체
 *  - Backend CreateOcrEventRequest/UpdateOcrEventRequest 의 movieId:String 시그니처 불변
 */
import MovieSearchPicker from '@/shared/components/MovieSearchPicker';
import { normalizeMovie } from '@/shared/components/movieSearchPickerUtils';
import { fetchMovieDetail } from '@/features/data/api/dataApi';

const PAGE_SIZE = 10;
const VERIFICATION_PAGE_SIZE = 10;

const STATUS_FILTER_OPTIONS = [
  { value: '', label: '전체 상태' },
  { value: 'READY', label: '대기 (READY)' },
  { value: 'ACTIVE', label: '진행 중 (ACTIVE)' },
  { value: 'CLOSED', label: '종료 (CLOSED)' },
];

const STATUS_COLOR = {
  READY: '#f59e0b',
  ACTIVE: '#10b981',
  CLOSED: '#6b7280',
};

/** 상태별 가능한 전이 액션 */
const STATUS_TRANSITION_BUTTONS = {
  READY:  [{ label: '활성화', target: 'ACTIVE' }, { label: '종료', target: 'CLOSED' }],
  ACTIVE: [{ label: '종료', target: 'CLOSED' }, { label: '대기로', target: 'READY' }],
  CLOSED: [{ label: '재개', target: 'ACTIVE' }],
};

const VERIFICATION_STATUS_FILTER_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'PENDING', label: '심사 대기' },
  { value: 'APPROVED', label: '승인' },
  { value: 'REJECTED', label: '반려' },
];
const VERIFICATION_STATUS_COLOR = { PENDING: '#f59e0b', APPROVED: '#10b981', REJECTED: '#ef4444' };

const MODE_CREATE = 'CREATE';
const MODE_EDIT = 'EDIT';
/**
 * 폼 초기값.
 *
 * 2026-04-14 (1): 유저 커뮤니티 "실관람인증" 탭 노출용 title/memo 필드 추가.
 * title 은 필수, memo 는 선택. 백엔드 @NotBlank + @Size 검증과 정합 유지.
 *
 * 2026-04-14 (2): movieId 를 form 에서 분리해 별도 state(formMovie: Movie|null) 로 관리.
 * MovieSearchPicker 가 전체 영화 객체를 넘겨주므로 form 내부 중복 보관이 불필요하다.
 */
const EMPTY_FORM = {
  title: '',
  memo: '',
  startDate: '',
  endDate: '',
};

/**
 * datetime-local input value (yyyy-MM-ddTHH:mm) → ISO 문자열로 변환.
 * 백엔드 LocalDateTime 파싱과 호환되는 형식: yyyy-MM-ddTHH:mm:ss.
 */
function toIsoLocalDateTime(value) {
  if (!value) return null;
  return value.length === 16 ? `${value}:00` : value;
}

/** ISO 문자열 → datetime-local input value (yyyy-MM-ddTHH:mm) */
function fromIsoLocalDateTime(iso) {
  if (!iso) return '';
  return iso.substring(0, 16);
}

export default function OcrEventTab() {
  const [events, setEvents] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalMode, setModalMode] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  /**
   * 모달 내부의 "대상 영화" 선택 상태.
   *
   * 2026-04-14: form.movieId(string) → formMovie(Movie|null) 로 분리.
   * Backend 의 @NotBlank 를 프론트에서 선제 검증(handleSubmit 첫 줄) 해 원본 에러 메시지가
   * alert 로 새어나오지 않도록 한다.
   */
  const [formMovie, setFormMovie] = useState(null);
  /** 편집 모드에서 기존 movieId 로 영화 상세를 불러오는 중인지 여부 */
  const [formMovieLoading, setFormMovieLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [verificationPanelEventId, setVerificationPanelEventId] = useState(null);
  const [verifications, setVerifications] = useState([]);
  const [verificationsLoading, setVerificationsLoading] = useState(false);
  const [verificationsPage, setVerificationsPage] = useState(0);
  const [verificationsTotalPages, setVerificationsTotalPages] = useState(0);
  const [verificationStatusFilter, setVerificationStatusFilter] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [expandedRawId, setExpandedRawId] = useState(null);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, size: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      const result = await fetchOcrEvents(params);
      setEvents(result?.content ?? []);
      setTotalPages(result?.totalPages ?? 0);
    } catch (err) {
      setError(err.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  function handleStatusFilterChange(e) {
    setStatusFilter(e.target.value);
    setPage(0);
  }

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setFormMovie(null);
    setEditTargetId(null);
    setModalMode(MODE_CREATE);
  }

  /**
   * 수정 모달 — 기존 값(title/memo/기간) 복원 + 대상 영화 chip 복원.
   *
   * 2026-04-14: 목록 응답에는 영화 제목이 없으므로(item.movieId 만 보유), Agent
   * `fetchMovieDetail(movieId)` 를 비동기 호출해 title/titleEn/releaseYear 를 얻어
   * MovieSearchPicker chip 으로 표시한다. 상세 로딩이 실패하더라도 chip 은 최소한
   * movieId 만 가진 객체로 유지해 저장이 가능하도록 한다 (운영자는 해제 후 재검색 가능).
   */
  function openEditModal(item) {
    setForm({
      title: item.title ?? '',
      memo: item.memo ?? '',
      startDate: fromIsoLocalDateTime(item.startDate),
      endDate: fromIsoLocalDateTime(item.endDate),
    });
    setEditTargetId(item.eventId);
    setModalMode(MODE_EDIT);

    if (item.movieId) {
      setFormMovieLoading(true);
      setFormMovie({
        movieId: String(item.movieId),
        title: item.movieId,
        titleEn: '',
        releaseYear: '',
        posterPath: '',
      });
      fetchMovieDetail(item.movieId)
        .then((detail) => {
          const normalized = normalizeMovie(detail);
          if (normalized) setFormMovie(normalized);
        })
        .catch(() => {
          /* 상세 실패 시 movieId-only chip 유지 */
        })
        .finally(() => setFormMovieLoading(false));
    } else {
      setFormMovie(null);
    }
  }

  function closeModal() {
    setModalMode(null);
    setEditTargetId(null);
    setForm(EMPTY_FORM);
    setFormMovie(null);
    setFormMovieLoading(false);
    setSubmitting(false);
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    /*
     * 2026-04-14: movieId 는 Backend @NotBlank 이므로 반드시 선택돼 있어야 한다.
     * MovieSearchPicker 는 native required 속성을 사용하지 않으므로 여기서 선제 검증한다.
     */
    if (!formMovie?.movieId) {
      alert('대상 영화를 선택하세요.');
      return;
    }
    try {
      setSubmitting(true);
      // Backend Create/UpdateOcrEventRequest 와 필드명 1:1 정합
      const payload = {
        movieId: formMovie.movieId,
        title: form.title?.trim(),
        memo: form.memo?.trim() || null, // 선택 필드 — 빈 문자열 대신 null 전송
        startDate: toIsoLocalDateTime(form.startDate),
        endDate: toIsoLocalDateTime(form.endDate),
      };
      if (modalMode === MODE_CREATE) {
        await createOcrEvent(payload);
      } else if (modalMode === MODE_EDIT && editTargetId != null) {
        await updateOcrEvent(editTargetId, payload);
      }
      closeModal();
      loadEvents();
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransition(item, targetStatus) {
    if (busyId === item.eventId) return;
    if (!confirm(`OCR 이벤트 #${item.eventId}를 ${targetStatus} 상태로 변경합니다.`)) return;
    try {
      setBusyId(item.eventId);
      await updateOcrEventStatus(item.eventId, targetStatus);
      loadEvents();
    } catch (err) {
      alert(err.message || '상태 변경 실패');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    if (busyId === item.eventId) return;
    if (!confirm(`OCR 이벤트 #${item.eventId} (영화 ${item.movieId})를 삭제합니다.\n사용자 인증 기록이 보존되지 않을 수 있습니다.`)) {
      return;
    }
    try {
      setBusyId(item.eventId);
      await deleteOcrEvent(item.eventId);
      loadEvents();
    } catch (err) {
      alert(err.message || '삭제 실패');
    } finally {
      setBusyId(null);
    }
  }

  async function loadVerifications(eventId, pg, statusF) {
    try {
      setVerificationsLoading(true);
      const params = { page: pg, size: VERIFICATION_PAGE_SIZE };
      if (statusF) params.status = statusF;
      const result = await fetchOcrVerifications(eventId, params);
      setVerifications(result?.content ?? []);
      setVerificationsTotalPages(result?.totalPages ?? 0);
    } catch {
      setVerifications([]);
    } finally {
      setVerificationsLoading(false);
    }
  }

  function toggleVerificationPanel(eventId) {
    if (verificationPanelEventId === eventId) {
      setVerificationPanelEventId(null);
      return;
    }
    setVerificationPanelEventId(eventId);
    setVerificationsPage(0);
    setVerificationStatusFilter('');
    loadVerifications(eventId, 0, '');
  }

  async function handleReview(verificationId, action) {
    if (reviewingId != null) return;
    try {
      setReviewingId(verificationId);
      await reviewOcrVerification(verificationId, action);
      loadVerifications(verificationPanelEventId, verificationsPage, verificationStatusFilter);
    } catch (err) {
      alert(err.message || '처리 실패');
    } finally {
      setReviewingId(null);
    }
  }

  function handleVerificationFilterChange(e) {
    const f = e.target.value;
    setVerificationStatusFilter(f);
    setVerificationsPage(0);
    loadVerifications(verificationPanelEventId, 0, f);
  }

  function handleVerificationsPageChange(delta) {
    const pg = verificationsPage + delta;
    setVerificationsPage(pg);
    loadVerifications(verificationPanelEventId, pg, verificationStatusFilter);
  }

  return (
    <Container>
      <Toolbar>
        <ToolbarLeft>
          <ToolbarTitle>OCR 인증 이벤트 관리</ToolbarTitle>
          <FilterSelect value={statusFilter} onChange={handleStatusFilterChange}>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </FilterSelect>
        </ToolbarLeft>
        <ToolbarRight>
          <PrimaryButton onClick={openCreateModal}>
            <MdAdd size={16} /> 신규 등록
          </PrimaryButton>
          <IconButton onClick={loadEvents} disabled={loading} title="새로고침">
            <MdRefresh size={16} />
          </IconButton>
        </ToolbarRight>
      </Toolbar>

      <HelperText>
        실관람 OCR 인증 이벤트는 <strong>대기 → 진행 중 → 종료</strong> 순서로 운영됩니다.
        관리자는 필요 시 언제든 상태를 전이할 수 있습니다.
      </HelperText>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th $w="60px">ID</Th>
              <Th $w="120px">영화 ID</Th>
              {/* 2026-04-14 신규: 제목 컬럼. 유저 카드 상단에 동일 노출 */}
              <Th>제목 / 메모</Th>
              <Th $w="200px">시작일 ~ 종료일</Th>
              <Th $w="100px">상태</Th>
              <Th $w="120px">생성자</Th>
              <Th $w="280px">액션</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}><CenterCell>불러오는 중...</CenterCell></td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={7}><CenterCell>등록된 이벤트가 없습니다.</CenterCell></td></tr>
            ) : (
              events.map((item) => (
                <Fragment key={item.eventId}>
                  <Tr>
                    <Td><MutedText>{item.eventId}</MutedText></Td>
                    <Td><CodeText>{item.movieId}</CodeText></Td>
                    <Td>
                      <TitleText>{item.title || <MutedText>(제목 없음)</MutedText>}</TitleText>
                      {item.memo && <MemoPreview>{item.memo}</MemoPreview>}
                    </Td>
                    <Td>
                      <PeriodText>
                        {item.startDate?.replace('T', ' ').substring(0, 16)} ~{' '}
                        {item.endDate?.replace('T', ' ').substring(0, 16)}
                      </PeriodText>
                    </Td>
                    <Td>
                      <StatusPill $color={STATUS_COLOR[item.status] ?? '#888'}>
                        {item.status}
                      </StatusPill>
                    </Td>
                    <Td><MutedText>{item.adminId ?? '-'}</MutedText></Td>
                    <Td>
                      <ActionGroup>
                        <SmallButton onClick={() => openEditModal(item)}>
                          <MdEdit size={13} /> 수정
                        </SmallButton>
                        {(STATUS_TRANSITION_BUTTONS[item.status] ?? []).map((btn) => (
                          <SmallButton
                            key={btn.target}
                            onClick={() => handleTransition(item, btn.target)}
                            disabled={busyId === item.eventId}
                          >
                            {btn.label}
                          </SmallButton>
                        ))}
                        <SmallButton
                          $active={verificationPanelEventId === item.eventId}
                          onClick={() => toggleVerificationPanel(item.eventId)}
                        >
                          <MdList size={13} /> 인증 목록
                        </SmallButton>
                        <DangerSmallButton
                          onClick={() => handleDelete(item)}
                          disabled={busyId === item.eventId}
                        >
                          <MdDelete size={13} /> 삭제
                        </DangerSmallButton>
                      </ActionGroup>
                    </Td>
                  </Tr>
                  {verificationPanelEventId === item.eventId && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <VerificationPanel>
                          <VerificationPanelHeader>
                            <VerificationPanelTitle>
                              인증 제출 목록 — 이벤트 #{item.eventId}
                            </VerificationPanelTitle>
                            <FilterSelect
                              value={verificationStatusFilter}
                              onChange={handleVerificationFilterChange}
                              style={{ fontSize: '12px', padding: '4px 8px' }}
                            >
                              {VERIFICATION_STATUS_FILTER_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </FilterSelect>
                          </VerificationPanelHeader>
                          {verificationsLoading ? (
                            <CenterCell>불러오는 중...</CenterCell>
                          ) : verifications.length === 0 ? (
                            <CenterCell>제출된 인증이 없습니다.</CenterCell>
                          ) : (
                            <VerificationTable>
                              <thead>
                                <tr>
                                  <VTh $w="44px">ID</VTh>
                                  <VTh $w="88px">유저</VTh>
                                  <VTh $w="56px">영수증</VTh>
                                  <VTh $w="140px">추출 영화명</VTh>
                                  <VTh $w="96px">관람일시</VTh>
                                  <VTh $w="44px">인원</VTh>
                                  <VTh $w="72px">좌석</VTh>
                                  <VTh $w="52px">상영관</VTh>
                                  <VTh $w="110px">영화관</VTh>
                                  <VTh $w="56px">신뢰도</VTh>
                                  <VTh $w="80px">상태</VTh>
                                  <VTh $w="100px">액션</VTh>
                                </tr>
                              </thead>
                              <tbody>
                                {verifications.map((v) => (
                                  <Fragment key={v.verificationId}>
                                    <VTr>
                                      <VTd><MutedText>{v.verificationId}</MutedText></VTd>
                                      <VTd><MutedText>{v.userNickname ?? v.userId ?? '-'}</MutedText></VTd>
                                      <VTd>
                                        {v.imageUrl ? (
                                          <ReceiptThumb
                                            src={v.imageUrl}
                                            alt="영수증"
                                            onClick={() => window.open(v.imageUrl, '_blank')}
                                          />
                                        ) : <MutedText>없음</MutedText>}
                                      </VTd>
                                      <VTd>{v.extractedMovieName ?? <MutedText>-</MutedText>}</VTd>
                                      {/* 관람일시: watched_at 우선, 없으면 watch_date */}
                                      <VTd>
                                        <MutedText>
                                          {v.extractedWatchedAt ?? v.extractedWatchDate ?? '-'}
                                        </MutedText>
                                      </VTd>
                                      <VTd>
                                        <MutedText>
                                          {v.extractedHeadcount != null ? `${v.extractedHeadcount}명` : '-'}
                                        </MutedText>
                                      </VTd>
                                      <VTd>
                                        {v.extractedSeat
                                          ? <SeatBadge>{v.extractedSeat}</SeatBadge>
                                          : <MutedText>-</MutedText>}
                                      </VTd>
                                      <VTd>
                                        {v.extractedTheater
                                          ? <TheaterBadge>{v.extractedTheater}</TheaterBadge>
                                          : <MutedText>-</MutedText>}
                                      </VTd>
                                      <VTd>
                                        {v.extractedVenue ?? <MutedText>-</MutedText>}
                                      </VTd>
                                      <VTd>
                                        {v.ocrConfidence != null
                                          ? <ConfidenceBadge $pct={Math.round(v.ocrConfidence * 100)}>{Math.round(v.ocrConfidence * 100)}%</ConfidenceBadge>
                                          : <MutedText>-</MutedText>}
                                      </VTd>
                                      <VTd>
                                        <StatusPill $color={VERIFICATION_STATUS_COLOR[v.status] ?? '#888'}>
                                          {v.status}
                                        </StatusPill>
                                      </VTd>
                                      <VTd>
                                        <ActionGroup>
                                          {v.parsedText && (
                                            <SmallButton
                                              $active={expandedRawId === v.verificationId}
                                              onClick={() => setExpandedRawId(
                                                expandedRawId === v.verificationId ? null : v.verificationId
                                              )}
                                              title="OCR 원문 보기"
                                            >
                                              <MdCode size={13} /> 원문
                                            </SmallButton>
                                          )}
                                          {v.status === 'PENDING' && (
                                            <>
                                              <ApproveButton
                                                onClick={() => handleReview(v.verificationId, 'APPROVE')}
                                                disabled={reviewingId != null}
                                              >
                                                승인
                                              </ApproveButton>
                                              <RejectButton
                                                onClick={() => handleReview(v.verificationId, 'REJECT')}
                                                disabled={reviewingId != null}
                                              >
                                                반려
                                              </RejectButton>
                                            </>
                                          )}
                                        </ActionGroup>
                                      </VTd>
                                    </VTr>
                                    {expandedRawId === v.verificationId && v.parsedText && (
                                      <tr>
                                        <td colSpan={12} style={{ padding: 0 }}>
                                          <RawTextPanel>
                                            <RawTextLabel>OCR 원문 (정규화 전)</RawTextLabel>
                                            <RawTextBody>{v.parsedText}</RawTextBody>
                                          </RawTextPanel>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                ))}
                              </tbody>
                            </VerificationTable>
                          )}
                          {verificationsTotalPages > 1 && (
                            <Pagination style={{ marginTop: '8px' }}>
                              <PageButton onClick={() => handleVerificationsPageChange(-1)} disabled={verificationsPage === 0}>이전</PageButton>
                              <PageInfo>{verificationsPage + 1} / {verificationsTotalPages}</PageInfo>
                              <PageButton onClick={() => handleVerificationsPageChange(1)} disabled={verificationsPage + 1 >= verificationsTotalPages}>다음</PageButton>
                            </Pagination>
                          )}
                        </VerificationPanel>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>

      {totalPages > 1 && (
        <Pagination>
          <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>이전</PageButton>
          <PageInfo>{page + 1} / {totalPages}</PageInfo>
          <PageButton onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>다음</PageButton>
        </Pagination>
      )}

      {modalMode && (
        <Overlay onClick={closeModal}>
          <DialogBox onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              {modalMode === MODE_CREATE ? 'OCR 이벤트 신규 등록' : 'OCR 이벤트 수정'}
            </DialogTitle>
            <form onSubmit={handleSubmit}>
              {/*
               * 2026-04-14: 영화 ID 텍스트 입력 → MovieSearchPicker.
               * Backend @NotBlank 는 handleSubmit 첫 줄에서 formMovie null 검사로 대체한다.
               * 편집 모드에서는 openEditModal 이 fetchMovieDetail 로 chip 을 선 복원한다.
               */}
              <Field>
                <Label>
                  대상 영화 *
                  {formMovieLoading && <LoadingHint> · 영화 정보 로딩 중...</LoadingHint>}
                </Label>
                <MovieSearchPicker
                  selectedMovie={formMovie}
                  onChange={setFormMovie}
                  placeholder="영화 제목으로 검색"
                />
              </Field>
              {/*
               * 2026-04-14 신규: title(필수) + memo(선택) 필드.
               * 유저 커뮤니티 "실관람인증" 탭 카드에 그대로 렌더된다.
               */}
              <Field>
                <Label>이벤트 제목 *</Label>
                <Input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  required
                  maxLength={200}
                  placeholder="예: 봄맞이 실관람 인증 이벤트"
                />
              </Field>
              <Field>
                <Label>이벤트 메모 / 상세 설명</Label>
                <TextArea
                  name="memo"
                  value={form.memo}
                  onChange={handleFormChange}
                  maxLength={2000}
                  rows={4}
                  placeholder={'유저 카드 본문에 노출됩니다.\n(예: 영화관에서 촬영한 영수증을 업로드해 주세요. 인증 완료 시 500P 지급!)'}
                />
              </Field>
              <FieldRow>
                <Field>
                  <Label>시작일 *</Label>
                  <Input
                    type="datetime-local"
                    name="startDate"
                    value={form.startDate}
                    onChange={handleFormChange}
                    required
                  />
                </Field>
                <Field>
                  <Label>종료일 *</Label>
                  <Input
                    type="datetime-local"
                    name="endDate"
                    value={form.endDate}
                    onChange={handleFormChange}
                    required
                  />
                </Field>
              </FieldRow>
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

/** 수정 모달에서 영화 상세 로딩 중임을 알리는 인라인 힌트 (Label 옆에 표시) */
const LoadingHint = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-weight: ${({ theme }) => theme.fontWeights.regular};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  margin-left: 4px;
`;
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
const FilterSelect = styled.select`
  padding: 6px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
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
const PeriodText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: 'Menlo', 'Monaco', monospace;
`;
const MutedText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`;
const StatusPill = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border-radius: 10px;
  color: #fff;
  background: ${({ $color }) => $color};
`;
const ActionGroup = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`;
const SmallButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  border-radius: 3px;
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textSecondary};
  background: ${({ $active, theme }) => $active ? theme.colors.bgHover : theme.colors.bgCard};
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
  max-width: 540px;
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
`;
/**
 * 메모(상세 설명) 입력용 textarea.
 * Input 과 동일한 시각 언어를 유지하면서 여러 줄 입력을 허용한다.
 */
const TextArea = styled.textarea`
  width: 100%;
  padding: 7px 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgCard};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; outline: none; }
`;
/** 테이블 "제목/메모" 컬럼의 제목 텍스트 (강조) */
const TitleText = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  word-break: break-word;
`;
/**
 * 테이블 "제목/메모" 컬럼의 메모 미리보기.
 * 2줄로 제한 — 긴 텍스트는 줄임표로 자르고 hover 시 title 속성으로 전체 노출 가능.
 */
const MemoPreview = styled.div`
  margin-top: 2px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  white-space: pre-wrap;
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

/* ── Verification Panel ── */

const VerificationPanel = styled.div`
  background: ${({ theme }) => theme.colors.bgHover};
  border-top: 2px solid ${({ theme }) => theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.md};
`;
const VerificationPanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;
const VerificationPanelTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;
const VerificationTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: 4px;
  overflow: hidden;
`;
const VTh = styled.th`
  text-align: left;
  padding: 7px 10px;
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 11px;
  white-space: nowrap;
  width: ${({ $w }) => $w ?? 'auto'};
`;
const VTr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;
const VTd = styled.td`
  padding: 7px 10px;
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
  font-size: 12px;
`;
const ReceiptThumb = styled.img`
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid ${({ theme }) => theme.colors.border};
  &:hover { opacity: 0.8; }
`;
const ConfidenceBadge = styled.span`
  display: inline-block;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ $pct }) => $pct >= 80 ? '#d1fae5' : $pct >= 50 ? '#fef3c7' : '#fee2e2'};
  color: ${({ $pct }) => $pct >= 80 ? '#065f46' : $pct >= 50 ? '#92400e' : '#991b1b'};
`;
const SeatBadge = styled.span`
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Menlo', 'Monaco', monospace;
  background: #ede9fe;
  color: #5b21b6;
  white-space: nowrap;
`;
const TheaterBadge = styled.span`
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Menlo', 'Monaco', monospace;
  background: #e0f2fe;
  color: #075985;
  white-space: nowrap;
`;
const RawTextPanel = styled.div`
  background: #0f172a;
  padding: 10px 14px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;
const RawTextLabel = styled.div`
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;
const RawTextBody = styled.pre`
  margin: 0;
  font-size: 11px;
  font-family: 'Menlo', 'Monaco', monospace;
  color: #a3e635;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
  max-height: 280px;
  overflow-y: auto;
`;
const ApproveButton = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 3px;
  border: 1px solid #10b981;
  color: #10b981;
  background: transparent;
  &:hover:not(:disabled) { background: #d1fae5; }
  &:disabled { opacity: 0.4; }
`;
const RejectButton = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.colors.error};
  color: ${({ theme }) => theme.colors.error};
  background: transparent;
  &:hover:not(:disabled) { background: #fee2e2; }
  &:disabled { opacity: 0.4; }
`;
