import { 
    getOwnedItems, setOwnedItems, 
    getInventoryState, setInventoryState, 
    setCurrentItemType, 
    updateInventoryStateAndSlots, // slot 수 변경 로직
    setGlobalEffectModes, getGlobalEffectModes,
    getNextUniqueId, incrementNextUniqueId
} from './state.js';
import { 
    renderItems, updateInventoryGrid, renderSlot, 
    updateSelectedItems, updateRealtimeScore, 
    getArtifactDBRender, getSlateDBRender 
} from './render.js'; // render 전용 DB getter를 사용
import { 
    getTypeTabs, getRarityFilter, getNameSearch, 
    getSlotIncreaseBtn, getSlotDecreaseBtn, 
    getItemList, getInventoryGrid, getSelectedArtifactsList, 
    getGlobalEffectsContainer, getClearBtn, getOptimizeBtn
} from './dom-elements.js';
import { fetchOptimizedBoard } from './api.js';

let artifactDB = []; // 초기화 시 main.js에서 주입
let slateDB = [];

export function setEventHandlerDB(artifactData, slateData) {
    artifactDB = artifactData;
    slateDB = slateData;
}

// 타입 탭 클릭 이벤트
export function setupTypeTabsListener() {
    getTypeTabs().addEventListener('click', e => {
        if (e.target.classList.contains('tab-button')) {
            getTypeTabs().querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            setCurrentItemType(e.target.dataset.type);
            renderItems();
        }
    });
}

// 희귀도 필터 변경 이벤트
export function setupRarityFilterListener() {
    getRarityFilter().addEventListener('change', renderItems);
}

// 이름 검색 입력 이벤트
export function setupNameSearchListener() {
    getNameSearch().addEventListener('input', renderItems);
}

// 슬롯 증가 버튼 클릭 이벤트
export function setupSlotIncreaseBtnListener() {
    getSlotIncreaseBtn().addEventListener('click', () => {
        const currentSlotCount = getInventoryState().length;
        updateInventoryStateAndSlots(Math.min(60, currentSlotCount + 1));
        updateInventoryGrid(getInventoryState().length); // UI만 업데이트
    });
}

// 슬롯 감소 버튼 클릭 이벤트
export function setupSlotDecreaseBtnListener() {
    getSlotDecreaseBtn().addEventListener('click', () => {
        const currentSlotCount = getInventoryState().length;
        updateInventoryStateAndSlots(Math.max(6, currentSlotCount - 1));
        updateInventoryGrid(getInventoryState().length); // UI만 업데이트
    });
}

// 아이템 목록 클릭 이벤트 (좌클릭: 보유량 증가, 우클릭: 보유량 감소)
export function setupItemListListener() {
    getItemList().addEventListener('click', e => {
        const card = e.target.closest('.item-card');
        if (!card) return;
        const itemId = card.dataset.itemId;
        const ownedItems = getOwnedItems();
        setOwnedItems({ ...ownedItems, [itemId]: (ownedItems[itemId] || 0) + 1 });
        renderItems();
    });

    getItemList().addEventListener('contextmenu', e => {
        e.preventDefault();
        const card = e.target.closest('.item-card');
        if (!card) return;
        const itemId = card.dataset.itemId;
        const ownedItems = getOwnedItems();
        setOwnedItems({ ...ownedItems, [itemId]: Math.max(0, (ownedItems[itemId] || 0) - 1) });
        renderItems();
    });
}

// 인벤토리 클릭 이벤트 (좌클릭: 아이템 배치 또는 석판 회전, 우클릭: 아이템 제거)
export function setupInventoryGridListener() {
    getInventoryGrid().addEventListener('click', e => {
        const slot = e.target.closest('.inventory-slot');
        if (!slot) return;
        const slotId = parseInt(slot.dataset.slotId);
        const inventoryState = getInventoryState();

        // 슬롯에 아이템이 없으면, 보유 아이템 중 현재 선택된 아이템을 배치 시도
        if (!inventoryState[slotId]) {
            // TODO: 드래그 앤 드롭 구현 시, 여기는 드롭 로직으로 대체될 수 있습니다.
            // 현재는 클릭으로 아이템을 추가하는 로직이 없으므로, 이 분기문은 비워둡니다.
            // (원래 script.js에는 인벤토리에 아이템을 배치하는 직접적인 좌클릭 로직이 없었습니다.
            // 주로 드래그 앤 드롭으로 가정하거나, 보유 아이템을 클릭하여 추가하는 방식이 필요합니다.)
            // 예시: (임시로, 가장 첫번째 아이템을 추가하는 로직)
            const ownedItems = getOwnedItems();
            const currentItemType = getOwnedItems(); // 현재 선택된 탭 타입
            const db = (currentItemType === 'artifacts') ? artifactDB : slateDB;
            const firstOwnedItemId = Object.keys(ownedItems).find(id => ownedItems[id] > 0);

            if (firstOwnedItemId) {
                const itemDb = db.find(item => item.id === firstOwnedItemId);
                if (itemDb) {
                    const newItemState = { 
                        id: firstOwnedItemId, 
                        uniqueId: getNextUniqueId(), 
                        upgrade: 0, 
                        priority: 1, 
                        rotation: 0 
                    };
                    incrementNextUniqueId();
                    
                    const newInventoryState = [...inventoryState];
                    newInventoryState[slotId] = newItemState;
                    setInventoryState(newInventoryState);
                    
                    setOwnedItems({ ...ownedItems, [firstOwnedItemId]: ownedItems[firstOwnedItemId] - 1 });

                    renderSlot(slot, newItemState);
                    updateSelectedItems();
                    renderItems(); // 보유 아이템 수량 업데이트를 위해
                }
            }
        } 
        // 슬롯에 아이템이 있으면 회전 시도
        else {
            const itemState = inventoryState[slotId];
            const dbItem = slateDB.find(s => s.id === itemState.id);
            if (dbItem && dbItem.rotatable) {
                const rotations = [0, 90, 180, 270];
                const currentIndex = rotations.indexOf(itemState.rotation);
                itemState.rotation = rotations[(currentIndex + 1) % 4];
                const newInventoryState = [...inventoryState];
                newInventoryState[slotId] = itemState; // 상태 업데이트
                setInventoryState(newInventoryState);

                renderSlot(slot, itemState, getArtifactDBRender(), getSlateDBRender()); // DB를 renderSlot에 전달
                updateSelectedItems();
            }
        }
    });
    
    getInventoryGrid().addEventListener('contextmenu', e => {
        e.preventDefault();
        const slot = e.target.closest('.inventory-slot');
        if (slot && getInventoryState()[slot.dataset.slotId]) {
            const slotId = parseInt(slot.dataset.slotId);
            const itemId = getInventoryState()[slotId].id;
            
            const ownedItems = getOwnedItems();
            setOwnedItems({ ...ownedItems, [itemId]: (ownedItems[itemId] || 0) + 1 });

            const newInventoryState = [...getInventoryState()];
            newInventoryState[slotId] = null;
            setInventoryState(newInventoryState);

            renderSlot(slot, null);
            updateSelectedItems();
            renderItems();
        }
    });
}

// 선택된 아티팩트 목록에서 강화/중요도 조절
export function setupSelectedArtifactsListListener() {
    getSelectedArtifactsList().addEventListener('click', e => {
        const target = e.target;
        if (!target.classList.contains('control-btn')) return;

        const card = target.closest('.selected-item-card');
        const inventoryIndex = parseInt(card.dataset.inventoryIndex);
        const inventoryState = getInventoryState();
        const itemState = inventoryState[inventoryIndex];
        const dbItem = artifactDB.find(a => a.id === itemState.id); // 직접 DB 접근

        if (target.classList.contains('enchant-btn')) {
            const change = parseInt(target.dataset.change);
            itemState.upgrade = Math.max(0, Math.min(dbItem.maxUpgrade, itemState.upgrade + change));
        } else if (target.classList.contains('priority-btn')) {
            const change = parseInt(target.dataset.change);
            itemState.priority = Math.min(10, Math.max(1, itemState.priority + change));
        }
        
        const newInventoryState = [...inventoryState]; // 변경된 itemState 반영
        newInventoryState[inventoryIndex] = itemState;
        setInventoryState(newInventoryState);

        const slot = getInventoryGrid().querySelector(`[data-slot-id='${inventoryIndex}']`);
        renderSlot(slot, itemState); // 변경된 itemState로 슬롯 재렌더링
        updateSelectedItems();
    });
}

// 전역 효과 선택 이벤트
export function setupGlobalEffectsContainerListener() {
    getGlobalEffectsContainer().addEventListener('change', e => {
        if (e.target.type === 'radio') {
            const artifactId = e.target.closest('.global-effect-modes').dataset.artifactId;
            const globalEffectModes = getGlobalEffectModes();
            setGlobalEffectModes({ ...globalEffectModes, [artifactId]: e.target.value });
            updateRealtimeScore();
        }
    });
}

// 초기화 버튼
export function setupClearBtnListener() {
    getClearBtn().addEventListener('click', () => {
        setOwnedItems({});
        setGlobalEffectModes({});
        updateInventoryStateAndSlots(30); // 30슬롯으로 초기화 및 상태 업데이트
        updateInventoryGrid(getInventoryState().length); // UI만 업데이트
    });
}

// 최적 배치 버튼
export function setupOptimizeBtnListener() {
    getOptimizeBtn().addEventListener('click', async () => {
        const itemsForApi = getInventoryState().filter(item => item !== null);
        if (itemsForApi.length === 0) {
            alert("인벤토리에 아이템을 먼저 배치해주세요.");
            return;
        }
        
        try {
            const currentSlotCount = getInventoryState().length;
            const result = await fetchOptimizedBoard(
                itemsForApi, 
                6, // width 고정
                Math.ceil(currentSlotCount / 6), 
                getGlobalEffectModes()
            );

            const flatBoard = result.board.flat();
            
            // 기존 슬롯 수 유지 또는 필요에 따라 변경
            // updateSlots(flatBoard.length); // 이렇게 하면 슬롯 수가 변할 수 있음
            // 최적화는 현재 슬롯 수 내에서 이루어져야 하므로, flatBoard 길이가 현재 슬롯 수와 같다고 가정
            
            setInventoryState(flatBoard); // 상태 업데이트
            updateInventoryGrid(flatBoard.length); // UI 업데이트

        } catch (error) {
            console.error("최적 배치 요청 실패:", error);
            alert("최적 배치에 실패했습니다. Python 백엔드 서버가 실행 중인지 확인해주세요.");
        }
    });
}

// 모든 이벤트 리스너를 한 번에 설정하는 함수
export function setupAllEventListeners() {
    setupTypeTabsListener();
    setupRarityFilterListener();
    setupNameSearchListener();
    setupSlotIncreaseBtnListener();
    setupSlotDecreaseBtnListener();
    setupItemListListener();
    setupInventoryGridListener();
    setupSelectedArtifactsListListener();
    setupGlobalEffectsContainerListener();
    setupClearBtnListener();
    setupOptimizeBtnListener();
}