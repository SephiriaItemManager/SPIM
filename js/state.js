// js/state.js
import { DEFAULT_SLOT_COUNT, MAX_PRIORITY, MIN_PRIORITY, MAX_SLOT_COUNT, MIN_SLOT_COUNT } from './constants.js';

let artifactDB = {};
let slateDB = {};
let nextUniqueId = 0;

const appState = {
    inventory: new Array(DEFAULT_SLOT_COUNT).fill(null),
    ownedItems: {},
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

export function updateOwnedItemCount(itemId, change) {
    const newOwnedItems = { ...appState.ownedItems };
    const dbItem = getDBItem(itemId);
    if (!dbItem) return;

    if (newOwnedItems[itemId]) {
        newOwnedItems[itemId].count = Math.max(0, newOwnedItems[itemId].count + change);
        if (newOwnedItems[itemId].count === 0) {
            delete newOwnedItems[itemId]; 
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

    setState({ 
        inventory: new Array(newCount).fill(null), 
        slotCount: newCount 
    });
}

// ★★★ 수정됨: 아이템 배치 시 현재 보유 아이템의 강화 수치를 적용 ★★★
export function placeItemInSlot(slotId, itemId) {
    const newInventory = [...appState.inventory];
    const newOwnedItems = { ...appState.ownedItems };
    const currentItemInSlot = newInventory[slotId];

    if (currentItemInSlot) {
        // 덮어씌워지는 아이템 복구 로직 (필요하다면 ownedItems 수량 증가)
        if (newOwnedItems[currentItemInSlot.id]) {
             newOwnedItems[currentItemInSlot.id].count++;
        }
    }

    // 보유 수량 확인
    if (!newOwnedItems[itemId] || newOwnedItems[itemId].count <= 0) {
        alert("보유하고 있는 아이템이 없습니다.");
        return;
    }

    const dbItem = getDBItem(itemId);
    // 현재 보유중인 아이템의 설정값(강화, 중요도)을 가져옴
    const currentSettings = newOwnedItems[itemId]; 

    newInventory[slotId] = {
        id: itemId,
        type: dbItem.rarity ? 'artifact' : 'slate',
        uniqueId: nextUniqueId++,
        rotation: 0,
        // ★★★ 0이 아니라 현재 설정값을 사용 ★★★
        upgrade: currentSettings.upgrade, 
        priority: currentSettings.priority,
    };
    newOwnedItems[itemId].count--;
    
    setState({ inventory: newInventory, ownedItems: newOwnedItems });
}

export function removeItemFromSlot(slotId) {
    const newInventory = [...appState.inventory];
    const itemInSlot = newInventory[slotId];
    if (itemInSlot) {
        const newOwnedItems = { ...appState.ownedItems };
        
        // 아이템을 제거할 때 ownedItems에 다시 추가
        if (!newOwnedItems[itemInSlot.id]) {
             // 만약 목록에 없으면 기본값으로 생성 (이론상 발생하지 않아야 함)
             newOwnedItems[itemInSlot.id] = { item: getDBItem(itemInSlot.id), count: 0, upgrade: 0, priority: 1 };
        }
        newOwnedItems[itemInSlot.id].count++;
        
        newInventory[slotId] = null;
        setState({ inventory: newInventory, ownedItems: newOwnedItems });
    }
}

export function swapInventoryItems(slotId1, slotId2) {
    const newInventory = [...appState.inventory];
    [newInventory[slotId1], newInventory[slotId2]] = [newInventory[slotId2], newInventory[slotId1]];
    setState({ inventory: newInventory });
}

export function rotateItemInSlot(slotId) {
    const newInventory = [...appState.inventory];
    const itemState = newInventory[slotId];
    if (!itemState || itemState.type !== 'slate') return;

    const dbItem = getDBItem(itemState.id);
    if (dbItem && dbItem.rotatable) {
        const rotations = [0, 90, 180, 270];
        const currentIndex = rotations.indexOf(itemState.rotation);
        itemState.rotation = rotations[(currentIndex + 1) % 4];
        setState({ inventory: newInventory });
    }
}

// ★★★ 수정됨: 설정 변경 시 인벤토리에 있는 아이템도 함께 업데이트 ★★★
export function updateArtifactSetting(itemId, type, change) {
    const newOwnedItems = { ...appState.ownedItems };
    const itemState = newOwnedItems[itemId];

    if (!itemState || !itemState.item.rarity) return; 

    // 1. 보유 목록(우측 UI)의 설정 업데이트
    if (type === 'upgrade') {
        itemState.upgrade = Math.max(0, Math.min(itemState.item.maxUpgrade, itemState.upgrade + change));
    } else if (type === 'priority') {
        itemState.priority = Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, itemState.priority + change));
    }

    // 2. 인벤토리에 이미 배치된 해당 아이템들도 찾아서 업데이트 (동기화)
    const newInventory = [...appState.inventory];
    let inventoryChanged = false;
    
    newInventory.forEach(slot => {
        if (slot && slot.id === itemId) {
            if (type === 'upgrade') slot.upgrade = itemState.upgrade;
            if (type === 'priority') slot.priority = itemState.priority;
            inventoryChanged = true;
        }
    });

    if (inventoryChanged) {
        setState({ ownedItems: newOwnedItems, inventory: newInventory });
    } else {
        setState({ ownedItems: newOwnedItems });
    }
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