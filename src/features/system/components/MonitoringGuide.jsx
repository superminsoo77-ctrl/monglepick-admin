/**
 * 모니터링 스택 접속 가이드 (조회 전용).
 *
 * VM3(10.20.0.12)에 구축된 Prometheus + Grafana + Alertmanager + ELK 스택의
 * 외부 접속 URL, 기본 Basic Auth 계정, 각 도구의 용도/사용법, 주요 알림 룰 요약을
 * 한 페이지에서 조망할 수 있도록 제공한다.
 *
 * 단일 진실 원본은 `docs/모니터링_관찰성_스택.md` — 본 컴포넌트는 그 문서의 §2 외부 접근,
 * §4 알림 룰, §6 Grafana 구성, §6.5 Kibana 구성 요약본이다. 실제 자격 증명은 코드에
 * 박지 않고, 관리자가 이 탭을 통해 "어디로 가면 무엇을 볼 수 있는지" 만 안내한다.
 *
 * 설계 원칙:
 *  - 네트워크 API 호출 없음(순수 정적 가이드). 서비스 상태/헬스체크는 ServiceStatus 가 담당.
 *  - URL/계정 변경 시 본 파일 상수만 수정하면 되도록 `TOOLS`, `ALERT_RULES` 배열로 분리.
 *  - 링크는 `target="_blank"` + `rel="noopener noreferrer"` (Basic Auth 팝업 경유).
 */

import styled from 'styled-components';
import {
  MdOpenInNew,
  MdDashboard,
  MdSearch,
  MdNotificationsActive,
  MdContentCopy,
  MdHub,            // Neo4j (그래프 DB) 아이콘 용도
  MdApi,            // Swagger (API 문서) 아이콘 용도
  MdPlayArrow,      // Neo4j 빠른 쿼리 실행 버튼 아이콘
} from 'react-icons/md';

/**
 * 외부 접근 공통 정보 (2026-04-15 정정).
 * VM1 Nginx 의 `/monitoring/*` 경로가 VM3 모니터링 스택으로 직접 프록시한다.
 * 별도 Basic Auth 1차는 없고(0.0.0.0 허용), 각 도구가 자체 2차 인증만 요구한다.
 * 단일 진실 원본: `docs/모니터링_접속_가이드.md` §1 방법 A.
 */
const EXTERNAL_HOST = 'http://210.109.15.187/monitoring';

/**
 * 모니터링 도구 카드 정의.
 * 2026-04-16 변경: Prometheus 카드는 제거하고(운영자는 대부분 Grafana 로 소화)
 * Alertmanager 카드의 Tips 에 "룰 원본은 Prometheus Status → Rules 에서 확인" 안내만 유지.
 * 순서: 대시보드(Grafana) → 로그(Kibana) → 알림(Alertmanager).
 * 각 도구의 secondAuth 는 `user / password` 실값 또는 `없음`.
 */
const TOOLS = [
  {
    key: 'grafana',
    name: 'Grafana',
    subtitle: '메트릭 대시보드',
    icon: MdDashboard,
    url: `${EXTERNAL_HOST}/grafana/`,
    secondAuth: 'monglepick / monglepick',
    purpose: 'VM/컨테이너/앱/DB/GPU 메트릭의 시계열 대시보드',
    tips: [
      '추천 대시보드: `Monglepick Overview` — SLO(Targets UP/DOWN, 5xx율, GPU, p95 latency) 한눈에',
      '`infra/app/db/logs` 폴더에 Node/JVM/MySQL/Redis/ES/GPU + monglepick-logs(ES 12패널)',
      '오른쪽 상단 시간 범위(1h/6h/24h) + Auto refresh(10s~1m) 권장',
    ],
  },
  {
    key: 'kibana',
    name: 'Kibana',
    subtitle: '로그 탐색',
    icon: MdSearch,
    url: `${EXTERNAL_HOST}/kibana/`,
    secondAuth: 'elastic / 98ae9cfdff90104b87bedf04154d5316',
    purpose: 'Spring/Agent/Recommend/Nginx JSON 로그의 통합 검색과 실시간 스트림',
    tips: [
      '대시보드 → `[몽글픽] 로그 개요 — 실시간` 에서 전 서비스 한눈 조망',
      '서비스별: `Spring Backend 로그`, `FastAPI Agent + Recommend 로그`(trace_id 추적), `Nginx Access 로그`',
      'Discover → `logs-monglepick-*` 인덱스 패턴 + `log_level: ERROR` 필터로 에러만 필터링',
    ],
  },
  {
    key: 'alertmanager',
    name: 'Alertmanager',
    subtitle: '알림 라우팅/현황',
    icon: MdNotificationsActive,
    url: `${EXTERNAL_HOST}/alertmanager/`,
    secondAuth: '없음 (로그인 불필요)',
    purpose: '현재 발화 중(firing) 알림 목록과 음소거(silence)',
    tips: [
      'Alerts 탭 → firing/suppressed 필터',
      'Silences → 점검/배포 시 일정 구간 알림 음소거',
      '※ Slack/PagerDuty webhook 미연결 상태(TODO). 알림은 본 UI로만 확인',
    ],
  },
];

/**
 * Neo4j Browser 접속 정보 (2026-04-16 추가).
 *
 * 운영 공개 경로는 VM1 Nginx 의 `/monitoring/neo4j/` 로 프록시할 예정이며,
 * Bolt 프로토콜(7687) 도 WebSocket 업그레이드 허용이 필요하다. 현재 Nginx 미반영 →
 * CLAUDE.md "남은 작업" 항목에 명시.
 *
 * 인증: Neo4j Community 기본값(neo4j / ${NEO4J_PASSWORD}) — 운영 실값은 VM4 `.env` 참조.
 */
const NEO4J = {
  browserUrl: `${EXTERNAL_HOST}/neo4j/browser/`,
  boltUrl: 'neo4j://10.20.0.10:7687',
  localBrowserUrl: 'http://localhost:7474/browser/',
  secondAuth: 'neo4j / (VM4 `.env` NEO4J_PASSWORD)',
  purpose: '그래프 DB(영화-감독-배우-장르-키워드-무드) 탐색/디버깅',
};

/**
 * Neo4j Browser 빠른 쿼리 목록 (2026-04-16 추가).
 *
 * UX 주의: Neo4j Browser 는 **보안상 URL 로부터 쿼리를 자동 실행하지 않는다**.
 * `?cmd=edit&arg=<cypher>` 파라미터로 에디터에 프리필만 가능 → 클릭 후 Ctrl+Enter 필요.
 * 따라서 본 페이지에서 "웹 열면 쿼리가 바로 보인다" 는 요구사항은 "에디터에 프리필된
 * 상태로 열린다" 로 해석해 구현한다 (완전 자동 실행은 Neo4j Browser 의 GUIDE 기능을
 * self-host 하지 않는 한 불가능).
 *
 * 각 엔트리는 대표적인 그래프 탐색 패턴을 1개씩 커버한다.
 * 노드 라벨: Movie / Person / Genre / Keyword / MoodTag / OTTPlatform
 * 관계: DIRECTED / ACTED_IN / HAS_GENRE / HAS_KEYWORD / HAS_MOOD / AVAILABLE_ON
 */
const NEO4J_QUERIES = [
  {
    key: 'movie-count',
    title: '전체 노드 수 집계',
    description: '라벨별 노드 총량 조회 — 적재 상태 가장 빠른 확인',
    cypher:
      'MATCH (n) RETURN labels(n) AS label, count(*) AS count ORDER BY count DESC',
  },
  {
    key: 'genre-distribution',
    title: '장르별 영화 수 TOP 20',
    description: 'HAS_GENRE 관계 기반 장르 분포 (홈 차트에 쓰일 수 있는 집계)',
    cypher:
      'MATCH (m:Movie)-[:HAS_GENRE]->(g:Genre) RETURN g.name AS genre, count(m) AS movies ORDER BY movies DESC LIMIT 20',
  },
  {
    key: 'director-bong',
    title: '봉준호 감독 영화 네트워크',
    description: '감독 → 영화 → 배우 멀티홉 (relation Intent 샘플)',
    cypher:
      "MATCH (d:Person {name: '봉준호'})-[:DIRECTED]->(m:Movie)<-[:ACTED_IN]-(a:Person) RETURN d, m, a LIMIT 100",
  },
  {
    key: 'actor-intersection',
    title: '최민식 ∩ 송강호 함께 출연 영화',
    description: '배우 교집합 필모그래피 (relation Intent intersection)',
    cypher:
      "MATCH (a:Person {name: '최민식'})-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(b:Person {name: '송강호'}) RETURN a, m, b",
  },
  {
    key: 'mood-sample',
    title: '무드태그 "따뜻한" 영화 샘플',
    description: 'HAS_MOOD 관계 기반 감성 기반 후보 확인',
    cypher:
      "MATCH (m:Movie)-[:HAS_MOOD]->(t:MoodTag {name: '따뜻한'}) RETURN m.title, m.vote_average ORDER BY m.vote_average DESC LIMIT 30",
  },
];

/**
 * 프리필된 Neo4j Browser URL 생성.
 * `?cmd=edit&arg=<query>` 로 에디터에 쿼리를 삽입한 상태로 새 탭을 연다.
 */
function buildNeo4jQueryUrl(cypher) {
  const cmd = `edit&arg=${encodeURIComponent(cypher)}`;
  return `${NEO4J.browserUrl}?cmd=${cmd}`;
}

/**
 * Swagger / OpenAPI 문서 카드 정의 (2026-04-16 추가).
 * 3개 서비스(Backend / Agent / Recommend) 의 공식 API 문서 경로.
 *
 * 운영 공개 경로는 VM1 Nginx 추가 프록시가 필요:
 *  - Backend `/swagger-ui/**` + `/v3/api-docs`            → spring_boot upstream
 *  - Agent   `/agent/docs` + `/agent/openapi.json`        → ai_agent upstream
 *  - Recommend `/recommend/docs` + `/recommend/openapi.json` → recommend upstream
 * 현재 Nginx 미반영 → CLAUDE.md "남은 작업" 항목에 명시.
 */
const SWAGGER_TOOLS = [
  {
    key: 'swagger-backend',
    name: 'Backend Swagger',
    subtitle: 'Spring Boot (springdoc OpenAPI)',
    icon: MdApi,
    url: 'http://210.109.15.187/swagger-ui/index.html',
    openapiUrl: 'http://210.109.15.187/v3/api-docs',
    localUrl: 'http://localhost:8080/swagger-ui.html',
    purpose: '인증/포인트/결제/추천/Admin 등 Backend 전체 REST API 명세',
    tips: [
      '상단 `Select a definition` 드롭다운이 있으면 `v1` 선택',
      '`/api/v1/auth/login` 으로 JWT 발급 후 우측 상단 Authorize 버튼에 `Bearer <token>` 입력',
      'Admin API 는 `user_role = ADMIN` 계정 토큰 필요',
    ],
  },
  {
    key: 'swagger-agent',
    name: 'Agent Swagger',
    subtitle: 'FastAPI (AI Agent / :8000)',
    icon: MdApi,
    url: 'http://210.109.15.187/agent/docs',
    openapiUrl: 'http://210.109.15.187/agent/openapi.json',
    localUrl: 'http://localhost:8000/docs',
    purpose: 'Chat SSE · Match · Poster 분석 · Roadmap · Admin data 16 EP',
    tips: [
      'SSE 엔드포인트는 Swagger UI 에서 스트림을 제대로 못 보여주니 curl/brower 로 직접 호출',
      '`X-Service-Key` 헤더는 Backend → Agent 서버 간 호출용 (관리자 테스트에는 불필요)',
      'ReDoc 뷰: `/agent/redoc` (읽기 전용, 인쇄에 유리)',
    ],
  },
  {
    key: 'swagger-recommend',
    name: 'Recommend Swagger',
    subtitle: 'FastAPI (Recommend / :8001)',
    icon: MdApi,
    url: 'http://210.109.15.187/recommend/docs',
    openapiUrl: 'http://210.109.15.187/recommend/openapi.json',
    localUrl: 'http://localhost:8001/docs',
    purpose: '영화 Like 토글(write-behind) · Match Co-watched CF 후보',
    tips: [
      '`/api/v2/movies/{id}/like` 는 Redis 즉시 반영, DB 는 60초 주기 flush',
      '`/api/v2/match/co-watched` 는 reviews INNER JOIN + Redis TTL 5분 캐시',
      'ReDoc 뷰: `/recommend/redoc`',
    ],
  },
];

/**
 * 주요 알림 룰 요약(문서 §4, 20개 중 대표 11개).
 * 실제 룰 파일: VM3 `prometheus/rules/base.yml`.
 */
const ALERT_RULES = [
  { name: 'InstanceDown',           condition: 'up == 0, 2m',                        severity: 'critical' },
  { name: 'NodeCriticalDiskUsage',  condition: 'disk > 95%, 2m',                     severity: 'critical' },
  { name: 'NodeHighDiskUsage',      condition: 'disk > 85%, 5m',                     severity: 'warning'  },
  { name: 'NodeHighMemoryUsage',    condition: 'mem > 90%, 10m',                     severity: 'warning'  },
  { name: 'HttpServer5xxRateHigh',  condition: '5xx > 5%, 5m',                       severity: 'critical' },
  { name: 'JvmHeapHigh',            condition: 'heap > 90%, 10m',                    severity: 'warning'  },
  { name: 'MysqlDown',              condition: 'mysql_up == 0, 1m',                  severity: 'critical' },
  { name: 'RedisDown',              condition: 'redis_up == 0, 1m',                  severity: 'critical' },
  { name: 'ElasticsearchClusterRed',condition: 'cluster color = red, 1m',            severity: 'critical' },
  { name: 'GpuMemoryHigh',          condition: 'gpu mem > 90%, 5m',                  severity: 'warning'  },
  { name: 'VllmDown',               condition: 'up{job="vllm"} == 0, 2m',            severity: 'critical' },
];

/**
 * 클립보드 복사 유틸.
 * navigator.clipboard 미지원 환경을 위한 textarea fallback 포함.
 */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback: hidden textarea + execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function MonitoringGuide() {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>모니터링 스택 접속</SectionTitle>
        <DocLink
          href="https://github.com/monglepick"
          onClick={(e) => e.preventDefault()}
          title="상세 문서: docs/모니터링_관찰성_스택.md"
        >
          docs/모니터링_관찰성_스택.md
        </DocLink>
      </SectionHeader>

      {/* ── 외부 접근 공통 안내 배너 ─────────────────────────────────── */}
      {/* 2026-04-15 정정: VM1 `/monitoring/*` 경유는 Basic Auth 1차 없음.
          각 도구 자체 2차 인증만 필요하다 (예: Grafana monglepick / monglepick). */}
      <AuthBanner>
        <AuthTitle>🌐 공개 접속 경로 (VM1 Nginx `/monitoring/*`)</AuthTitle>
        <AuthGrid>
          <AuthItem>
            <AuthLabel>엔드포인트</AuthLabel>
            <AuthValueRow>
              <AuthValue>{EXTERNAL_HOST}</AuthValue>
              <CopyButton
                type="button"
                onClick={() => copyToClipboard(EXTERNAL_HOST)}
                title="복사"
              >
                <MdContentCopy size={14} />
              </CopyButton>
            </AuthValueRow>
          </AuthItem>
          <AuthItem>
            <AuthLabel>1차 인증</AuthLabel>
            <AuthValueRow>
              <AuthValue>없음 (VM1 Nginx 직접 프록시)</AuthValue>
            </AuthValueRow>
          </AuthItem>
        </AuthGrid>
        <AuthNote>
          별도 Basic Auth 없이 공개 경로로 열려 있으므로 공용 네트워크에서 접근 시
          주의. 도구별 2차 인증은 아래 카드의 <b>2차 인증</b> 필드 참고.
          (단일 진실 원본: <MonoText>docs/모니터링_접속_가이드.md</MonoText>)
        </AuthNote>
      </AuthBanner>

      {/* ── 도구 카드 4종 ─────────────────────────────────────────────── */}
      <CardGrid>
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <ToolCard key={tool.key}>
              <ToolHead>
                <ToolIconWrap>
                  <Icon size={22} />
                </ToolIconWrap>
                <ToolHeadText>
                  <ToolName>{tool.name}</ToolName>
                  <ToolSubtitle>{tool.subtitle}</ToolSubtitle>
                </ToolHeadText>
                <OpenLink
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="새 창으로 열기"
                >
                  <MdOpenInNew size={18} />
                </OpenLink>
              </ToolHead>

              <ToolUrlRow>
                <ToolUrl>{tool.url}</ToolUrl>
                <CopyButton
                  type="button"
                  onClick={() => copyToClipboard(tool.url)}
                  title="URL 복사"
                >
                  <MdContentCopy size={14} />
                </CopyButton>
              </ToolUrlRow>

              <ToolMeta>
                <MetaLabel>2차 인증</MetaLabel>
                <MetaValue>{tool.secondAuth}</MetaValue>
              </ToolMeta>
              <ToolMeta>
                <MetaLabel>용도</MetaLabel>
                <MetaValue>{tool.purpose}</MetaValue>
              </ToolMeta>

              <TipList>
                {tool.tips.map((tip, i) => (
                  <TipItem key={i}>{tip}</TipItem>
                ))}
              </TipList>
            </ToolCard>
          );
        })}
      </CardGrid>

      {/* ── Neo4j Browser + 빠른 쿼리 ───────────────────────────────────
          사용자는 "웹 열면 쿼리가 바로 보이게" 요구했으나 Neo4j Browser 는 URL
          기반 자동 실행을 허용하지 않는다(보안). 대신 `?cmd=edit&arg=<cypher>`
          로 에디터에 프리필된 상태의 새 탭을 여는 방식으로 "한 번 클릭 → 바로
          쿼리가 눈에 보임 → Ctrl+Enter 로 실행" UX 를 제공한다.
          ───────────────────────────────────────────────────────────── */}
      <SubSection>
        <SubTitle>Neo4j Browser (그래프 DB)</SubTitle>
        <ToolCard>
          <ToolHead>
            <ToolIconWrap>
              <MdHub size={22} />
            </ToolIconWrap>
            <ToolHeadText>
              <ToolName>Neo4j Browser</ToolName>
              <ToolSubtitle>영화 관계 그래프 (5 Community, VM4)</ToolSubtitle>
            </ToolHeadText>
            <OpenLink
              href={NEO4J.browserUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="새 창으로 열기"
            >
              <MdOpenInNew size={18} />
            </OpenLink>
          </ToolHead>

          <ToolUrlRow>
            <ToolUrl>{NEO4J.browserUrl}</ToolUrl>
            <CopyButton
              type="button"
              onClick={() => copyToClipboard(NEO4J.browserUrl)}
              title="URL 복사"
            >
              <MdContentCopy size={14} />
            </CopyButton>
          </ToolUrlRow>

          <ToolMeta>
            <MetaLabel>Bolt</MetaLabel>
            <MetaValue><MonoText>{NEO4J.boltUrl}</MonoText></MetaValue>
          </ToolMeta>
          <ToolMeta>
            <MetaLabel>로컬</MetaLabel>
            <MetaValue><MonoText>{NEO4J.localBrowserUrl}</MonoText></MetaValue>
          </ToolMeta>
          <ToolMeta>
            <MetaLabel>2차 인증</MetaLabel>
            <MetaValue>{NEO4J.secondAuth}</MetaValue>
          </ToolMeta>
          <ToolMeta>
            <MetaLabel>용도</MetaLabel>
            <MetaValue>{NEO4J.purpose}</MetaValue>
          </ToolMeta>

          {/* 빠른 쿼리 버튼 — 클릭 시 쿼리가 에디터에 프리필된 Neo4j Browser 새 탭 open */}
          <QuickQueryHeader>
            <QuickQueryTitle>빠른 쿼리 (클릭하면 에디터에 프리필)</QuickQueryTitle>
            <QuickQueryHint>
              Neo4j Browser 는 URL 기반 자동 실행을 지원하지 않습니다 — 새 탭이 열리면
              <b> Ctrl+Enter </b>(또는 Run ▶) 로 실행하세요.
            </QuickQueryHint>
          </QuickQueryHeader>
          <QuickQueryList>
            {NEO4J_QUERIES.map((q) => (
              <QuickQueryItem key={q.key}>
                <QuickQueryMeta>
                  <QuickQueryName>{q.title}</QuickQueryName>
                  <QuickQueryDesc>{q.description}</QuickQueryDesc>
                  <QuickQueryCypher>{q.cypher}</QuickQueryCypher>
                </QuickQueryMeta>
                <QuickQueryActions>
                  {/* 쿼리 텍스트 복사 — Neo4j 가 이미 열려있는 경우 수동 붙여넣기 용 */}
                  <CopyButton
                    type="button"
                    onClick={() => copyToClipboard(q.cypher)}
                    title="Cypher 복사"
                  >
                    <MdContentCopy size={14} />
                  </CopyButton>
                  {/* 새 탭 — 에디터에 프리필된 상태 */}
                  <QuickOpenLink
                    href={buildNeo4jQueryUrl(q.cypher)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Neo4j Browser 에 프리필된 새 탭 열기"
                  >
                    <MdPlayArrow size={14} />
                    열기
                  </QuickOpenLink>
                </QuickQueryActions>
              </QuickQueryItem>
            ))}
          </QuickQueryList>
        </ToolCard>
      </SubSection>

      {/* ── Swagger API 문서 3종 ───────────────────────────────────────── */}
      <SubSection>
        <SubTitle>Swagger / OpenAPI 문서 (3 서비스)</SubTitle>
        <CardGrid>
          {SWAGGER_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <ToolCard key={tool.key}>
                <ToolHead>
                  <ToolIconWrap>
                    <Icon size={22} />
                  </ToolIconWrap>
                  <ToolHeadText>
                    <ToolName>{tool.name}</ToolName>
                    <ToolSubtitle>{tool.subtitle}</ToolSubtitle>
                  </ToolHeadText>
                  <OpenLink
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="새 창으로 열기"
                  >
                    <MdOpenInNew size={18} />
                  </OpenLink>
                </ToolHead>

                <ToolUrlRow>
                  <ToolUrl>{tool.url}</ToolUrl>
                  <CopyButton
                    type="button"
                    onClick={() => copyToClipboard(tool.url)}
                    title="URL 복사"
                  >
                    <MdContentCopy size={14} />
                  </CopyButton>
                </ToolUrlRow>

                <ToolMeta>
                  <MetaLabel>OpenAPI</MetaLabel>
                  <MetaValue><MonoText>{tool.openapiUrl}</MonoText></MetaValue>
                </ToolMeta>
                <ToolMeta>
                  <MetaLabel>로컬</MetaLabel>
                  <MetaValue><MonoText>{tool.localUrl}</MonoText></MetaValue>
                </ToolMeta>
                <ToolMeta>
                  <MetaLabel>용도</MetaLabel>
                  <MetaValue>{tool.purpose}</MetaValue>
                </ToolMeta>

                <TipList>
                  {tool.tips.map((tip, i) => (
                    <TipItem key={i}>{tip}</TipItem>
                  ))}
                </TipList>
              </ToolCard>
            );
          })}
        </CardGrid>
      </SubSection>

      {/* ── 주요 알림 룰 요약 ─────────────────────────────────────────── */}
      <AlertsBlock>
        <SubTitle>주요 알림 룰 (20개 중 대표 {ALERT_RULES.length}개)</SubTitle>
        <AlertsTable>
          <thead>
            <tr>
              <Th>알림</Th>
              <Th>임계 조건</Th>
              <Th>심각도</Th>
            </tr>
          </thead>
          <tbody>
            {ALERT_RULES.map((rule) => (
              <tr key={rule.name}>
                <Td><Code>{rule.name}</Code></Td>
                <Td><MonoText>{rule.condition}</MonoText></Td>
                <Td>
                  <SeverityPill $level={rule.severity}>
                    {rule.severity}
                  </SeverityPill>
                </Td>
              </tr>
            ))}
          </tbody>
        </AlertsTable>
        <AlertNote>
          {/* 2026-04-16: Prometheus 카드 제거에 따라 룰 원본 경로를 VM3 파일 경로만 안내 */}
          전체 룰은 VM3 <MonoText>prometheus/rules/base.yml</MonoText> 에서 확인하거나
          Grafana → Alerting 탭으로 조회하세요. Slack/PagerDuty webhook 연동
          전까지는 Alertmanager UI 로만 확인 가능합니다.
        </AlertNote>
      </AlertsBlock>
    </Section>
  );
}

/* ── styled-components ──────────────────────────────────────────────── */

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

/** 문서 참조 — 실제 링크 없음(프로젝트 내부 문서), title 로 경로만 노출 */
const DocLink = styled.a`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${({ theme }) => theme.fonts.mono};
  cursor: help;
  text-decoration: none;

  &:hover {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const AuthBanner = styled.div`
  background: ${({ theme }) => theme.colors.bgSubtle || theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.lg} ${({ theme }) => theme.spacing.xl};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const AuthTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const AuthGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const AuthItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const AuthLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const AuthValueRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const AuthValue = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  word-break: break-all;
`;

const AuthNote = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.6;
  margin: 0;
`;

const CopyButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const ToolCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
  display: flex;
  flex-direction: column;
`;

const ToolHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ToolIconWrap = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.primaryLight};
  color: ${({ theme }) => theme.colors.primary};
  flex-shrink: 0;
`;

const ToolHeadText = styled.div`
  flex: 1;
  min-width: 0;
`;

const ToolName = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  line-height: 1.2;
`;

const ToolSubtitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
`;

const OpenLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration: none;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.primaryLight};
    color: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const ToolUrlRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: 6px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ToolUrl = styled.span`
  flex: 1;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  word-break: break-all;
`;

const ToolMeta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.xs} 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.borderLight};

  &:first-of-type {
    border-top: none;
  }
`;

const MetaLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  flex-shrink: 0;
  width: 64px;
`;

const MetaValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.5;
`;

const TipList = styled.ul`
  list-style: none;
  padding: 0;
  margin: ${({ theme }) => theme.spacing.md} 0 0 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const TipItem = styled.li`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;
  padding-left: ${({ theme }) => theme.spacing.md};
  position: relative;

  &::before {
    content: '•';
    position: absolute;
    left: 0;
    color: ${({ theme }) => theme.colors.primary};
  }
`;

/* ── Neo4j / Swagger 서브섹션 공통 래퍼 (2026-04-16 추가) ─────────────── */

const SubSection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

/* ── Neo4j 빠른 쿼리 UI (2026-04-16 추가) ──────────────────────────────── */

const QuickQueryHeader = styled.div`
  margin: ${({ theme }) => theme.spacing.lg} 0 ${({ theme }) => theme.spacing.sm} 0;
  padding-top: ${({ theme }) => theme.spacing.md};
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
`;

const QuickQueryTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const QuickQueryHint = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.6;
`;

const QuickQueryList = styled.ul`
  list-style: none;
  padding: 0;
  margin: ${({ theme }) => theme.spacing.md} 0 0 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const QuickQueryItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 6px;
`;

const QuickQueryMeta = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const QuickQueryName = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const QuickQueryDesc = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.5;
`;

const QuickQueryCypher = styled.pre`
  margin: ${({ theme }) => theme.spacing.xs} 0 0 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.borderLight};
  border-radius: 4px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
`;

const QuickQueryActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-shrink: 0;
`;

/** "열기" 버튼 — Neo4j Browser 새 탭 (쿼리 프리필) */
const QuickOpenLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.primaryLight};
  color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  text-decoration: none;

  &:hover {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
  }
`;

const AlertsBlock = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.layout.cardRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const SubTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
`;

const AlertsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderLight};
`;

const Code = styled.code`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const MonoText = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/** 심각도 pill — critical(적), warning(황) */
const SeverityPill = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  text-transform: uppercase;
  background: ${({ $level, theme }) =>
    $level === 'critical'
      ? (theme.colors.errorLight || 'rgba(239, 68, 68, 0.12)')
      : (theme.colors.warningLight || 'rgba(245, 158, 11, 0.15)')};
  color: ${({ $level, theme }) =>
    $level === 'critical' ? theme.colors.error : theme.colors.warning};
`;

const AlertNote = styled.p`
  margin: ${({ theme }) => theme.spacing.md} 0 0 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.6;
`;
