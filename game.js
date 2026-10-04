/**
 * Civilization Strategy Game - Core Engine Matrix
 * Handles map arrays, AI turn drivers, economy balancing, and tactical combat checks.
 */

const MAP_SIZE = 12;
const terrainTypes = ['land', 'land', 'land', 'land', 'mountain', 'water'];

let turn = 1;
let map = [];
let selectedUnit = null; // { r, c, civName, type, index }
let civs = {};

const techTree = [
    { id: 'Agriculture', cost: 15, label: '🌾 Agriculture (+Food)' },
    { id: 'Iron Working', cost: 35, label: '⚔️ Iron Working (Swordsman)' },
    { id: 'Industrialization', cost: 70, label: '⚙️ Industrialization (+Prod)' },
    { id: 'Gunpowder', cost: 120, label: '💥 Gunpowder (Musketeer)' }
];

/**
 * Initializes or hard-resets the primary simulation timeline state arrays.
 */
function resetSimulation() {
    turn = 1;
    selectedUnit = null;
    
    // Reset DOM state markers if they exist
    const turnCounter = document.getElementById('turn-counter');
    const logBox = document.getElementById('log');
    const settleBtn = document.getElementById('btn-settle');
    const turnBtn = document.getElementById('btn-turn');

    if (turnCounter) turnCounter.innerText = `Turn: ${turn}`;
    if (logBox) logBox.innerHTML = '';
    if (settleBtn) settleBtn.style.display = 'none';
    if (turnBtn) turnBtn.disabled = false;

    civs = {
        'Rome': { color: '#e53935', emoji: '🏛️', food: 20, prod: 20, science: 0, techs: [], researching: 'Agriculture', cities: [], units: [], live: true, isHuman: true },
        'Egypt': { color: '#ffb300', emoji: '📐', food: 20, prod: 20, science: 0, techs: [], researching: 'Agriculture', cities: [], units: [], live: true, isHuman: false },
        'Japan': { color: '#1e88e5', emoji: '🏯', food: 20, prod: 20, science: 0, techs: [], researching: 'Agriculture', cities: [], units: [], live: true, isHuman: false }
    };

    initMap();
    renderSidebar();
}

/**
 * Generates the procedural board grid arrays and pins global faction capitals.
 */
function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    
    mapEl.innerHTML = '';
    map = [];

    for (let r = 0; r < MAP_SIZE; r++) {
        map[r] = [];
        for (let c = 0; c < MAP_SIZE; c++) {
            let terrain = terrainTypes[Math.floor(Math.random() * terrainTypes.length)];
            // Pad perimeter layout safety with water bodies
            if (r === 0 || r === MAP_SIZE - 1 || c === 0 || c === MAP_SIZE - 1) {
                if (Math.random() > 0.3) terrain = 'water';
            }

            map[r][c] = { r, c, type: terrain, city: null, unit: null };

            const tileEl = document.createElement('div');
            tileEl.id = `tile-${r}-${c}`;
            tileEl.className = `tile ${terrain}`;
            tileEl.addEventListener('click', () => handleTileClick(r, c));
            mapEl.appendChild(tileEl);
        }
    }

    spawnCapital('Rome', 2, 2);
    spawnCapital('Egypt', 9, 3);
    spawnCapital('Japan', 6, 9);
    updateVisuals();
}

function spawnCapital(civName, r, c) {
    map[r][c].type = 'land'; 
    map[r][c].city = { civName, id: civs[civName].cities.length + 1, isCapital: true };
    civs[civName].cities.push({ r, c, pop: 1 });
    logEvent(`${civs[civName].emoji} ${civName} founded their glorious Capital!`);
}

function logEvent(msg) {
    const logBox = document.getElementById('log');
    if (!logBox) return;
    logBox.innerHTML += `[Turn ${turn}] ${msg}<br>`;
    logBox.scrollTop = logBox.scrollHeight;
}

/**
 * Resolves map mechanics on tile selection inputs (Moves, Combat Actions, and Targeting).
 */
function handleTileClick(r, c) {
    const tile = map[r][c];
    
    // Select player human entity validation
    if (tile.unit && civs[tile.unit.civName].isHuman) {
        if (selectedUnit) {
            const oldTile = document.getElementById(`tile-${selectedUnit.r}-${selectedUnit.c}`);
            if (oldTile) oldTile.classList.remove('selected');
        }
        let idx = civs['Rome'].units.findIndex(u => u.r === r && u.c === c);
        selectedUnit = { r, c, civName: tile.unit.civName, type: tile.unit.type, index: idx };
        
        const newTile = document.getElementById(`tile-${r}-${c}`);
        if (newTile) newTile.classList.add('selected');
        
        const settleBtn = document.getElementById('btn-settle');
        if (settleBtn) settleBtn.style.display = (selectedUnit.type === 'Set') ? 'inline-block' : 'none';
        return;
    }

    // Process selection targeting offsets
    if (selectedUnit) {
        let rowDiff = Math.abs(selectedUnit.r - r);
        let colDiff = Math.abs(selectedUnit.c - c);
        
        if (rowDiff <= 1 && colDiff <= 1 && !(rowDiff === 0 && colDiff === 0)) {
            if (tile.type === 'water' || tile.type === 'mountain') return; 

            let currentTile = map[selectedUnit.r][selectedUnit.c];

            if (tile.unit && tile.unit.civName !== selectedUnit.civName) {
                // Engage Tactical Battle
                let targetCiv = tile.unit.civName;
                logEvent(`⚔️ Your ${selectedUnit.type} attacks ${civs[targetCiv].emoji} ${targetCiv}'s ${tile.unit.type}!`);
                
                let attackPower = selectedUnit.type === 'M' ? 3 : (selectedUnit.type === 'S' ? 2 : 1);
                let defendPower = tile.unit.type === 'M' ? 3 : (tile.unit.type === 'S' ? 2 : 1);

                if (attackPower + Math.random() > defendPower + Math.random()) {
                    removeUnitAt(tile.r, tile.c, targetCiv);
                    tile.unit = { civName: selectedUnit.civName, type: selectedUnit.type };
                    currentTile.unit = null;
                    civs['Rome'].units[selectedUnit.index].r = tile.r;
                    civs['Rome'].units[selectedUnit.index].c = tile.c;
                    logEvent(`🎉 Combat Won! Target neutralized.`);
                } else {
                    currentTile.unit = null;
                    civs['Rome'].units.splice(selectedUnit.index, 1);
                    logEvent(`💥 Your unit was defeated in battle.`);
                }
                clearSelection();
            } else if (tile.city && tile.city.civName !== selectedUnit.civName) {
                // City Takeover Processing
                let targetCiv = tile.city.civName;
                logEvent(`💥 Rome has captured an enemy settlement belonging to ${civs[targetCiv].emoji} ${targetCiv}!`);
                
                let cIdx = civs[targetCiv].cities.findIndex(c => c.r === tile.r && c.c === tile.c);
                if (cIdx > -1) civs[targetCiv].cities.splice(cIdx, 1);

                tile.city.civName = selectedUnit.civName;
                civs['Rome'].cities.push({ r: tile.r, c: tile.c, pop: 1 });

                if (civs[targetCiv].cities.length === 0) {
                    civs[targetCiv].live = false;
                    logEvent(`💀💀 <b>${targetCiv} has collapsed!</b> 💀💀`);
                }
                clearSelection();
            } else if (!tile.unit && !tile.city) {
                // Relocate Unit Position safely
                tile.unit = { civName: selectedUnit.civName, type: selectedUnit.type };
                currentTile.unit = null;
                civs['Rome'].units[selectedUnit.index].r = tile.r;
                civs['Rome'].units[selectedUnit.index].c = tile.c;
                clearSelection();
            }
            updateVisuals();
            renderSidebar();
        }
    }
}

function clearSelection() {
    if (selectedUnit) {
        const selectedTile = document.getElementById(`tile-${selectedUnit.r}-${selectedUnit.c}`);
        if (selectedTile) selectedTile.classList.remove('selected');
    }
    selectedUnit = null;
    const settleBtn = document.getElementById('btn-settle');
    if (settleBtn) settleBtn.style.display = 'none';
}

function changeResearch(civName, techId) {
    if (!civs[civName].isHuman || civs[civName].techs.includes(techId)) return;
    civs[civName].researching = techId;
    renderSidebar();
}

/**
 * Sweeps global calculations, updates scientific progression tracking, and fires AI algorithms.
 */
function endTurn() {
    clearSelection();

    // 1. Process yields and technical investments
    for (let name in civs) {
        let civ = civs[name];
        if (!civ.live) continue;

        let turnFood = civ.cities.length * 3;
        let turnProd = civ.cities.length * 3;
        let turnSci = civ.cities.length * 2;

        if (civ.techs.includes('Agriculture')) turnFood += civ.cities.length * 2;
        if (civ.techs.includes('Industrialization')) turnProd += civ.cities.length * 3;

        civ.food += turnFood;
        civ.prod += turnProd;
        civ.science += turnSci;

        if (civ.researching) {
            let activeTech = techTree.find(t => t.id === civ.researching);
            if (civ.science >= activeTech.cost) {
                civ.science -= activeTech.cost;
                civ.techs.push(activeTech.id);
                logEvent(`${civ.emoji} ${name} unlocked <b>${activeTech.id}</b>!`);
                
                let nextTech = techTree.find(t => !civ.techs.includes(t.id));
                civ.researching = nextTech ? nextTech.id : null;
            }
        }

        // Automatic City Queue Build Allocations
        if (civ.prod >= 40) {
            let rand = Math.random();
            let unitType = 'W'; 
            
            if (civ.techs.includes('Gunpowder')) unitType = 'M'; 
            else if (civ.techs.includes('Iron Working')) unitType = 'S'; 

            if (civ.cities.length < 4 && rand > 0.4) {
                unitType = 'Set'; 
            }

            for (let city of civ.cities) {
                let neighbors = getAdjacentTiles(city.r, city.c);
                let spawnTile = neighbors.find(t => t.type === 'land' && !t.unit && !t.city);
                if (spawnTile) {
