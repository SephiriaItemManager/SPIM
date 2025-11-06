// js/utils.js

import { GRID_WIDTH } from './constants.js'; // 그리드 너비 상수를 임포트

/**
 * 주어진 아이템이 아티팩트인지 확인합니다.
 * @param {object} item - 아이템 객체
 * @returns {boolean} 아티팩트이면 true, 아니면 false
 */
export const isArtifact = (item) => item && item.id.startsWith('artifact_');

/**
 * 주어진 아이템이 석판인지 확인합니다.
 * @param {object} item - 아이템 객체
 * @returns {boolean} 석판이면 true, 아니면 false
 */
export const isSlate = (item) => item && item.id.startsWith('slate_');

/**
 * 특정 슬롯이 아티팩트의 조건에 부합하는지 확인합니다. (클라이언트 측 간소화 버전)
 * 백엔드의 isSlotAvailable 로직과 동기화되어야 하지만, UI는 일부 조건만 검사합니다.
 * @param {number} slotIndex - 검사할 슬롯의 인덱스
 * @param {object | string} condition - 아티팩트의 조건 객체 또는 조건 타입 문자열
 * @param {Array<object | null>} gridState - 현재 인벤토리의 아이템 상태 배열
 * @param {number} slotCount - 전체 슬롯 개수
 * @param {number} gridWidth - 그리드의 너비 (열 개수)
 * @returns {boolean} 슬롯 조건이 충족되면 true, 아니면 false
 */
export function isSlotAvailable(slotIndex, condition, gridState, slotCount, gridWidth) {
    const row = Math.floor(slotIndex / gridWidth);
    const col = slotIndex % gridWidth;
    const totalRows = Math.ceil(slotCount / gridWidth); // 현재 슬롯 수에 따른 총 행 개수

    // condition이 직접 문자열일 경우를 대비 (데이터의 일관성을 위해 객체 형태를 추천)
    const conditionType = (typeof condition === 'object' && condition !== null) ? condition.type : condition;

    switch (conditionType) {
        case "top_row":
            return row === 0; // 최상단 행
        case "bottom_row":
            return row === totalRows - 1; // 최하단 행
        case "edge":
            return row === 0 || row === totalRows - 1 || col === 0 || col === gridWidth - 1; // 가장자리 (상,하,좌,우)
        case "inner":
            return row > 0 && row < totalRows - 1 && col > 0 && col < gridWidth - 1; // 안쪽 슬롯
        case "adjacent_horizontal_empty": // 좌우 인접 슬롯이 모두 비어있는 경우
            const leftEmpty = (col === 0) || !gridState[slotIndex - 1];
            const rightEmpty = (col === gridWidth - 1) || !gridState[slotIndex + 1];
            return leftEmpty && rightEmpty;
        // 'requires_...'와 같이 복잡하거나 백엔드에서만 판단해야 하는 조건들은
        // UI 레벨에서는 검사하기 복잡하므로 일단 true를 반환합니다.
        // 이 부분은 백엔드 로직과 정확히 일치하지 않을 수 있습니다.
        default:
            return true;
    }
}

/**
 * 현재 인벤토리 상태를 기반으로 모든 슬롯에 적용되는 석판 버프 레벨과 효과를 계산합니다.
 * @param {Array<object | null>} currentInventory - 현재 인벤토리에 배치된 아이템 상태 배열
 * @param {number} slotCount - 현재 인벤토리의 총 슬롯 개수
 * @param {object} slateDB - 석판 데이터베이스 객체
 * @returns {{levelMap: Array<number>, effectMap: Array<string | null>}} 각 슬롯의 버프 레벨 및 효과 맵
 */
export function calculateAllBuffs(currentInventory, slotCount, slateDB) {
    // 모든 슬롯의 버프 레벨을 0으로 초기화
    const levelMap = new Array(slotCount).fill(0);
    // 모든 슬롯의 효과 타입을 null로 초기화
    const effectMap = new Array(slotCount).fill(null);
    const boardWidth = GRID_WIDTH; // 그리드 너비 상수 사용

    currentInventory.forEach((itemState, index) => {
        // 아이템이 존재하고, 석판인 경우에만 처리합니다.
        if (itemState && isSlate(itemState)) {
            const slate = slateDB[itemState.id]; // ID로 직접 접근하는 것이 find보다 빠름
            if (!slate) return; // 데이터베이스에 없는 석판이면 건너뜁니다.
            
            // 현재 석판이 위치한 그리드 좌표를 계산합니다.
            const x = index % boardWidth;
            const y = Math.floor(index / boardWidth);
            
            // 석판의 버프 좌표 데이터를 가져옵니다. 회전 여부에 따라 다른 데이터를 사용합니다.
            const buffcoords_data = slate.buffcoords || {};
            // rotation은 객체의 키로 사용될 수 있으므로 문자열로 변환합니다.
            const buffcoords = slate.rotatable ? buffcoords_data[String(itemState.rotation)] : buffcoords_data; 
            
            if (!buffcoords) return; // 버프 좌표 데이터가 없으면 건너뜁니다.

            // 각 버프 좌표에 대해 실제 적용될 슬롯을 계산하고 맵을 업데이트합니다.
            buffcoords.forEach(buff => {
                const eff_x = x + buff[0]; // 버프가 적용될 x 좌표
                const eff_y = y - buff[1]; // 버프가 적용될 y 좌표 (y축은 보통 위로 갈수록 값이 줄어드는 게임 좌표계를 따름)
                
                // 버프 적용 좌표가 유효한 인벤토리 범위 내에 있는지 확인합니다.
                if (eff_x >= 0 && eff_x < boardWidth && eff_y >= 0 && eff_y < Math.ceil(slotCount / boardWidth)) {
                    const targetIndex = eff_y * boardWidth + eff_x; // 1차원 배열에서의 타겟 슬롯 인덱스
                    
                    // 타겟 인덱스가 유효한 범위 내에 있는지 다시 확인합니다.
                    if (targetIndex >= 0 && targetIndex < slotCount) {
                        // 버프 타입이 "none"이 아니면 effectMap에 기록합니다.
                        if (buff[3] !== "none") effectMap[targetIndex] = buff[3];
                        // 버프 레벨을 levelMap에 추가합니다.
                        levelMap[targetIndex] += buff[2];
                    }
                }
            });
        }
    });
    return { levelMap, effectMap }; // 계산된 버프 맵을 반환합니다.
}