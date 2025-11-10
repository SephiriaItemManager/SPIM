// js/main.js
import { loadDatabases, initializeGlobalEffectModes, registerStateChangeCallback } from './state.js';
import { setupAllEventListeners } from './event-handlers.js';
import { renderAll, renderInventoryGrid } from './render.js';
import { DEFAULT_SLOT_COUNT } from './constants.js';

// 애플리케이션의 모든 상태가 변경될 때마다 호출될 단일 함수
function handleStateChange() {
    renderAll();
}

// 애플리케이션 시작
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. 데이터베이스 로드
        await loadDatabases();
        
        // 2. 전역 효과 기본값 설정
        initializeGlobalEffectModes();
        
        // 3. 상태 변경 시 UI를 다시 그리도록 콜백 등록
        registerStateChangeCallback(handleStateChange);
        
        // 4. 모든 이벤트 리스너 설정
        setupAllEventListeners();
        
        // 5. 초기 UI 렌더링
        renderInventoryGrid(); // state.js의 inventoryState를 기반으로 초기 슬롯 생성
        renderAll(); // 아이템 목록, 인벤토리, 사이드바 등 모든 것을 그림

    } catch (error) {
        console.error("애플리케이션 초기화 실패:", error);
    }
});