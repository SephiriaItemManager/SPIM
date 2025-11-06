import { loadArtifactDB, loadSlateDB } from './api.js';
import { setDB as setRenderDB } from './render.js';
import { setEventHandlerDB } from './event-handlers.js';
import { updateInventoryStateAndSlots, setArtifactDB, setSlateDB, getInventoryState } from './state.js';
import { updateInventoryGrid, renderItems } from './render.js';
import { setupAllEventListeners } from './event-handlers.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- 데이터 로딩 ---
    let artifactDB = [];
    let slateDB = [];
    
    try {
        artifactDB = await loadArtifactDB();
        slateDB = await loadSlateDB();
        
        // 로드된 DB를 필요한 모듈에 주입
        setArtifactDB(artifactDB); // state.js 에 DB 주입
        setSlateDB(slateDB);       // state.js 에 DB 주입
        setRenderDB(artifactDB, slateDB); // render.js 에 DB 주입
        setEventHandlerDB(artifactDB, slateDB); // event-handlers.js 에 DB 주입

    } catch (error) {
        console.error("데이터 파일을 불러오는 데 실패했습니다:", error);
        alert("데이터 파일을 불러오는 데 실패했습니다. 파일 경로를 확인해주세요.");
        return;
    }

    // --- 초기 상태 설정 및 UI 렌더링 ---
    updateInventoryStateAndSlots(30); // inventoryState 초기화 및 슬롯 개수 설정 (state.js에서 처리)
    updateInventoryGrid(getInventoryState().length); // 초기 인벤토리 UI 렌더링
    renderItems(); // 초기 아이템 목록 렌더링

    // --- 이벤트 리스너 설정 ---
    setupAllEventListeners(); // 모든 이벤트 리스너 연결
});