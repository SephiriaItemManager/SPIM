// js/api.js
import { BACKEND_URL, GRID_WIDTH } from './constants.js';
import { getState } from './state.js';

// ★★★ 이 함수의 로직이 완전히 변경되었습니다 ★★★
export async function optimizePlacement() {
    const { ownedItems, slotCount, globalEffectModes } = getState();
    
    // ownedItems 객체를 API가 요구하는 아이템 리스트로 변환
    const itemsForApi = [];
    Object.keys(ownedItems).forEach(itemId => {
        const itemState = ownedItems[itemId];
        const dbItem = itemState.item;
        
        for (let i = 0; i < itemState.count; i++) {
            itemsForApi.push({
                id: dbItem.id,
                type: dbItem.rarity ? 'artifact' : 'slate',
                upgrade: itemState.upgrade,
                priority: itemState.priority,
                rotation: 0 // 회전은 백엔드가 결정
            });
        }
    });

    if (itemsForApi.length === 0) {
        alert("아이템 목록에서 아이템을 먼저 선택해주세요.");
        return null;
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/optimize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: itemsForApi, // ★★★ '선택된' 아이템 목록 전송 ★★★
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