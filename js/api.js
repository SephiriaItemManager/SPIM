// js/api.js

import { BACKEND_URL, GRID_WIDTH } from './constants.js';
import { getState } from './state.js'; // 현재 상태를 가져오기 위해 state 모듈을 임포트

/**
 * 백엔드 서버의 최적 배치 API를 호출하고 결과를 반환합니다.
 * @returns {Promise<Array | null>} 최적화된 보드의 평탄화된 배열 또는 오류 발생 시 null
 */
export async function optimizePlacement() {
    // 현재 애플리케이션 상태에서 필요한 데이터를 가져옵니다.
    const { inventory, slotCount, globalEffectModes } = getState();
    
    // 인벤토리에 배치된 아이템들만 필터링합니다. (null인 슬롯 제외)
    const itemsForApi = inventory.filter(item => item !== null);

    // 인벤토리가 비어있으면 최적화할 필요가 없으므로 사용자에게 알립니다.
    if (itemsForApi.length === 0) {
        alert("인벤토리에 아이템을 먼저 배치해주세요.");
        return null;
    }
    
    try {
        // 백엔드 API에 POST 요청을 보냅니다.
        const response = await fetch(`${BACKEND_URL}/optimize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // 요청 본문에 현재 아이템 상태, 그리드 크기, 전역 효과 모드를 JSON 형태로 전달합니다.
            body: JSON.stringify({
                items: itemsForApi,
                width: GRID_WIDTH, // 그리드 너비 상수 사용
                height: Math.ceil(slotCount / GRID_WIDTH), // 현재 슬롯 수에 따른 그리드 높이 계산
                global_effects: globalEffectModes // 백엔드에 전역 효과 모드 전달
            })
        });

        // 응답 상태 코드가 200번대가 아니면 오류로 처리합니다.
        if (!response.ok) {
            const errorData = await response.json(); // 서버에서 보낸 오류 메시지 파싱
            throw new Error(`서버 오류 (${response.status}): ${errorData.error || response.statusText}`);
        }
        
        // 성공적인 응답을 JSON 형태로 파싱합니다.
        const result = await response.json();
        
        // 백엔드에서 받은 2차원 배열 형태의 보드를 1차원 배열로 평탄화하여 반환합니다.
        return result.board.flat(); 
    } catch (error) {
        // API 요청 중 발생한 모든 오류를 콘솔에 기록하고 사용자에게 알립니다.
        console.error("최적 배치 요청 실패:", error);
        alert(`최적 배치에 실패했습니다. Python 백엔드 서버가 실행 중인지 확인해주세요.\n오류: ${error.message}`);
        return null; // 오류 발생 시 null 반환
    }
}