// js/dom-elements.js

/**
 * HTML 문서의 모든 주요 DOM 요소를 가져와 반환하는 함수입니다.
 * 이렇게 DOM 요소를 한 곳에서 관리하면 코드의 가독성과 유지보수성이 향상됩니다.
 */
export const getDomElements = () => ({
    // 아이템 목록 및 필터 관련
    itemList: document.getElementById('item-list'),           // 아이템 카드가 표시되는 목록
    typeTabs: document.getElementById('type-tabs'),           // 아티팩트/석판 탭 컨테이너
    rarityFilter: document.getElementById('rarity-filter'),   // 희귀도 필터 드롭다운
    nameSearch: document.getElementById('name-search'),       // 아이템 이름 검색 입력 필드

    // 인벤토리 그리드 및 슬롯 관련
    inventoryGrid: document.getElementById('inventory-grid'), // 인벤토리 슬롯들이 표시되는 그리드
    slotCountLabel: document.getElementById('slot-count-label'), // 현재 슬롯 개수 표시 라벨
    slotIncreaseBtn: document.getElementById('slot-increase-btn'), // 슬롯 개수 증가 버튼
    slotDecreaseBtn: document.getElementById('slot-decrease-btn'), // 슬롯 개수 감소 버튼

    // 선택된 아이템 및 전역 효과 관련 사이드바
    selectedSlatesList: document.getElementById('selected-slates-list'),     // 선택된 석판 아이콘 목록
    selectedArtifactsList: document.getElementById('selected-artifacts-list'), // 선택된 아티팩트 카드 목록
    globalEffectsContainer: document.getElementById('global-effects-container'), // 전역 효과 설정 패널 컨테이너

    // 액션 버튼
    clearBtn: document.getElementById('clear-btn'),         // 인벤토리 초기화 버튼
    optimizeBtn: document.getElementById('optimize-btn'),   // 최적 배치 요청 버튼

    // 실시간 점수 표시 (index.html에 <span id="realtime-score-value"></span> 추가 필요!)
    realtimeScoreValue: document.getElementById('realtime-score-value') 
});

// 참고: HTML 문서 로드 시점에 이 함수가 호출되어야 모든 요소가 존재합니다.
// main.js 파일에서 DOMContentLoaded 이벤트 발생 시 호출될 것입니다.