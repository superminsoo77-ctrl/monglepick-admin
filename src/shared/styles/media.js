/**
 * 반응형 미디어 쿼리 브레이크포인트.
 *
 * 어드민 UI는 데이터 밀도가 높아 기본적으로 데스크톱 우선이다.
 * 그러나 1024px 이하(태블릿)와 768px 이하(모바일)에서도
 * 핵심 기능(대시보드 조회, 사용자 관리)이 동작해야 한다.
 *
 * 사용 예:
 *   import { media } from '@/shared/styles/media';
 *
 *   const Card = styled.div`
 *     display: grid;
 *     grid-template-columns: repeat(4, 1fr);
 *
 *     ${media.desktop} {
 *       grid-template-columns: repeat(2, 1fr);
 *     }
 *     ${media.tablet} {
 *       grid-template-columns: 1fr;
 *     }
 *   `;
 */

/** 픽셀 단위 브레이크포인트 값 */
export const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

/**
 * max-width 기반 미디어 쿼리 문자열.
 * styled-components 템플릿 리터럴 안에서 직접 사용한다.
 */
export const media = {
  /** 480px 이하: 소형 모바일 */
  mobile: `@media (max-width: ${breakpoints.mobile}px)`,
  /** 768px 이하: 태블릿 / 대형 모바일 */
  tablet: `@media (max-width: ${breakpoints.tablet}px)`,
  /** 1024px 이하: 소형 노트북 / 태블릿 가로 */
  desktop: `@media (max-width: ${breakpoints.desktop}px)`,
  /** 1280px 이하: 일반 노트북 */
  wide: `@media (max-width: ${breakpoints.wide}px)`,
};
