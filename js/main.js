import { loadDatabases, initializeGlobalEffectModes, registerStateChangeCallback, getInventoryState } from './state.js';
import { setupAllEventListeners } from './event-handlers.js';
import { renderAll, renderInventoryGrid } from './render.js';
import { DEFAULT_SLOT_COUNT } from './constants.js';

function handleStateChange() {
    renderAll();
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadDatabases();
        initializeGlobalEffectModes();
        registerStateChangeCallback(handleStateChange);
        setupAllEventListeners();
        
        renderInventoryGrid(); // 초기 슬롯 생성
        renderAll(); // 전체 UI 렌더링

    } catch (error) {
        console.error("애플리케이션 초기화 실패:", error);
    }
});
