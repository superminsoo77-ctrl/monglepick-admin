/**
 * 상태 뱃지 공통 컴포넌트.
 * 색상별 상태 표시 (success/warning/error/info/default).
 *
 * 다크모드 대응: theme 변수를 직접 참조하여
 * 라이트/다크 양쪽에서 올바른 색상이 적용된다.
 *
 * @param {Object} props
 * @param {'success'|'warning'|'error'|'info'|'default'} props.status - 상태 타입
 * @param {string} props.label - 표시 텍스트
 */

import styled from 'styled-components';

export default function StatusBadge({ status = 'default', label }) {
  return (
    <Badge $status={status}>
      {label}
    </Badge>
  );
}

/**
 * 상태별 배경/텍스트/테두리 색상을 theme 변수에서 가져온다.
 * 하드코딩 색상 대신 theme.colors.*Bg / theme.colors.* 를 사용하여
 * 다크 모드에서도 자동으로 올바른 색상이 적용된다.
 */
const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
  white-space: nowrap;

  ${({ $status, theme }) => {
    switch ($status) {
      case 'success':
        return `
          background: ${theme.colors.successBg};
          color: ${theme.colors.success};
          border: 1px solid ${theme.colors.success}33;
        `;
      case 'warning':
        return `
          background: ${theme.colors.warningBg};
          color: ${theme.colors.warning};
          border: 1px solid ${theme.colors.warning}33;
        `;
      case 'error':
        return `
          background: ${theme.colors.errorBg};
          color: ${theme.colors.error};
          border: 1px solid ${theme.colors.error}33;
        `;
      case 'info':
        return `
          background: ${theme.colors.infoBg};
          color: ${theme.colors.info};
          border: 1px solid ${theme.colors.info}33;
        `;
      default:
        return `
          background: ${theme.colors.bgHover};
          color: ${theme.colors.textSecondary};
          border: 1px solid ${theme.colors.border};
        `;
    }
  }}
`;
