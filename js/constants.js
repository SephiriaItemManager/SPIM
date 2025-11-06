// js/constants.js

/**
 * 게임 로직 및 UI에 사용되는 상수들을 정의합니다.
 */

// 인벤토리 그리드 설정
export const GRID_WIDTH = 6;              // 인벤토리 그리드의 너비 (열의 개수)
export const DEFAULT_SLOT_COUNT = 30;     // 초기 인벤토리 슬롯 개수
export const MAX_SLOT_COUNT = 60;         // 인벤토리 슬롯의 최대 개수
export const MIN_SLOT_COUNT = 6;          // 인벤토리 슬롯의 최소 개수

// 아티팩트 및 중요도 설정
export const MAX_PRIORITY = 10;           // 아티팩트의 최대 중요도
export const MIN_PRIORITY = 1;            // 아티팩트의 최소 중요도

// 아이템 희귀도별 점수 가중치 (백엔드와 동기화 필요)
export const RARITY_WEIGHTS = {
    "Common": 1.0,
    "UnCommon": 1.2,
    "Rare": 1.5,
    "Legendary": 2.5,
    "Solidarity": 2.0 // 결속 아티팩트 가중치
};

// 클라이언트 측 점수 계산 기준 (100점 만점 환산을 위한 임의의 최대 점수)
export const MAX_POSSIBLE_SCORE = 500; 

// 백엔드 API 엔드포인트
export const BACKEND_URL = 'http://127.0.0.1:5000';

// 기타 게임 관련 상수 (필요시 추가)
// 예: 아티팩트 강화 비용, 특정 효과 발동 조건 값 등