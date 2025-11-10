// js/api.js
import { BACKEND_URL, GRID_WIDTH } from './constants.js';
import { getState } from './state.js';

export async function optimizePlacement() {
    const { inventory, slotCount, globalEffectModes } = getState();
    
    const itemsForApi = inventory.filter(item => item !== null);
    if (itemsForApi.length === 0) {
        alert("인벤토리에 아이템을 먼저 배치해주세요.");
        return null;
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/optimize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: itemsForApi,
                width: GRID_WIDTH,
                height: Math.ceil(slotCount / GRID_WIDTH),
                global_effects: globalEffectModes
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`서버 오류 (${response.status}): ${errorData.error || response.statusText}`);
        }
        
        const result = await response.json();
        
        // 백엔드에서 받은 2D 배열을 1D 배열로 변환하여 반환
        return {
            board: result.board.flat(),
            score: result.score
        };
        
    } catch (error) {
        console.error("최적 배치 요청 실패:", error);
        alert(`최적 배치에 실패했습니다. Python 백엔드 서버가 실행 중인지 확인해주세요.\n오류: ${error.message}`);
        return null;
    }
}