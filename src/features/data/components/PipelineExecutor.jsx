/**
 * 파이프라인 실행 컴포넌트.
 * Agent admin_data.py 의 9개 작업 목록을 서버에서 받아 드롭다운으로 선택하고,
 * 실행/취소·SSE 로그 스트림·상태 polling 을 job-id 기반으로 처리한다.
 *
 * 2026-04-15 재정비:
 *  - 작업 코드를 서버(`GET /admin/pipeline`)에서 로드 → 프론트/Agent 불일치 제거.
 *  - run 응답에서 `job_id` 를 받아 cancel/logs 에 일관되게 전달.
 *  - `GET /admin/pipeline/history?status=RUNNING` 로 현재 진행 중 작업을 확인.
 *  - Agent 는 `{task_code, args[]}` 만 허용하므로, UI 옵션(clear_db/resume)은
 *    CLI 플래그로 변환하여 전송.
 *  - Agent 미제공이던 checkpoint 조회는 제거 (이력 탭에서 이전 실행 결과 확인).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { MdPlayArrow, MdStop, MdRefresh, MdExpandMore } from 'react-icons/md';
import StatusBadge from '@/shared/components/StatusBadge';
import {
  fetchPipelineTasks,
  runPipeline,
  cancelPipeline,
  fetchActivePipelineJob,
  getPipelineLogUrl,
} from '../api/dataApi';
import { SERVICE_URLS } from '@/shared/api/serviceUrls';

/** 파이프라인 상태 → 뱃지 매핑 (Agent 는 대문자 상태를 반환: RUNNING/SUCCESS/FAILED/CANCELLED) */
function getPipelineStatusBadge(status) {
  switch (status) {
    case 'RUNNING':   return { status: 'info',    label: '실행 중' };
    case 'SUCCESS':   return { status: 'success', label: '완료' };
    case 'FAILED':    return { status: 'error',   label: '오류' };
    case 'CANCELLED': return { status: 'warning', label: '취소됨' };
    case 'IDLE':
    default:          return { status: 'default', label: status ? status : '대기' };
  }
}

/** clear_db / resume 옵션 → CLI 인자 변환 규칙 (Agent 가 subprocess 로 호출하는 스크립트 기준). */
function buildPipelineArgs({ clearDb, resumeMode }) {
  const args = [];
  if (clearDb) args.push('--clear-db');
  if (resumeMode) args.push('--resume');
  return args;
}

export default function PipelineExecutor() {
  /* ── 작업 메타 (서버에서 로드) ── */
  const [tasks, setTasks] = useState([]);           // [{code, name, description, category}, ...]
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState(null);

  /* ── 작업 선택 상태 ── */
  const [selectedTask, setSelectedTask] = useState('');
  const [clearDb, setClearDb] = useState(false);
  const [resumeMode, setResumeMode] = useState(false);

  /* ── 실행 상태 ── */
  const [activeJob, setActiveJob] = useState(null); // {job_id, task_code, task_name, status, started_at}
  const [runLoading, setRunLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [statusError, setStatusError] = useState(null);

  /* ── SSE 로그 ── */
  const [logs, setLogs] = useState([]);
  const logEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  /* ── polling 타이머 ── */
  const pollTimerRef = useRef(null);

  /** 9개 작업 메타 로드 (초기 1회) */
  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const result = await fetchPipelineTasks();
      const list = result?.tasks ?? [];
      setTasks(list);
      // 기본 선택: 첫 번째 작업
      if (list.length > 0) setSelectedTask((prev) => prev || list[0].code);
    } catch (err) {
      setTasksError(err.message);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  /** 현재 실행 중 작업 1회 조회 */
  const loadActiveJob = useCallback(async () => {
    try {
      const job = await fetchActivePipelineJob();
      setActiveJob(job);
      setStatusError(null);
    } catch (err) {
      setStatusError(err.message);
    }
  }, []);

  /* 초기 로드 */
  useEffect(() => {
    loadTasks();
    loadActiveJob();
  }, [loadTasks, loadActiveJob]);

  /* 실행 중일 때 30초 polling */
  useEffect(() => {
    if (activeJob?.status === 'RUNNING') {
      pollTimerRef.current = setInterval(loadActiveJob, 30000);
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [activeJob?.status, loadActiveJob]);

  /* 로그 자동 스크롤 */
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  /* 컴포넌트 언마운트 시 SSE / 타이머 정리 */
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  /** 특정 job 의 SSE 로그 스트림 구독 시작 */
  function subscribeLogStream(jobId) {
    if (!jobId) return;
    // 기존 연결 정리
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    const url = `${SERVICE_URLS.AGENT}${getPipelineLogUrl(jobId)}`;
    const es = new EventSource(url, { withCredentials: false });

    // Agent 는 `log` / `ping` / `done` 커스텀 이벤트로 내려주므로 addEventListener 로 받는다.
    es.addEventListener('log', (e) => {
      setLogs((prev) => [...prev.slice(-500), e.data]);
    });

    es.addEventListener('done', () => {
      es.close();
      eventSourceRef.current = null;
      loadActiveJob();
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };

    eventSourceRef.current = es;
  }

  /** 파이프라인 실행 */
  async function handleRun() {
    if (!selectedTask) return;
    setRunLoading(true);
    setLogs([]);
    try {
      const args = buildPipelineArgs({ clearDb, resumeMode });
      const result = await runPipeline({ task_code: selectedTask, args });
      const jobId = result?.job_id;
      const taskMeta = tasks.find((t) => t.code === selectedTask);
      setLogs([
        `[시작] ${taskMeta?.name ?? selectedTask} 파이프라인 실행 (job_id=${jobId})`,
      ]);
      setActiveJob({
        job_id: jobId,
        task_code: selectedTask,
        task_name: taskMeta?.name,
        status: 'RUNNING',
        started_at: result?.started_at,
      });
      // SSE 로그 구독
      subscribeLogStream(jobId);
    } catch (err) {
      setLogs([`[오류] ${err.message}`]);
    } finally {
      setRunLoading(false);
    }
  }

  /** 파이프라인 취소 */
  async function handleCancel() {
    if (!activeJob?.job_id) return;
    setCancelLoading(true);
    try {
      await cancelPipeline(activeJob.job_id);
      setLogs((prev) => [...prev, '[취소] 파이프라인 취소 요청 전송']);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      await loadActiveJob();
    } catch (err) {
      setLogs((prev) => [...prev, `[오류] 취소 실패: ${err.message}`]);
    } finally {
      setCancelLoading(false);
    }
  }

  const isRunning = activeJob?.status === 'RUNNING';
  const badge = getPipelineStatusBadge(activeJob?.status ?? 'IDLE');
  const selectedTaskMeta = tasks.find((t) => t.code === selectedTask);

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>파이프라인 실행</SectionTitle>
        <RefreshButton onClick={loadActiveJob} title="상태 새로고침">
          <MdRefresh size={16} />
        </RefreshButton>
      </SectionHeader>

      {statusError && <ErrorMsg>상태 조회 오류: {statusError}</ErrorMsg>}
      {tasksError && <ErrorMsg>작업 목록 로드 오류: {tasksError}</ErrorMsg>}

      {/* 현재 파이프라인 상태 카드 */}
      <StatusCard>
        <StatusRow>
          <StatusLabel>현재 상태</StatusLabel>
          <StatusBadge status={badge.status} label={badge.label} />
        </StatusRow>

        {activeJob?.task_name && (
          <StatusRow>
            <StatusLabel>실행 중 작업</StatusLabel>
            <StatusValue>{activeJob.task_name}</StatusValue>
          </StatusRow>
        )}

        {activeJob?.job_id && (
          <StatusRow>
            <StatusLabel>Job ID</StatusLabel>
            <StatusValue>{activeJob.job_id}</StatusValue>
          </StatusRow>
        )}

        {activeJob?.started_at && (
          <StatusRow>
            <StatusLabel>시작 시각</StatusLabel>
            <StatusValue>
              {new Date(activeJob.started_at).toLocaleString('ko-KR')}
            </StatusValue>
          </StatusRow>
        )}
      </StatusCard>

      {/* 작업 선택 영역 */}
      {!isRunning && (
        <ConfigArea>
          <ConfigTitle>작업 설정</ConfigTitle>

          <TaskSelectWrapper>
            <TaskSelect
              value={selectedTask}
              onChange={(e) => setSelectedTask(e.target.value)}
              disabled={tasksLoading || tasks.length === 0}
            >
              {tasks.length === 0 && (
                <option value="">
                  {tasksLoading ? '작업 목록 로딩 중...' : '사용 가능한 작업 없음'}
                </option>
              )}
              {tasks.map((task) => (
                <option key={task.code} value={task.code}>
                  {task.name}
                </option>
              ))}
            </TaskSelect>
            <SelectIcon><MdExpandMore size={16} /></SelectIcon>
          </TaskSelectWrapper>

          {selectedTaskMeta && (
            <TaskDesc>{selectedTaskMeta.description}</TaskDesc>
          )}

          <OptionRow>
            <Checkbox
              id="opt-clear-db"
              type="checkbox"
              checked={clearDb}
              onChange={(e) => setClearDb(e.target.checked)}
            />
            <CheckLabel htmlFor="opt-clear-db">
              DB 초기화 후 실행 (--clear-db, full_reload 전용)
            </CheckLabel>
          </OptionRow>

          <OptionRow>
            <Checkbox
              id="opt-resume"
              type="checkbox"
              checked={resumeMode}
              onChange={(e) => setResumeMode(e.target.checked)}
            />
            <CheckLabel htmlFor="opt-resume">
              체크포인트부터 재개 (--resume)
            </CheckLabel>
          </OptionRow>

          <RunButton onClick={handleRun} disabled={runLoading || !selectedTask}>
            <MdPlayArrow size={18} />
            {runLoading ? '시작 중...' : '실행'}
          </RunButton>
        </ConfigArea>
      )}

      {/* 실행 중 취소 버튼 */}
      {isRunning && (
        <CancelArea>
          <CancelButton onClick={handleCancel} disabled={cancelLoading}>
            <MdStop size={18} />
            {cancelLoading ? '취소 중...' : '파이프라인 취소'}
          </CancelButton>
        </CancelArea>
      )}

      {/* 실시간 로그 */}
      {logs.length > 0 && (
        <LogSection>
          <LogHeader>
            <LogTitle>실행 로그</LogTitle>
            <ClearLogButton onClick={() => setLogs([])}>지우기</ClearLogButton>
          </LogHeader>
          <LogBox>
            {logs.map((line, i) => (
              /* 로그 라인은 순서가 중요하므로 index 사용 허용 */
              <LogLine key={`log-${i}`} $isError={line.startsWith('[오류]')}>
                {line}
              </LogLine>
            ))}
            <div ref={logEndRef} />
          </LogBox>
        </LogSection>
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
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const StatusCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm} 0;

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
  }
`;

const StatusLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const StatusValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const ConfigArea = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const ConfigTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const TaskSelectWrapper = styled.div`
  position: relative;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const TaskSelect = styled.select`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  padding-right: 36px;
  background: ${({ theme }) => theme.colors.bgBase ?? theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  appearance: none;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SelectIcon = styled.div`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const TaskDesc = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const OptionRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: ${({ theme }) => theme.colors.primary};
`;

const CheckLabel = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
`;

const RunButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.xxl};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; }
`;

const CancelArea = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const CancelButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.xxl};
  background: ${({ theme }) => theme.colors.error};
  color: #fff;
  border-radius: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; }
`;

const LogSection = styled.div``;

const LogHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const LogTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ClearLogButton = styled.button`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  &:hover { color: ${({ theme }) => theme.colors.textSecondary}; }
`;

const LogBox = styled.div`
  background: #0d1117;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  padding: ${({ theme }) => theme.spacing.lg};
  max-height: 320px;
  overflow-y: auto;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 12px;
  line-height: 1.6;
`;

const LogLine = styled.div`
  color: ${({ $isError }) => ($isError ? '#f87171' : '#e2e8f0')};
  white-space: pre-wrap;
  word-break: break-all;
`;
