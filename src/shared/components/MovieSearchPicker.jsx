/**
 * 영화 검색 픽커 — 제목(title)으로 영화를 검색해 선택한다.
 *
 * 2026-04-14 신규. 관리자 페이지의 리뷰/월드컵/퀴즈/코스 등에서 기존에
 * movieId(PK)를 텍스트로 직접 입력받아 검색/지정하던 UX 를,
 * 운영자가 영화 제목만 기억해도 되도록 제목 기반 Autocomplete 로 교체한다.
 *
 * 동작:
 *  - 입력창에 키워드를 타이핑 → 350ms 디바운스 후
 *    `GET /admin/movies?keyword=` (FastAPI Agent :8000 — dataApi.fetchMovies) 호출
 *  - 결과 드롭다운에서 영화 선택 → onChange(movie) 호출
 *  - 선택된 영화는 칩 형태로 표시 + X 버튼으로 해제
 *
 * 백엔드 WHERE 절: `(title LIKE %s OR title_en LIKE %s)` — 한/영 제목 모두 매칭.
 *
 * @param {Object}   props
 * @param {?Object}  props.selectedMovie      - 선택된 영화 ({ movieId, title, titleEn, releaseYear, posterPath })
 * @param {Function} props.onChange           - (movie|null) => void
 * @param {string}   [props.placeholder]      - 플레이스홀더
 * @param {boolean}  [props.disabled]         - 비활성화
 * @param {string}   [props.label]            - 상단 레이블 (optional)
 */

import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { MdSearch, MdClose, MdMovie } from 'react-icons/md';
import { fetchMovies } from '@/features/data/api/dataApi';
import { normalizeMovie } from './movieSearchPickerUtils';

/** 디바운스 시간 (ms) */
const DEBOUNCE_MS = 350;
/** 검색 결과 최대 개수 */
const SEARCH_SIZE = 10;

export default function MovieSearchPicker({
  selectedMovie,
  onChange,
  placeholder = '영화 제목으로 검색',
  disabled = false,
  label,
}) {
  /** 입력 중인 키워드 */
  const [keyword, setKeyword] = useState('');
  /** 검색 결과 목록 (정규화된 형태) */
  const [results, setResults] = useState([]);
  /** 드롭다운 표시 여부 */
  const [open, setOpen] = useState(false);
  /** 로딩/에러 상태 */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /** 디바운스 타이머 참조 */
  const debounceRef = useRef(null);
  /** 외부 클릭 감지용 컨테이너 참조 */
  const containerRef = useRef(null);

  /* 외부 클릭 시 드롭다운 닫기 */
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* 키워드 변경 → 디바운스 후 검색 */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = keyword.trim();
    /* 선택된 영화가 있는 동안은 자동 검색하지 않는다 */
    if (selectedMovie || !trimmed) {
      setResults([]);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const page = await fetchMovies({ keyword: trimmed, page: 0, size: SEARCH_SIZE });
        /* Agent 응답은 { content: [...] } 형태. 혹시 { items: [...] } 도 방어 */
        const raw = page?.content ?? page?.items ?? [];
        setResults(raw.map(normalizeMovie).filter(Boolean));
        setOpen(true);
      } catch (err) {
        setError(err?.message ?? '검색 중 오류가 발생했습니다.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [keyword, selectedMovie]);

  /* 선택/해제 */
  function handleSelect(movie) {
    onChange?.(movie);
    setKeyword('');
    setResults([]);
    setOpen(false);
  }

  function handleClear() {
    onChange?.(null);
    setKeyword('');
    setResults([]);
  }

  return (
    <Wrapper ref={containerRef}>
      {label && <Label>{label}</Label>}

      {selectedMovie ? (
        /* 선택된 영화 칩 */
        <SelectedChip $disabled={disabled}>
          <ChipIcon><MdMovie size={14} /></ChipIcon>
          <ChipMain>
            <ChipTitle title={selectedMovie.title}>
              {selectedMovie.title}
              {selectedMovie.releaseYear ? <YearSpan> ({selectedMovie.releaseYear})</YearSpan> : null}
            </ChipTitle>
            {selectedMovie.titleEn && (
              <ChipTitleEn title={selectedMovie.titleEn}>{selectedMovie.titleEn}</ChipTitleEn>
            )}
          </ChipMain>
          <ChipId title={selectedMovie.movieId}>{selectedMovie.movieId}</ChipId>
          {!disabled && (
            <ClearButton type="button" onClick={handleClear} aria-label="선택 해제">
              <MdClose size={16} />
            </ClearButton>
          )}
        </SelectedChip>
      ) : (
        <>
          {/* 검색 입력 */}
          <InputRow>
            <SearchIcon>
              <MdSearch size={16} />
            </SearchIcon>
            <SearchInput
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onFocus={() => keyword && setOpen(true)}
              placeholder={placeholder}
              disabled={disabled}
            />
          </InputRow>

          {/* 결과 드롭다운 */}
          {open && (results.length > 0 || loading || error) && (
            <Dropdown>
              {loading && <DropdownMsg>검색 중...</DropdownMsg>}
              {error && <DropdownMsg $error>{error}</DropdownMsg>}
              {!loading && !error && results.length === 0 && (
                <DropdownMsg>검색 결과가 없습니다.</DropdownMsg>
              )}
              {!loading &&
                results.map((movie) => (
                  <DropdownItem
                    key={movie.movieId}
                    type="button"
                    onClick={() => handleSelect(movie)}
                  >
                    <ItemLine>
                      <ItemTitle>
                        {movie.title}
                        {movie.releaseYear ? <YearSpan> ({movie.releaseYear})</YearSpan> : null}
                      </ItemTitle>
                      {movie.titleEn && <ItemTitleEn>{movie.titleEn}</ItemTitleEn>}
                    </ItemLine>
                    <ItemMovieId>{movie.movieId}</ItemMovieId>
                  </DropdownItem>
                ))}
            </Dropdown>
          )}
        </>
      )}
    </Wrapper>
  );
}

/* ── styled-components ── */

const Wrapper = styled.div`
  position: relative;
  width: 100%;
  max-width: 420px;
`;

const Label = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const InputRow = styled.div`
  position: relative;
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.colors.textMuted};
`;

const SearchInput = styled.input`
  width: 100%;
  height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.md} 0 32px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgCard};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
  z-index: 100;
`;

const DropdownMsg = styled.div`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ $error, theme }) =>
    $error ? theme.colors.error : theme.colors.textMuted};
  text-align: center;
`;

const DropdownItem = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  gap: 2px;
  text-align: left;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  transition: background ${({ theme }) => theme.transitions.fast};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;

const ItemLine = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
`;

const ItemTitle = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ItemTitleEn = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ItemMovieId = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
  margin-top: 2px;
`;

const YearSpan = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-weight: ${({ theme }) => theme.fontWeights.regular};
`;

const SelectedChip = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: 6px ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.primaryBg};
  opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};
`;

const ChipIcon = styled.span`
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.primary};
`;

const ChipMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
`;

const ChipTitle = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChipTitleEn = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChipId = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ClearButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: background ${({ theme }) => theme.transitions.fast};
  margin-left: auto;

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.error};
  }
`;
