// js/state.js
import { DEFAULT_SLOT_COUNT, MAX_PRIORITY, MIN_PRIORITY, MAX_SLOT_COUNT, MIN_SLOT_COUNT } from './constants.js';
import { getDBItem as getDBItemUtil } from './utils.js'; // utils의 getDBItem을 임시로 사용

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
    newOwnedItems[itemId] = Math.max(0, (newOwnedItems[itemId] || 0) + change);
    setState({ ownedItems: newOwnedItems });
}

export function updateInventorySlotCount(newCount) {
    newCount = Math.max(MIN_SLOT_COUNT, Math.min(MAX_SLOT_COUNT, newCount));
    if (newCount === appState.slotCount) return;

    const oldInventory = [...appState.inventory];
    const oldSlotCount = appState.slotCount;
    let newInventory = [];
    let newOwnedItems = { ...appState.ownedItems };

    if (newCount < oldSlotCount) {
        for (let i = newCount; i < oldSlotCount; i++) {
            if (oldInventory[i]) {
                newOwnedItems[oldInventory[i].id] = (newOwnedItems[oldInventory[i].id] || 0) + 1;
            }
        }
        newInventory = oldInventory.slice(0, newCount);
    } else {
        newInventory = [...oldInventory, ...new Array(newCount - oldSlotCount).fill(null)];
    }
    setState({ inventory: newInventory, slotCount: newCount, ownedItems: newOwnedItems });
}

export function placeItemInSlot(slotId, itemId) {
    const newInventory = [...appState.inventory];
    const newOwnedItems = { ...appState.ownedItems };
    const currentItemInSlot = newInventory[slotId];

    if (currentItemInSlot) {
        newOwnedItems[currentItemInSlot.id] = (newOwnedItems[currentItemInSlot.id] || 0) + 1;
    }

    if ((newOwnedItems[itemId] || 0) <= 0) {
        alert("보유하고 있는 아이템이 없습니다.");
        return;
    }

    const dbItem = getDBItem(itemId);
    newInventory[slotId] = {
        id: itemId,
        type: dbItem.rarity ? 'artifact' : 'slate',
        uniqueId: nextUniqueId++,
        rotation: 0,
        upgrade: 0,
        priority: MIN_PRIORITY,
    };
    newOwnedItems[itemId]--;
    
    setState({ inventory: newInventory, ownedItems: newOwnedItems });
}

export function removeItemFromSlot(slotId) {
    const newInventory = [...appState.inventory];
    const itemInSlot = newInventory[slotId];
    if (itemInSlot) {
        const newOwnedItems = { ...appState.ownedItems };
        newOwnedItems[itemInSlot.id] = (newOwnedItems[itemInSlot.id] || 0) + 1;
        newInventory[slotId] = null;
        setState({ inventory: newInventory, ownedItems: newOwnedItems });
    }
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

export function updateArtifactSetting(inventoryIndex, type, change) {
    const newInventory = [...appState.inventory];
    const itemState = newInventory[inventoryIndex];
    if (!itemState || itemState.type !== 'artifact') return;

    const dbItem = getDBItem(itemState.id);
    if (!dbItem) return;

    if (type === 'upgrade') {
        itemState.upgrade = Math.max(0, Math.min(dbItem.maxUpgrade, itemState.upgrade + change));
    } else if (type === 'priority') {
        itemState.priority = Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, itemState.priority + change));
    }
    setState({ inventory: newInventory });
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
