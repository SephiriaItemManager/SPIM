// js/event-handlers.js
import { 
    updateOwnedItemCount, getInventoryState, setCurrentItemType, getCurrentItemType,
    updateInventorySlotCount, placeItemInSlot, removeItemFromSlot,
    rotateItemInSlot, updateArtifactSetting, setGlobalEffectMode, 
    clearState, getOwnedItems, getSlotCount, getArtifactDB, getSlateDB
} from './state.js';
import { optimizePlacement } from './api.js';
import { 
    getTypeTabs, getRarityFilter, getNameSearch, 
    getSlotIncreaseBtn, getSlotDecreaseBtn, 
    getItemList, getInventoryGrid, getSelectedArtifactsList, 
    getGlobalEffectsContainer, getClearBtn, getOptimizeBtn
} from './dom-elements.js';

export function setupAllEventListeners() {
    getTypeTabs().addEventListener('click', e => {
        if (e.target.classList.contains('tab-button')) {
            getTypeTabs().querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            setCurrentItemType(e.target.dataset.type);
        }
    });

    getRarityFilter().addEventListener('change', () => onStateChangeCallback());
    getNameSearch().addEventListener('input', () => onStateChangeCallback());

    getSlotIncreaseBtn().addEventListener('click', () => updateInventorySlotCount(getSlotCount() + 1));
    getSlotDecreaseBtn().addEventListener('click', () => updateInventorySlotCount(getSlotCount() - 1));

    getItemList().addEventListener('click', e => {
        const card = e.target.closest('.item-card');
        if (!card) return;
        updateOwnedItemCount(card.dataset.itemId, 1);
    });

    getItemList().addEventListener('contextmenu', e => {
        e.preventDefault();
        const card = e.target.closest('.item-card');
        if (!card) return;
        updateOwnedItemCount(card.dataset.itemId, -1);
    });
    
    getInventoryGrid().addEventListener('click', e => {
        const slot = e.target.closest('.inventory-slot');
        if (!slot) return;
        const slotId = parseInt(slot.dataset.slotId);

        if (getInventoryState()[slotId]) {
            rotateItemInSlot(slotId);
        } else {
            const currentItemType = getCurrentItemType();
            const db = (currentItemType === 'artifacts') ? getArtifactDB() : getSlateDB();
            const ownedItems = getOwnedItems();
            const firstOwnedItemId = Object.keys(db).find(id => (ownedItems[id] || 0) > 0);
            
            if (firstOwnedItemId) {
                placeItemInSlot(slotId, firstOwnedItemId);
            }
        }
    });
    
    getInventoryGrid().addEventListener('contextmenu', e => {
        e.preventDefault();
        const slot = e.target.closest('.inventory-slot');
        if (slot && getInventoryState()[slot.dataset.slotId]) {
            removeItemFromSlot(parseInt(slot.dataset.slotId));
        }
    });
    
    getSelectedArtifactsList().addEventListener('click', e => {
        const target = e.target;
        if (!target.classList.contains('control-btn')) return;
        const card = target.closest('.selected-item-card');
        const inventoryIndex = parseInt(card.dataset.inventoryIndex);
        const change = parseInt(target.dataset.change);

        if (target.classList.contains('enchant-btn')) {
            updateArtifactSetting(inventoryIndex, 'upgrade', change);
        } else if (target.classList.contains('priority-btn')) {
            updateArtifactSetting(inventoryIndex, 'priority', change);
        }
    });

    getGlobalEffectsContainer().addEventListener('change', e => {
        if (e.target.type === 'radio') {
            const artifactId = e.target.closest('.global-effect-modes').dataset.artifactId;
            setGlobalEffectMode(artifactId, e.target.value);
        }
    });
    
    getClearBtn().addEventListener('click', () => {
        clearState();
    });

    getOptimizeBtn().addEventListener('click', async () => {
        const optimizedBoard = await optimizePlacement();
        if (optimizedBoard) {
            setInventoryState(optimizedBoard);
        }
    });
}
