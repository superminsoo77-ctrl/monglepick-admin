/**
 * AI 어시스턴트가 폼을 채웠음을 알리는 안내 배너 컴포넌트.
 *
 * 모달 상단에 렌더링되며, isAiGenerated=true 인 경우에만 표시된다.
 * 보라~파랑 그라데이션 배경 + 로봇 아이콘으로 AI 연결성을 표현한다.
 *
 * @param {Object}  props
 * @param {string}  [props.text]  - 배너 본문 텍스트. 기본값: "AI 어시스턴트가 채운 내용이에요. 검토 후 저장해주세요."
 */
import styled from 'styled-components';

const DEFAULT_TEXT = 'AI 어시스턴트가 채운 내용이에요. 검토 후 저장해주세요.';

export default function AiPrefillBanner({ text = DEFAULT_TEXT }) {
  return (
    <Banner>
      {/* 로봇 아이콘 — 인라인 SVG 사용 (react-icons 의존 회피) */}
      <IconWrap aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.72V7h1a7 7 0 0 1 7 7v2a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1H4a1 1 0 0 1-1-1v-2a7 7 0 0 1 7-7h1V5.72c-.6-.34-1-.98-1-1.72a2 2 0 0 1 2-2zM9 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </IconWrap>
      <BannerText>{text}</BannerText>
    </Banner>
  );
}

/* ── styled-components ── */

/**
 * 보라(#7c6cf0) → 파랑(#60a5fa) 그라데이션 배너.
 * AdminAssistantPage 의 primary 컬러(#7c6cf0)와 통일해 AI 연결성을 시각화한다.
 */
const Banner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(124, 108, 240, 0.18) 0%, rgba(96, 165, 250, 0.14) 100%);
  border: 1px solid rgba(124, 108, 240, 0.35);
  border-radius: 6px;
  margin-bottom: 16px;
`;

const IconWrap = styled.span`
  flex-shrink: 0;
  margin-top: 1px;
  color: #7c6cf0;
  display: flex;
  align-items: center;
`;

const BannerText = styled.span`
  font-size: 13px;
  line-height: 1.5;
  color: #9b8ff5;
  font-weight: 500;
`;
