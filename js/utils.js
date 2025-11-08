// js/utils.js
import { GRID_WIDTH } from './constants.js';
import { getDBItem, getSlateDB, getState } from './state.js'; // 수정됨

export const isArtifact = (itemId) => itemId && itemId.startsWith('artifact_');
export const isSlate = (itemId) => itemId && itemId.startsWith('slate_');

export function isSlotAvailable(slotIndex, condition, gridState, slotCount) {
    const row = Math.floor(slotIndex / GRID_WIDTH);
    const col = slotIndex % GRID_WIDTH;
    const totalRows = Math.ceil(slotCount / GRID_WIDTH);
    const conditionType = (typeof condition === 'object' && condition !== null) ? condition.type : condition;

    switch (conditionType) {
        case "top_row": return row === 0;
        case "bottom_row": return row === totalRows - 1;
        case "edge": return row === 0 || row === totalRows - 1 || col === 0 || col === GRID_WIDTH - 1;
        case "inner": return row > 0 && row < totalRows - 1 && col > 0 && col < GRID_WIDTH - 1;
        case "adjacent_horizontal_empty":
            const leftEmpty = (col === 0) || !gridState[slotIndex - 1];
            const rightEmpty = (col === GRID_WIDTH - 1) || !gridState[slotIndex + 1];
            return leftEmpty && rightEmpty;
        default: return true;
    }
}

export function calculateAllBuffs() {
    const { inventory: currentInventory, slotCount } = getState(); // 수정됨
    const slateDB = getSlateDB();
    
    const levelMap = new Array(slotCount).fill(0);
    const effectMap = new Array(slotCount).fill(null);
    const boardWidth = GRID_WIDTH;

    currentInventory.forEach((itemState, index) => {
        if (itemState && isSlate(itemState.id)) {
            const slate = slateDB[itemState.id];
            if (!slate) return;
            
            const x = index % boardWidth;
            const y = Math.floor(index / boardWidth);
            
            const buffcoords_data = slate.buffcoords || {};
            const buffcoords = slate.rotatable ? buffcoords_data[String(itemState.rotation)] : buffcoords_data; 
            if (!buffcoords) return;

            buffcoords.forEach(buff => {
                const eff_x = x + buff[0];
                const eff_y = y - buff[1];
                if (eff_x >= 0 && eff_x < boardWidth && eff_y >= 0 && eff_y < Math.ceil(slotCount / boardWidth)) {
                    const targetIndex = eff_y * boardWidth + eff_x;
                    if (targetIndex >= 0 && targetIndex < slotCount) {
                        if (buff[3] !== "none") effectMap[targetIndex] = buff[3];
                        levelMap[targetIndex] += buff[2];
                    }
                }
            });
        }
    });
    return { levelMap, effectMap };
}