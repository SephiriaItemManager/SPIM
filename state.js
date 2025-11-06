// js/state.js

import { 
    DEFAULT_SLOT_COUNT, MAX_PRIORITY, MIN_PRIORITY, 
    GRID_WIDTH, MAX_SLOT_COUNT, MIN_SLOT_COUNT, 
    MAX_POSSIBLE_SCORE, RARITY_WEIGHTS 
} from './constants.js';
import { calculateAllBuffs, isSlotAvailable, isArtifact, isSlate } from './utils.js';

// --- 전역 데이터베이스 변수 (초기 로드 후 변경되지 않음) ---
let artifactDB = {}; // ID를 키로 하는 객체로 변경하여 조회 성능 향상
let slateDB = {};    // ID를 키로 하는 객체로 변경하여 조회 성능 향상

// --- 애플리케이션의 핵심 상태 ---
const appState = {
    inventory: [], // InventoryState 배열 (각 슬롯의 아이템 객체 또는 null)
    ownedItems: {}, // { itemId: count } - 사용자가 보유한 아이템의 개수
    currentItemType: 'artifacts', // 'artifacts' 또는 'slates' - 현재 아이템 목록 탭 상태
    globalEffectModes: {}, // { "artifactId": "selectedModeName" } - 전역 효과 아티팩트의 선택된 모드
    slotCount: DEFAULT_SLOT_COUNT, // 현재 인벤토리의 총 슬롯 개수
};

// --- 상태 변경 시 호출될 콜백 함수 (옵저버 패턴) ---
let onStateChangeCallback = () => {};

/**
 * 상태 변경 시 호출될 콜백 함수를 등록합니다.
 * @param {Function} callback - 상태가 변경될 때마다 호출될 함수
 */
export function registerStateChangeCallback(callback) {
    onStateChangeCallback = callback;
}

/**
 * 상태를 변경하고 등록된 콜백 함수를 호출합니다.
 * @param {object} newStatePartial - 변경할 상태의 부분 객체
 * @param {boolean} triggerCallback - 콜백 호출 여부 (기본값: true)
 */
function setState(newStatePartial, triggerCallback = true) {
    Object.assign(appState, newStatePartial);
    if (triggerCallback) {
        onStateChangeCallback();
    }
}

// --- 데이터베이스 로드 함수 ---
/**
 * JSON 파일에서 아티팩트 및 석판 데이터를 비동기적으로 로드하여 데이터베이스를 초기화합니다.
 * @returns {Promise<void>}
 */
export async function loadDatabases() {
    try {
        const artifactResponse = await fetch('artifacts.json');
        const loadedArtifacts = await artifactResponse.json();
        artifactDB = loadedArtifacts.reduce((acc, item) => {
            acc[item.id] = item;
            return acc;
        }, {}); // 배열을 ID 기반 객체로 변환하여 O(1) 조회 가능하게 함

        const slateResponse = await fetch('slates.json');
        const loadedSlates = await slateResponse.json();
        slateDB = loadedSlates.reduce((acc, item) => {
            acc[item.id] = item;
            return acc;
        }, {}); // 배열을 ID 기반 객체로 변환하여 O(1) 조회 가능하게 함

        console.log("데이터베이스 로드 성공.");
    } catch (error) {
        console.error("데이터 파일을 불러오는 데 실패했습니다:", error);
        alert("데이터 파일을 불러오는 데 실패했습니다. 파일 경로를 확인해주세요.");
        throw error; // 에러를 다시 던져서 호출자가 처리할 수 있게 함
    }
}

// --- 상태 조회 (Getter) 함수 ---
/**
 * 현재 애플리케이션 상태의 스냅샷을 반환합니다. (불변성 유지를 위해 복사본 반환)
 * @returns {object} 현재 상태 객체
 */
export const getState = () => ({ ...appState });

/**
 * 아티팩트 데이터베이스를 반환합니다.
 * @returns {object} 아티팩트 DB
 */
export const getArtifactDB = () => artifactDB;

/**
 * 석판 데이터베이스를 반환합니다.
 * @returns {object} 석판 DB
 */
export const getSlateDB = () => slateDB;

/**
 * 주어진 ID에 해당하는 아이템 데이터를 데이터베이스에서 찾아 반환합니다.
 * @param {string} itemId - 아이템 ID
 * @returns {object | undefined} 해당 아이템 데이터 또는 찾을 수 없으면 undefined
 */
export function getDBItem(itemId) {
    return artifactDB[itemId] || slateDB[itemId];
}


// --- 상태 변경 (Mutator) 함수 ---
/**
 * 특정 아이템의 보유량을 변경합니다.
 * @param {string} itemId - 변경할 아이템의 ID
 * @param {number} change - 변경량 (+1 또는 -1)
 */
export function updateOwnedItemCount(itemId, change) {
    const newOwnedItems = { ...appState.ownedItems }; // 불변성 유지를 위해 복사
    newOwnedItems[itemId] = Math.max(0, (newOwnedItems[itemId] || 0) + change);
    setState({ ownedItems: newOwnedItems });
}

/**
 * 인벤토리의 슬롯 개수를 변경합니다.
 * 슬롯이 감소하면 제거되는 아이템들은 보유량으로 다시 추가됩니다.
 * @param {number} newCount - 새로 설정할 슬롯 개수
 */
export function updateInventorySlotCount(newCount) {
    newCount = Math.max(MIN_SLOT_COUNT, Math.min(MAX_SLOT_COUNT, newCount));
    if (newCount === appState.slotCount) return; // 변경 사항이 없으면 아무것도 하지 않음

    const oldInventory = [...appState.inventory];
    const oldSlotCount = appState.slotCount;
    let newInventory = [];
    
    // 슬롯 감소 시: 제거되는 아이템들을 ownedItems로 돌려놓고, 새 인벤토리를 이전 상태의 일부로 만듭니다.
    if (newCount < oldSlotCount) {
        for (let i = newCount; i < oldSlotCount; i++) {
            if (oldInventory[i]) {
                updateOwnedItemCount(oldInventory[i].id, 1);
            }
        }
        newInventory = oldInventory.slice(0, newCount); // 이전 인벤토리의 앞부분만 잘라옴
    } 
    // 슬롯 증가 시: 이전 인벤토리 유지하고, 추가된 슬롯을 null로 채웁니다.
    else { 
        newInventory = [...oldInventory];
        while (newInventory.length < newCount) {
            newInventory.push(null);
        }
    }
    setState({ inventory: newInventory, slotCount: newCount });
}

/**
 * 인벤토리 슬롯에 아이템을 배치하거나 제거합니다.
 * @param {number} slotId - 아이템을 배치/제거할 슬롯의 인덱스
 * @param {object | null} item - 배치할 아이템 객체 (제거 시 null)
 */
export function placeItemInSlot(slotId, item) {
    const newInventory = [...appState.inventory];
    const currentItemInSlot = newInventory[slotId];

    // 기존 슬롯에 아이템이 있다면 보유량으로 돌려놓기
    if (currentItemInSlot) {
        updateOwnedItemCount(currentItemInSlot.id, 1);
    }

    if (item === null) { // 아이템 제거 요청
        newInventory[slotId] = null;
    } else { // 아이템 배치 요청
        // 보유 아이템에서 제거 가능한지 확인
        if ((appState.ownedItems[item.id] || 0) <= 0) {
            alert("보유하고 있는 아이템이 없습니다.");
            return;
        }
        // 새 아이템을 슬롯에 배치
        newInventory[slotId] = {
            id: item.id,
            rotation: item.rotation || 0,
            upgrade: item.upgrade || 0,
            priority: item.priority || MIN_PRIORITY,
        };
        updateOwnedItemCount(item.id, -1); // 배치했으니 보유량 감소
    }
    setState({ inventory: newInventory });
}

/**
 * 인벤토리 슬롯에 있는 석판을 회전시킵니다.
 * @param {number} slotId - 회전할 석판이 있는 슬롯의 인덱스
 * @returns {boolean} 회전에 성공하면 true, 아니면 false
 */
export function rotateItemInSlot(slotId) {
    const newInventory = [...appState.inventory];
    const itemState = newInventory[slotId];

    if (!itemState || !isSlate(itemState)) return false; // 아이템이 없거나 석판이 아니면 회전 불가

    const dbItem = getDBItem(itemState.id);
    if (dbItem && dbItem.rotatable) {
        const rotations = [0, 90, 180, 270];
        const currentIndex = rotations.indexOf(itemState.rotation);
        itemState.rotation = rotations[(currentIndex + 1) % 4]; // 다음 회전 값으로 업데이트
        
        setState({ inventory: newInventory }); // 변경된 인벤토리 상태로 업데이트
        return true;
    }
    return false;
}

/**
 * 인벤토리 슬롯에 있는 아티팩트의 강화 레벨 또는 중요도를 조절합니다.
 * @param {number} inventoryIndex - 조절할 아티팩트가 있는 슬롯의 인덱스
 * @param {'upgrade' | 'priority'} type - 조절할 속성 ('upgrade' 또는 'priority')
 * @param {number} change - 변경량 (+1 또는 -1)
 */
export function updateArtifactSetting(inventoryIndex, type, change) {
    const newInventory = [...appState.inventory];
    const itemState = newInventory[inventoryIndex];

    if (!itemState || !isArtifact(itemState)) return; // 아티팩트가 아니면 조절 불가

    const dbItem = getDBItem(itemState.id);
    if (!dbItem) return;

    if (type === 'upgrade') {
        itemState.upgrade = Math.max(0, Math.min(dbItem.maxUpgrade, itemState.upgrade + change));
    } else if (type === 'priority') {
        itemState.priority = Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, itemState.priority + change));
    }
    setState({ inventory: newInventory }); // 변경된 인벤토리 상태로 업데이트
}

/**
 * 전역 효과 아티팩트의 선택된 모드를 설정합니다.
 * @param {string} artifactId - 전역 효과 아티팩트의 ID
 * @param {string} modeName - 선택된 모드의 이름
 */
export function setGlobalEffectMode(artifactId, modeName) {
    const newGlobalEffectModes = { ...appState.globalEffectModes };
    newGlobalEffectModes[artifactId] = modeName;
    setState({ globalEffectModes: newGlobalEffectModes });
}

/**
 * 애플리케이션의 모든 상태를 초기값으로 리셋합니다.
 */
export function clearState() {
    setState({
        ownedItems: {},
        globalEffectModes: {},
        slotCount: DEFAULT_SLOT_COUNT,
        inventory: new Array(DEFAULT_SLOT_COUNT).fill(null), // 모든 슬롯을 비움
    });
}

/**
 * 현재 인벤토리 상태를 기반으로 클라이언트 측 실시간 점수를 계산합니다.
 * 이 점수는 백엔드의 최종 점수와 다를 수 있으며, UI 피드백 용도로 사용됩니다.
 * @returns {number} 100점 만점으로 환산된 현재 점수 (0-100)
 */
export function calculateRealtimeScore() {
    let currentScore = 0;
    const buffs = calculateAllBuffs(appState.inventory, appState.slotCount, slateDB);

    appState.inventory.forEach((itemState, index) => {
        if (itemState && isArtifact(itemState)) {
            const dbItem = artifactDB[itemState.id];
            if (!dbItem) return;

            let artifactLevel = buffs.levelMap[index] + (itemState.upgrade * 1);
            let isViolated = false;

            // 아티팩트 조건 검사 (클라이언트 측 간소화)
            if (typeof dbItem.condition === 'object' && dbItem.condition.type) {
                // 'limitUnlock' 효과로 잠금 해제되지 않았고, 조건이 'unlockable'인 경우에만 검사
                if (buffs.effectMap[index] !== "limitUnlock" || !dbItem.condition.unlockable) {
                    isViolated = !isSlotAvailable(index, dbItem.condition, appState.inventory, appState.slotCount, GRID_WIDTH);
                }
            }
            
            if (!isViolated) {
                const weight = RARITY_WEIGHTS[dbItem.rarity] || 1.0;
                currentScore += (artifactLevel * weight * itemState.priority);
            }
        }
    });
    
    return Math.min(100, (currentScore / MAX_POSSIBLE_SCORE) * 100);
}

// 초기 인벤토리 상태 설정
appState.inventory = new Array(DEFAULT_SLOT_COUNT).fill(null);

// 전역 효과 모드 초기화 (처음 로드될 때 각 아티팩트의 첫 번째 모드를 기본으로 설정)
// 이 부분은 loadDatabases 후에 한 번만 실행되도록 main.js에서 호출하는 것이 좋습니다.
export function initializeGlobalEffectModes() {
    const initialModes = {};
    Object.values(artifactDB).forEach(artifact => {
        const condition = artifact.condition;
        if (typeof condition === 'object' && condition && condition.modes && condition.modes.length > 0) {
            initialModes[artifact.id] = condition.modes[0].name;
        }
    });
    setState({ globalEffectModes: initialModes }, false); // 콜백은 호출하지 않음
}