// js/state.js
import { DEFAULT_SLOT_COUNT, MAX_PRIORITY, MIN_PRIORITY, MAX_SLOT_COUNT, MIN_SLOT_COUNT } from './constants.js';

let artifactDB = {};
let slateDB = {};

const appState = {
    inventory: new Array(DEFAULT_SLOT_COUNT).fill(null),
    ownedItems: {}, // ★★★ 구조 변경: { id: { item, count, upgrade, priority } }
    currentItemType: 'artifacts',
    globalEffectModes: {},
    slotCount: DEFAULT_SLOT_COUNT,
};

let onStateChangeCallback = () => {};
export function registerStateChangeCallback(callback) {
    onStateChangeCallback = callback;
}
function setState(newStatePartial, triggerCallback = true) {
    Object.assign(appState, newStatePartial);
    if (triggerCallback) {
        onStateChangeCallback();
    }
}

export async function loadDatabases() {
    try {
        const [artifactResponse, slateResponse] = await Promise.all([
            fetch('artifacts.json'),
            fetch('slates.json')
        ]);
        if (!artifactResponse.ok || !slateResponse.ok) throw new Error('데이터 파일 로드 실패');
        
        const loadedArtifacts = await artifactResponse.json();
        artifactDB = loadedArtifacts.reduce((acc, item) => { acc[item.id] = item; return acc; }, {});
        
        const loadedSlates = await slateResponse.json();
        slateDB = loadedSlates.reduce((acc, item) => { acc[item.id] = item; return acc; }, {});
    } catch (error) {
        console.error("데이터 파일을 불러오는 데 실패했습니다:", error);
        alert("데이터 파일을 불러오는 데 실패했습니다. 파일 경로를 확인해주세요.");
        throw error;
    }
}
export const getArtifactDB = () => artifactDB;
export const getSlateDB = () => slateDB;
export const getDBItem = (itemId) => artifactDB[itemId] || slateDB[itemId];

export const getInventoryState = () => appState.inventory;
export const getOwnedItems = () => appState.ownedItems;
export const getCurrentItemType = () => appState.currentItemType;
export const getGlobalEffectModes = () => appState.globalEffectModes;
export const getSlotCount = () => appState.slotCount;
export const getState = () => ({ ...appState });

export function setCurrentItemType(type) {
    setState({ currentItemType: type });
}

export function setGlobalEffectMode(artifactId, modeName) {
    const newGlobalEffectModes = { ...appState.globalEffectModes };
    newGlobalEffectModes[artifactId] = modeName;
    setState({ globalEffectModes: newGlobalEffectModes });
}

// ★★★ 로직 수정 ★★★
export function updateOwnedItemCount(itemId, change) {
    const newOwnedItems = { ...appState.ownedItems };
    const dbItem = getDBItem(itemId);
    if (!dbItem) return;

    if (newOwnedItems[itemId]) {
        newOwnedItems[itemId].count = Math.max(0, newOwnedItems[itemId].count + change);
        if (newOwnedItems[itemId].count === 0) {
            delete newOwnedItems[itemId]; // 수량이 0이 되면 목록에서 제거
        }
    } else if (change > 0) {
        newOwnedItems[itemId] = {
            item: dbItem,
            count: 1,
            upgrade: 0,
            priority: MIN_PRIORITY,
        };
    }
    setState({ ownedItems: newOwnedItems });
}

export function updateInventorySlotCount(newCount) {
    newCount = Math.max(MIN_SLOT_COUNT, Math.min(MAX_SLOT_COUNT, newCount));
    if (newCount === appState.slotCount) return;

    // 슬롯 변경 시 인벤토리만 초기화 (선택된 아이템은 유지)
    setState({ 
        inventory: new Array(newCount).fill(null), 
        slotCount: newCount 
    });
}

// ★★★ 이 함수는 이제 사용되지 않음 (로직 변경) ★★★
// export function placeItemInSlot(slotId, itemId) { ... }
// export function removeItemFromSlot(slotId) { ... }
// export function rotateItemInSlot(slotId) { ... }

// ★★★ 로직 수정 ★★★
export function updateArtifactSetting(itemId, type, change) {
    const newOwnedItems = { ...appState.ownedItems };
    const itemState = newOwnedItems[itemId];

    if (!itemState || !itemState.item.rarity) return; // 아티팩트가 아니면 조절 불가

    if (type === 'upgrade') {
        itemState.upgrade = Math.max(0, Math.min(itemState.item.maxUpgrade, itemState.upgrade + change));
    } else if (type === 'priority') {
        itemState.priority = Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, itemState.priority + change));
    }
    setState({ ownedItems: newOwnedItems });
}

export function setInventoryState(newBoard) {
    const currentSlotCount = getSlotCount();
    const finalBoard = new Array(currentSlotCount).fill(null);
    newBoard.forEach((item, index) => {
        if (index < currentSlotCount) {
            finalBoard[index] = item;
        }
    });
    setState({ inventory: finalBoard });
}

export function clearState() {
    const currentSlotCount = getSlotCount();
    setState({
        ownedItems: {},
        globalEffectModes: {},
        inventory: new Array(currentSlotCount).fill(null),
    });
    initializeGlobalEffectModes();
}

export function initializeGlobalEffectModes() {
    const initialModes = {};
    Object.values(artifactDB).forEach(artifact => {
        const condition = artifact.condition;
        if (typeof condition === 'object' && condition && condition.modes && condition.modes.length > 0) {
            initialModes[artifact.id] = condition.modes[0].name;
        }
    });
    setState({ globalEffectModes: initialModes }, false);
}