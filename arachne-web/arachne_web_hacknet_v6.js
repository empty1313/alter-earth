// arachne_web_hacknet_v6.js - Command System Rework & Universal ID Patch

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- 전역 데이터베이스 및 상태 ---
let database = {};
let state = {
    centerView: { mode: 'galaxy', type: null, filter: '' },
    analysisTarget: { type: null, id: null },
    activeGateId: null,
};

// --- 상수 및 설정 ---
const TYPING_SPEED = 5;

// --- 3D 맵 전역 변수 ---
let scene, camera, renderer, controls, raycaster, pointer, roomObjects3D = [];
let activeRoom3D = null;
const materialDefault = new THREE.MeshStandardMaterial({ color: 0x00B0FF, transparent: true, opacity: 0.6 });
const materialSelected = new THREE.MeshStandardMaterial({ color: 0xEC407A, emissive: 0xEC407A, emissiveIntensity: 0.5 });
let currentFloor = 1;

// --- DOM 요소 캐싱 ---
const dom = {
    // Login Elements
    loginScreen: document.getElementById('login-screen'),
    securityCodeInput: document.getElementById('security-code-input'),
    loginErrorMessage: document.getElementById('login-error-message'),
    hacknetContainer: document.querySelector('.hacknet-container'),
    agentInfo: document.getElementById('agent-info'),
    onlineStatus: document.getElementById('online-status'),
    
    // Main App Elements
    leftPanelContent: document.getElementById('left-panel-content'),
    centerPanel: document.getElementById('center-panel'),
    rightPanelContent: document.getElementById('right-panel-content'),
    rightPanelTitle: document.getElementById('right-panel-title'),
    headerConnectionStatus: document.getElementById('header-connection-status'),
    systemOutput: document.getElementById('system-output'),
    terminalInput: document.getElementById('terminal-input'),
    promptIp: document.getElementById('prompt-ip'),
    hubLinkBtn: document.getElementById('hub-link-btn'),
    mapModal: document.getElementById('map-modal'),
    mapModalTitle: document.getElementById('map-modal-title'),
    closeModalBtn: document.querySelector('.modal .close-button'),
    blueprintSvg: document.getElementById('blueprint-svg'),
    map3DCanvas: document.getElementById('map-canvas'),
    view2DBtn: document.getElementById('view-2d-btn'),
    view3DBtn: document.getElementById('view-3d-btn'),
    floorControls: document.getElementById('floor-controls'),
    roomAnalysisInfo: document.getElementById('room-analysis-info'),
    roomInfoTemplate: document.getElementById('room-info-template'),
};

// --- 터미널 출력 관리 ---
let logQueue = [];
let isTyping = false;

// ==================================================================
// 1. 초기화 및 메인 로직
// ==================================================================
async function main() {
    try {
        await loadAndParseCsvData();
        setupLogin();
    } catch (error) {
        console.error("Initialization failed:", error);
        dom.loginErrorMessage.textContent = `[FATAL] DATA STREAM CORRUPTED`;
    }
}

async function loadAndParseCsvData() {
    const filesToLoad = [
        { key: 'agents', path: '../database/agents.csv' },
        { key: 'gates', path: '../database/gates.csv' }, { key: 'rooms', path: '../database/rooms.csv' },
        { key: 'connectors', path: '../database/connectors.csv' }, { key: 'details', path: '../database/details.csv' },
        { key: 'elements', path: '../database/elements.csv' }, { key: 'item', path: '../database/item.csv' },
        { key: 'monster', path: '../database/monster.csv' }, { key: 'events_traps', path: '../database/event.csv' }
    ];
    const promises = filesToLoad.map(fileInfo =>
        fetch(fileInfo.path).then(response => response.ok ? response.text() : Promise.reject(`Failed to load ${fileInfo.path}`))
        .then(csvText => new Promise(resolve => Papa.parse(csvText, {
            header: true, skipEmptyLines: true, dynamicTyping: true,
            trimHeaders: true, // Crucial for handling BOM or whitespace in headers
            complete: (results) => { database[fileInfo.key] = results.data; resolve(); }
        })))
    );
    await Promise.all(promises);
    database.monsters = database.monster;
    database.items = database.item;
}

function setupLogin() {
    document.body.classList.add('logged-out');
    dom.securityCodeInput.focus();
    dom.securityCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleLoginAttempt();
        }
    });
}

function handleLoginAttempt() {
    const inputCode = dom.securityCodeInput.value;
    const numericCode = parseInt(inputCode, 10);

    if (isNaN(numericCode)) {
        dom.loginErrorMessage.textContent = "INVALID FORMAT: NUMERIC CODE REQUIRED";
        dom.securityCodeInput.value = '';
        return;
    }

    const agent = database.agents.find(a => a.code === numericCode);

    if (agent) {
        dom.loginErrorMessage.textContent = "";
        dom.securityCodeInput.disabled = true;
        dom.agentInfo.textContent = `AGENT: ${agent.name}`;
        dom.onlineStatus.classList.remove('offline');
        dom.onlineStatus.querySelector('span').textContent = 'STATUS: SECURE-ONLINE';
        document.body.classList.remove('logged-out');
        document.body.classList.add('logged-in');
        dom.hacknetContainer.style.display = 'grid';

        setTimeout(() => {
            dom.loginScreen.style.display = 'none';
        }, 500);

        initializeSystem(agent);
    } else {
        dom.loginErrorMessage.textContent = "ACCESS DENIED: INVALID SECURITY CODE";
        dom.securityCodeInput.value = '';
    }
}


async function initializeSystem(agent) {
    await _print(`Initializing ARACHNE.OS v7.1...`, "color-info", 20);
    await _randomDelay(500, 800);
    await _print(`[SYSTEM] Calibrating secure data streams... Done.`, "color-success", 15);
    await _randomDelay(500, 1000);
    await _print(`[SYSTEM] Verifying agent credentials... ${agent.name}`, "color-info", 15);
    await _randomDelay(300, 600);
    
    init3D();
    setupEventListeners();
    renderAll();

    await _print(`Authentication successful. Welcome, Agent.`, 'color-hyean', 20);
    await _print(`System ready. Use 'help' or interact with the UI.`, 'color-info');
}

// ==================================================================
// 2. 상태 변경 함수 (내부 전용)
// ==================================================================
function setState(newState, callback) {
    const oldState = JSON.parse(JSON.stringify(state));
    state = { ...state, ...newState };
    
    let needsCenterPanelUpdate = false;
    let needsRightPanelUpdate = false;

    if (JSON.stringify(oldState.centerView) !== JSON.stringify(state.centerView)) {
        needsCenterPanelUpdate = true;
    }

    if (JSON.stringify(oldState.analysisTarget) !== JSON.stringify(state.analysisTarget)) {
        needsRightPanelUpdate = true;
        if(state.centerView.mode === 'list') {
            needsCenterPanelUpdate = true;
        }
    }

    if (needsCenterPanelUpdate) {
        renderCenterPanel();
    }
    if (needsRightPanelUpdate) {
        renderRightPanel();
    }
    
    if (oldState.activeGateId !== state.activeGateId) {
        renderLeftPanel();
        renderHeader();
        if (state.centerView.type === 'rooms') {
            renderCenterPanel();
        }
    }
    
    if (callback) {
        requestAnimationFrame(callback);
    }
}

// ==================================================================
// 3. 렌더링 함수
// ==================================================================
function renderAll() {
    renderHeader();
    renderLeftPanel();
    renderCenterPanel();
    renderRightPanel();
}

function renderHeader() {
    const gateId = state.activeGateId;
    if (gateId) {
        const gate = findItemInDatabase(gateId);
        if(gate) dom.headerConnectionStatus.innerHTML = `<span class="header-label">ANALYZING: ${gate.name}</span>`;
        dom.promptIp.textContent = gateId;
    } else {
        dom.headerConnectionStatus.innerHTML = `<span class="header-label">SYSTEM STANDBY</span>`;
        dom.promptIp.textContent = 'HOME';
    }
}

function renderLeftPanel() {
    dom.leftPanelContent.innerHTML = '';
    const activeGates = database.gates.filter(g => g.isActive);
    
    activeGates.forEach(gate => {
        const itemEl = createListItem(gate.name, `Rank: ${gate.rank} | ${gate.location}`, gate.id);
        if (state.activeGateId === gate.id) {
            itemEl.classList.add('active');
        }
        dom.leftPanelContent.appendChild(itemEl);
    });
}


function renderCenterPanel() {
    const { mode, type, filter } = state.centerView;
    
    dom.centerPanel.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'panel-header';
    const titleEl = document.createElement('h2');
    header.appendChild(titleEl);
    dom.centerPanel.appendChild(header);
    
    const content = document.createElement('div');
    content.className = 'panel-content';
    dom.centerPanel.appendChild(content);

    switch(mode) {
        case 'galaxy':
            titleEl.textContent = 'DATABASE CLUSTERS';
            content.innerHTML = `
                <div class="db-cluster-grid">
                    <button class="db-cluster-btn" data-type="gates"><i class="fas fa-dungeon"></i>GATES</button>
                    <button class="db-cluster-btn" data-type="monsters"><i class="fas fa-pastafarianism"></i>MONSTERS</button>
                    <button class="db-cluster-btn" data-type="items"><i class="fas fa-gem"></i>ITEMS</button>
                    <button class="db-cluster-btn" data-type="events_traps"><i class="fas fa-bolt"></i>EVENTS/TRAPS</button>
                </div>`;
            content.querySelectorAll('.db-cluster-btn').forEach(btn => {
                btn.addEventListener('click', e => handleCommand(`analyze ${e.currentTarget.dataset.type}`));
            });
            break;

        case 'list':
            titleEl.textContent = `${type.toUpperCase()} LIST`;
            const listContainerId = 'data-list-container-main';
            content.innerHTML = `
                <div class="search-bar-container"><input type="text" id="search-input" placeholder="Search in ${type}..." value="${filter}"></div>
                <div id="${listContainerId}" class="data-list-container"></div>`;
            const listContainer = content.querySelector(`#${listContainerId}`);
            
            let items = (database[type] || []);

            if (type === 'rooms' && state.activeGateId) {
                items = items.filter(room => room.GID === state.activeGateId);
            }
            
            items = items.filter(item => 
                (item.name || item.desc || item.RoomName || '').toLowerCase().includes(filter.toLowerCase())
            );
            listContainer.appendChild(createList(items));

            const searchInput = document.getElementById('search-input');
            searchInput.addEventListener('input', e => {
                state.centerView.filter = e.target.value;
                renderCenterPanel();
            });
            searchInput.focus();
            break;
    }
}

function renderRightPanel() {
    dom.rightPanelContent.innerHTML = '';
    const { type, id } = state.analysisTarget;

    if (!type || !id) {
        dom.rightPanelTitle.textContent = 'DATA ANALYSIS';
        dom.rightPanelContent.innerHTML = `<p class="placeholder">Select an item to analyze.</p>`;
        return;
    }
    
    const item = findItemInDatabase(id);
    if (!item) {
        dom.rightPanelTitle.textContent = 'ERROR';
        dom.rightPanelContent.innerHTML = `<p class="placeholder">Data not found for ${type}:${id}</p>`;
        return;
    }
    
    dom.rightPanelTitle.textContent = `ANALYSIS: ${item.name || item.RoomName || item.desc}`;

    if (type === 'gate') {
        dom.rightPanelContent.innerHTML = renderGateDashboard(item);
        dom.rightPanelContent.querySelector('[data-action="analyze-rooms"]').addEventListener('click', () => {
             handleCommand(`analyze rooms`);
        });
        dom.rightPanelContent.querySelector('[data-command]').addEventListener('click', e => handleCommand(e.currentTarget.dataset.command));
    } else {
        const infoSection = document.createElement('div');
        infoSection.className = 'analysis-section';
        infoSection.innerHTML = `<h3 class="analysis-title">DETAILS</h3><div class="analysis-content"><pre>${getFormattedInfoString(id)}</pre></div>`;
        dom.rightPanelContent.appendChild(infoSection);
    }
    
    const relatedNodes = getRelatedNodes(id);
    if (relatedNodes.length > 0) {
        const relatedSection = document.createElement('div');
        relatedSection.className = 'analysis-section';
        const listHtml = relatedNodes.map(node => {
            const relatedItem = findItemInDatabase(node.id);
            if (!relatedItem) return '';
            return `<div class="data-list-item linked-data-item" data-id="${node.id}">
                        <span class="data-list-item-name">${relatedItem.name || relatedItem.RoomName || 'Unknown'}</span>
                        <span class="data-list-item-details">${node.relation}</span>
                    </div>`;
        }).join('');
        relatedSection.innerHTML = `<h3 class="analysis-title">LINKED DATA</h3><div class="analysis-content linked-data-list">${listHtml}</div>`;
        dom.rightPanelContent.appendChild(relatedSection);
        relatedSection.querySelectorAll('.linked-data-item').forEach(el => {
            el.addEventListener('click', e => {
                handleCommand(`info ${e.currentTarget.dataset.id}`);
            });
        });
    }
}


// ==================================================================
// 4. 핵심 실행 함수
// ==================================================================
async function executeAnalyze(id) {
    const result = findItemByUniversalId(id);
    if (!result || !result.item) {
        await _print(`[ERROR] Data node not found: ${id}`, 'color-critical');
        return;
    }

    const { item, type } = result;

    await _print(`[SYSTEM] Accessing data node [${type}:${id}]...`, 'color-info');
    await _print(`[SYSTEM] Analysis complete. Rendering details for: ${item.name || item.RoomName || item.desc}`, 'color-success');
    
    let activeGateId = state.activeGateId;
    if (type === 'gate') {
        activeGateId = id;
    } else if (type === 'room') {
        const room = findItemInDatabase(id);
        if (room && room.GID) {
            activeGateId = room.GID;
        }
    }
    
    const targetListType = getPluralType(type);
    
    setState({
        centerView: { mode: 'list', type: targetListType, filter: '' },
        analysisTarget: { type, id },
        activeGateId,
    }, () => {
        const targetElement = document.getElementById(`list-item-${id}`);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.classList.add('focused');
        }
    });
}


async function executeReturnToHub(silent = false) {
    if (!silent) {
        _printImmediate(`> hub`, 'color-hyean');
        await _print(`[SYSTEM] Returning to Data Hub...`, 'color-info');
    }
    setState({ 
        centerView: { mode: 'galaxy', filter:'' }, 
        analysisTarget: { type: null, id: null }, 
        activeGateId: null 
    });
}

// ==================================================================
// 5. 이벤트 핸들러 및 헬퍼
// ==================================================================
function setupEventListeners() {
    dom.hubLinkBtn.addEventListener('click', () => {
       executeReturnToHub(false);
    });
    dom.terminalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const command = dom.terminalInput.value.trim(); if (command) { handleCommand(command); dom.terminalInput.value = ''; } } });
    dom.closeModalBtn.addEventListener('click', () => dom.mapModal.classList.remove('visible'));
    window.addEventListener('click', (event) => { if (event.target === dom.mapModal) dom.mapModal.classList.remove('visible'); });
    dom.view2DBtn.addEventListener('click', () => activateMapView('2D'));
    dom.view3DBtn.addEventListener('click', () => activateMapView('3D'));
}

async function handleCommand(command) {
    const args = command.split(' ');
    const cmd = args[0].toLowerCase();
    const targetId = args[1];

    _printImmediate(`${dom.promptIp.textContent}> ${command}`, 'color-hyean');

    switch(cmd) {
        case 'help':
            const helpText = `--- Available Commands ---
> analyze <type>    - Show list of a data type. (types: gates, monsters, items, events_traps)
> info <ID>         - Analyze a specific data node by its ID.
> whereis <ID>      - Find the location of an item, monster, or event.
> map <GATE_ID>     - Open the 2D/3D map viewer for the specified gate.
> hub               - Return to the Data Hub.
> clear             - Clear terminal output.`;
            await _print(helpText, 'color-data-content');
            break;

        case 'analyze': 
            if (!targetId) { await _print("Usage: analyze <type>", "color-warning"); break; }
            await _print(`[SYSTEM] Querying database for [${targetId.toUpperCase()}]...`, 'color-info');
            
            if (targetId === 'rooms' && state.activeGateId && state.analysisTarget.type === 'gate' && state.analysisTarget.id === state.activeGateId) {
                setState({ centerView: { mode: 'list', type: targetId, filter:'' }}); 
            } else {
                setState({ centerView: { mode: 'list', type: targetId, filter:'' }, analysisTarget:{type: null, id:null} }); 
            }
            break;

        case 'info':
            if (!targetId) { await _print("Usage: info <ID>", "color-warning"); break; }
            await executeAnalyze(targetId);
            break;

        case 'whereis':
            if (!targetId) { await _print("Usage: whereis <ID>", "color-warning"); break; }
            const locations = database.elements.filter(e => e.refId === targetId);
            if (locations.length > 0) {
                await _print(`[SYSTEM] Location query for [${targetId}]...`, 'color-info');
                for (const loc of locations) {
                    const room = findItemInDatabase(loc.RoomID);
                    const roomName = room ? room.RoomName : 'Unknown Room';
                    await _print(` > Found at: ${loc.RoomID} (${roomName})`, 'color-success');
                }
            } else {
                await _print(`[ERROR] No location data found for ID: ${targetId}`, 'color-critical');
            }
            break;
            
        case 'map':
            if (!targetId || !targetId.startsWith('G-')) {
                await _print("Error: `map` command requires a valid Gate ID (e.g., G-001).", "color-warning");
                break;
            }
            await showMapModal(targetId);
            break;

        case 'hub':
            await executeReturnToHub(false);
            break;

        case 'clear':
            dom.systemOutput.innerHTML = '';
            break;
            
        default:
            await _print(`Command not found: ${command}`, 'color-critical');
            break;
    }
}

/**
 * Finds an item and its type from any database table based on its ID.
 * This is the single source of truth for finding items.
 * @param {string} id The universal ID to search for.
 * @returns {{item: object, type: string}|null}
 */
function findItemByUniversalId(id) {
    if (!id) return null;

    let dbKey, type;
    let item = null;

    if (id.startsWith('B-')) {
        dbKey = 'monsters'; type = 'boss';
    } else if (id.startsWith('M-')) {
        dbKey = 'monsters'; type = 'monster';
    } else if (id.startsWith('G-')) {
        dbKey = 'gates'; type = 'gate';
    } else if (id.startsWith('I-') || id.startsWith('R-') || id.startsWith('E-') || id.startsWith('S-')) {
        dbKey = 'items'; type = 'item';
    } else if (id.startsWith('EV-')) {
        dbKey = 'events_traps'; type = 'event';
    } else if (id.startsWith('T-')) {
        dbKey = 'events_traps'; type = 'trap';
    } else {
        const roomBase = database.rooms.find(d => d.id === id);
        if (roomBase) {
            const roomDetail = database.details.find(d => d.RoomID === id);
            return { item: { ...roomBase, ...roomDetail }, type: 'room' };
        }
        return null;
    }

    item = database[dbKey]?.find(d => d.ID === id || d.id === id);

    return item ? { item, type } : null;
}

function findItemInDatabase(id) {
    return findItemByUniversalId(id)?.item || null;
}

function createListItem(name, details, id) {
    const itemEl = document.createElement('div');
    itemEl.className = 'data-list-item';
    itemEl.dataset.id = id;
    itemEl.id = `list-item-${id}`;
    itemEl.innerHTML = `<span class="data-list-item-name">${name}</span><span class="data-list-item-details">${details}</span>`;
    
    itemEl.addEventListener('click', () => {
        handleCommand(`info ${id}`);
    });
    
    return itemEl;
}

function createList(items) {
    const container = document.createElement('div');
    if (items.length === 0) {
        container.innerHTML = `<p class="placeholder">No data found in this cluster.</p>`;
        return container;
    }
    
    items.forEach(item => {
        const id = item.ID || item.id || item.RoomID;
        const name = item.name || item.desc || (item.RoomName || 'Unknown Room');
        const details = item.rank ? `Rank: ${item.rank} | ID: ${id}` : `ID: ${id}`;
        
        const itemEl = createListItem(name, details, id);
        
        if (state.analysisTarget.id === id) {
            itemEl.classList.add('active');
        }
        container.appendChild(itemEl);
    });
    return container;
}
function renderGateDashboard(gate) {
    const rooms = database.rooms.filter(r => r.GID === gate.id);
    const elements = database.elements.filter(e => rooms.some(room => room.id === e.RoomID));
    const totalRooms = rooms.length, floors = new Set(rooms.map(r => r.floor)).size, threatCount = elements.filter(e => ['monster', 'trap', 'boss'].includes(e.type)).length, boss = elements.find(e => e.type === 'boss');
    return `<div class="analysis-section">
                <div class="dashboard-header">
                    <h2 class="dashboard-title">${gate.name}</h2>
                    <p class="dashboard-subtitle">ID: ${gate.id} | Rank: ${gate.rank} | Location: ${gate.location}</p>
                </div>
                <div class="dashboard-grid">
                    <div class="dashboard-widget"><i class="widget-icon fas fa-door-open"></i><p class="widget-value">${totalRooms}</p><p class="widget-label">Spaces</p></div>
                    <div class="dashboard-widget"><i class="widget-icon fas fa-layer-group"></i><p class="widget-value">${floors}</p><p class="widget-label">Floors</p></div>
                    <div class="dashboard-widget"><i class="widget-icon fas fa-biohazard"></i><p class="widget-value">${threatCount}</p><p class="widget-label">Threats</p></div>
                    <div class="dashboard-widget"><i class="widget-icon fas fa-crown"></i><p class="widget-value">${boss ? boss.desc : 'N/A'}</p><p class="widget-label">Primary Target</p></div>
                </div>
                <div class="dashboard-description">${gate.desc}</div>
                <div class="dashboard-actions">
                    <button class="dashboard-btn" data-action="analyze-rooms">Analyze All Rooms</button>
                    <button class="dashboard-btn" data-command="map ${gate.id}">Open Map</button>
                </div>
            </div>`;
}
function getPluralType(singularType) {
    const typeMap = {
        'gate': 'gates', 'monster': 'monsters', 'boss': 'monsters', 'item': 'items',
        'event': 'events_traps', 'trap': 'events_traps', 'room': 'rooms',
    };
    return typeMap[singularType] || `${singularType}s`;
}

// MODIFICATION: The problematic normalization logic has been removed.
function getFormattedInfoString(id) {
    const result = findItemByUniversalId(id);
    if (!result) return `Data not found for ${id}.`;
    
    const { item, type } = result;

    switch(type) { // Use the direct type from the universal finder
        case 'item': 
            return `--- ITEM INFO: ${item.name} ---\nID: ${item.ID} | Rank: ${item.rank}\nCategory: ${item.category}\nDesc: ${item.desc}`;
        case 'monster': 
        case 'boss': 
            return `--- ENTITY INFO: ${item.name} ---\nID: ${item.ID} | Cat: ${item.category.toUpperCase()} | Rank: ${item.rank}\nHabitat: ${item.habit} | Weakness: ${item.weak}\nDesc: ${item.desc}`;
        case 'event': 
        case 'trap': 
            return `--- EVENT/TRAP INFO: ${item.name} ---\nID: ${item.ID} | Cat: ${item.category.toUpperCase()}\nDesc: ${item.desc}`;
        case 'room':
            let info = `--- ROOM INFO: ${item.RoomName} ---\nID: ${item.id} | Type: ${item.type}\nDesc: ${item.dec}`;
            const elements = database.elements.filter(e => e.RoomID === id);
            if(elements.length > 0) {
                info += `\n\n--- KEY ELEMENTS ---`;
                elements.forEach(el => { info += `\n- ${el.type.toUpperCase()}: ${el.desc}${el.quantity > 1 ? ` x${el.quantity}`: ''} (Ref: ${el.refId || 'N/A'})`; });
            }
            return info;
    }
    return `Unknown info type: ${type}`; // Fallback
}

function getRelatedNodes(id) {
    const related = [];
    const add = (type, id, relation) => { if (id && type && !related.some(r => r.type === type && r.id === id)) related.push({type, id, relation}); };
    
    const result = findItemByUniversalId(id);
    if (!result) return [];
    
    const itemType = result.type;

    switch(itemType) {
        case 'monster': case 'boss':
            database.elements.filter(e => e.refId === id).forEach(el => { const room = findItemInDatabase(el.RoomID); if (room) { add('room', room.id, 'Appears In'); add('gate', room.GID, 'Located In'); } });
            break;
        case 'item':
            database.elements.filter(e => e.refId === id).forEach(el => { const room = findItemInDatabase(el.RoomID); if(room) { add('room', room.id, 'Found In'); database.elements.filter(e => e.RoomID === room.id && (e.type === 'monster' || e.type === 'boss')).forEach(m => { const monsterResult = findItemByUniversalId(m.refId); if(monsterResult) add(monsterResult.type, m.refId, 'Guarded By'); }); } });
            break;
        case 'room':
            const room = findItemInDatabase(id);
            if(room) { add('gate', room.GID, 'Part of'); database.elements.filter(e => e.RoomID === id).forEach(el => { if (el.refId) { const relResult = findItemByUniversalId(el.refId); if(relResult) add(relResult.type, el.refId, 'Contains'); } }); database.connectors.filter(c => c.FromID === id).forEach(c => add('room', c.ToID, 'Connects To')); database.connectors.filter(c => c.ToID === id).forEach(c => add('room', c.FromID, 'Connected From')); }
            break;
        case 'gate':
            const rooms = database.rooms.filter(r => r.GID === id);
            rooms.forEach(r => add('room', r.id, 'Contains'));
            const mainBoss = database.elements.find(el => el.type === 'boss' && rooms.some(r => r.id === el.RoomID));
            if(mainBoss) { const bossResult = findItemByUniversalId(mainBoss.refId); if(bossResult) add(bossResult.type, mainBoss.refId, 'Primary Target'); }
            break;
        case 'event': case 'trap':
             database.elements.filter(e => e.refId === id).forEach(el => { const room = findItemInDatabase(el.RoomID); if (room) { add('room', room.id, 'Occurs In'); } });
            break;
    }
    return related;
}
function _printImmediate(message, colorClass = 'color-hyean') { const line = document.createElement('div'); line.innerHTML = `<span class="log-message ${colorClass}">${message}</span>`; dom.systemOutput.appendChild(line); dom.systemOutput.scrollTop = dom.systemOutput.scrollHeight; }
function _print(message, colorClass = 'color-info', speed = TYPING_SPEED) { return new Promise(resolve => { logQueue.push({ message, colorClass, speed, resolve }); if (!isTyping) processLogQueue(); }); }
function processLogQueue() { if (logQueue.length === 0) { isTyping = false; return; } isTyping = true; const { message, colorClass, speed, resolve } = logQueue.shift(); const line = document.createElement('div'); line.classList.add('log-message', colorClass); dom.systemOutput.appendChild(line); dom.systemOutput.scrollTop = dom.systemOutput.scrollHeight; let charIndex = 0; const type = () => { if (charIndex < message.length) { line.textContent += message.charAt(charIndex); dom.systemOutput.scrollTop = dom.systemOutput.scrollHeight; charIndex++; setTimeout(type, speed); } else { resolve(); processLogQueue(); } }; type(); }
function _randomDelay(min = 50, max = 200) { return new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min)); }
function buildBlueprintData(gateId) { const rooms = database.rooms.filter(r => r.GID === gateId); const connectors = database.connectors.filter(c => c.GID === gateId).map(c => ({ from: c.FromID, to: c.ToID })); const details = {}; rooms.forEach(room => { const roomDetail = database.details.find(d => d.RoomID === room.id); const roomElements = database.elements.filter(e => e.RoomID === room.id); if (roomDetail) { details[room.id] = { name: roomDetail.RoomName, type: roomDetail.type, description: roomDetail.dec, info: roomElements }; } }); return { rooms, connectors, details }; }
async function showMapModal(gateId) { _printImmediate(`> map ${gateId}`, 'color-hyean'); const gate = findItemInDatabase(gateId); if (!gate) { await _print(`[ERROR] No blueprint data found for ${gateId}.`, 'color-critical'); return; } const currentBlueprintData = buildBlueprintData(gateId); if (!currentBlueprintData || currentBlueprintData.rooms.length === 0) { await _print(`[ERROR] No blueprint data found for ${gate.name}.`, 'color-critical'); return; } dom.mapModalTitle.textContent = `${gate.name} Blueprint`; dom.mapModal.classList.add('visible'); await new Promise(resolve => setTimeout(resolve, 50)); generate2DMap(currentBlueprintData); generate3DMap(currentBlueprintData); generateFloorControls(currentBlueprintData); const initialFloors = [...new Set(currentBlueprintData.rooms.map(r => r.floor))].sort((a,b)=>b-a); currentFloor = initialFloors.length > 0 ? initialFloors[0] : 1; filterFloor(currentFloor); activateMapView('2D'); selectRoom(null); onWindowResize3D(); }
function activateMapView(mode) { if (mode === '2D') { dom.blueprintSvg.classList.add('active-map-view'); dom.map3DCanvas.classList.remove('active-map-view'); dom.view2DBtn.classList.add('active'); dom.view3DBtn.classList.remove('active'); dom.floorControls.style.display = 'flex'; filterFloor(currentFloor); } else { dom.map3DCanvas.classList.add('active-map-view'); dom.blueprintSvg.classList.remove('active-map-view'); dom.view3DBtn.classList.add('active'); dom.view2DBtn.classList.remove('active'); dom.floorControls.style.display = 'none'; onWindowResize3D(); roomObjects3D.forEach(mesh => mesh.visible = true); const active2DRoomId = document.querySelector('#blueprint-svg .room.active')?.id.replace('svg-', ''); selectRoom(active2DRoomId); } }
function selectRoom(roomId) { document.querySelectorAll('#blueprint-svg .room.active').forEach(r => r.classList.remove('active')); if(roomId) { const targetSvg = document.getElementById(`svg-${roomId}`); if(targetSvg) targetSvg.classList.add('active'); } if(activeRoom3D) activeRoom3D.material = materialDefault.clone(); activeRoom3D = null; if(roomId) { const target3D = roomObjects3D.find(obj => obj.userData.id === roomId); if(target3D) { target3D.material = materialSelected.clone(); activeRoom3D = target3D; } } updateRoomInfoPanel(roomId); }
function updateRoomInfoPanel(roomId) { const roomDetail = roomId ? findItemInDatabase(roomId) : null; if (roomDetail) { dom.roomAnalysisInfo.innerHTML = dom.roomInfoTemplate.innerHTML; document.getElementById('room-name-bp').textContent = roomDetail.RoomName; document.getElementById('room-type-bp').textContent = roomDetail.type; document.getElementById('room-description-bp').textContent = roomDetail.dec; const detailsList = document.getElementById('room-details-bp'); const detailsTitle = document.getElementById('room-details-title-bp'); detailsList.innerHTML = ''; const roomElements = database.elements.filter(e => e.RoomID === roomId); if (roomElements.length > 0) { detailsTitle.style.display = 'block'; roomElements.forEach(item => { const li = document.createElement('li'); li.innerHTML = `<span class="info-icon">${item.type[0].toUpperCase()}</span> ${item.desc} ${item.quantity > 1 ? `x${item.quantity}`: ''}`; detailsList.appendChild(li); }); } else { detailsTitle.style.display = 'none'; } } else { dom.roomAnalysisInfo.innerHTML = `<div class="placeholder">[ 시스템 ] // 공간을 선택하여<br>상세 정보를 확인하십시오.</div>`; } }
function generateFloorControls(blueprintData) { dom.floorControls.innerHTML = ''; const floors = [...new Set((blueprintData.rooms || []).map(r => r.floor))].sort((a,b) => b-a); floors.forEach(floorNum => { const btn = document.createElement('button'); if (floorNum > 0) { btn.textContent = `${floorNum}F`; } else if (floorNum === 0) { btn.textContent = 'B1F'; } else { btn.textContent = `B${-floorNum + 1}F`; } btn.dataset.floor = floorNum; btn.addEventListener('click', () => filterFloor(floorNum)); dom.floorControls.appendChild(btn); }); if (floors.length > 0) { currentFloor = floors[0]; } }
function filterFloor(floorNum){ currentFloor = floorNum; dom.blueprintSvg.querySelectorAll('[data-floor], [data-from-floor]').forEach(el => { const elFloor = parseInt(el.dataset.floor); const fromFloor = parseInt(el.dataset.fromFloor); const toFloor = parseInt(el.dataset.toFloor); let isVisible = false; if (!isNaN(elFloor)) { isVisible = elFloor === floorNum; } else if (!isNaN(fromFloor)) { isVisible = fromFloor === floorNum || toFloor === floorNum; } el.style.display = isVisible ? 'block' : 'none'; }); dom.floorControls.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.floor) === floorNum)); const activeRoom = document.querySelector('#blueprint-svg .room.active'); if(activeRoom) { const roomData = findItemInDatabase(activeRoom.id.replace('svg-', '')); if(roomData && roomData.floor !== floorNum) { selectRoom(null); } } }
function generate2DMap(blueprintData) { dom.blueprintSvg.innerHTML = ''; const { rooms, connectors } = blueprintData; if(!rooms || rooms.length === 0) return; const gConnectors = document.createElementNS("http://www.w3.org/2000/svg", 'g'); connectors.forEach(c => { const fromRoom = rooms.find(r => r.id === c.from); const toRoom = rooms.find(r => r.id === c.to); if (!fromRoom || !toRoom) return; const g = document.createElementNS("http://www.w3.org/2000/svg", 'g'); g.dataset.fromFloor = fromRoom.floor; g.dataset.toFloor = toRoom.floor; const line = document.createElementNS("http://www.w3.org/2000/svg", 'line'); line.setAttribute('class', 'connector'); const fromCenter = { x: fromRoom.x + fromRoom.w / 2, y: fromRoom.y + fromRoom.h / 2 }; const toCenter = { x: toRoom.x + toRoom.w / 2, y: toRoom.y + toRoom.h / 2 }; line.setAttribute('x1', fromCenter.x); line.setAttribute('y1', fromCenter.y); line.setAttribute('x2', toCenter.x); line.setAttribute('y2', toCenter.y); g.appendChild(line); if (fromRoom.floor !== toRoom.floor) { const icon = document.createElementNS("http://www.w3.org/2000/svg", 'text'); icon.setAttribute('class', 'floor-connector-icon'); icon.setAttribute('x', (fromCenter.x + toCenter.x) / 2); icon.setAttribute('y', (fromCenter.y + toCenter.y) / 2 + 6); icon.textContent = '⇕'; g.appendChild(icon); } gConnectors.appendChild(g); }); dom.blueprintSvg.appendChild(gConnectors); const gRooms = document.createElementNS("http://www.w3.org/2000/svg", 'g'); rooms.forEach(r => { const g = document.createElementNS("http://www.w3.org/2000/svg", 'g'); g.dataset.floor = r.floor; g.addEventListener('click', () => selectRoom(r.id)); const rect = document.createElementNS("http://www.w3.org/2000/svg", 'rect'); rect.id = `svg-${r.id}`; rect.setAttribute('class', 'room'); rect.setAttribute('x', r.x); rect.setAttribute('y', r.y); rect.setAttribute('width', r.w); rect.setAttribute('height', r.h); const label = document.createElementNS("http://www.w3.org/2000/svg", 'text'); label.setAttribute('class', 'room-label'); label.setAttribute('x', r.x + r.w / 2); label.setAttribute('y', r.y + r.h / 2 + 5); label.textContent = r.name; g.appendChild(rect); g.appendChild(label); gRooms.appendChild(g); }); dom.blueprintSvg.appendChild(gRooms); const bbox = dom.blueprintSvg.getBBox(); const padding = 50; if (bbox.width > 0 && bbox.height > 0) { dom.blueprintSvg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding*2} ${bbox.height + padding*2}`); } }
function init3D() { scene = new THREE.Scene(); raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2(); camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000); renderer = new THREE.WebGLRenderer({ canvas: dom.map3DCanvas, antialias: true, alpha: true }); renderer.setClearColor(0x000000, 0); controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; scene.add(new THREE.AmbientLight(0xffffff, 0.7)); const dirLight = new THREE.DirectionalLight(0xffffff, 1); dirLight.position.set(50, 100, 75); scene.add(dirLight); dom.map3DCanvas.addEventListener('click', (event) => { const rect = dom.map3DCanvas.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera); const intersects = raycaster.intersectObjects(roomObjects3D); if (intersects.length > 0) { selectRoom(intersects[0].object.userData.id); } }); function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); } animate(); }
function onWindowResize3D(){ const wrapper = dom.map3DCanvas.parentElement; if(!wrapper || wrapper.clientWidth === 0) return; camera.aspect = wrapper.clientWidth / wrapper.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(wrapper.clientWidth, wrapper.clientHeight); }
function generate3DMap(blueprintData) { if(!scene) return; while(scene.children.length > 2) { scene.remove(scene.children[2]); } roomObjects3D = []; activeRoom3D = null; const { rooms, connectors } = blueprintData; if (!rooms || rooms.length === 0) return; const roomMeshes = {}; const scale = 10; rooms.forEach(r => { const geometry = new THREE.BoxGeometry(r.w/scale, 2, r.h/scale); const roomMesh = new THREE.Mesh(geometry, materialDefault.clone()); roomMesh.position.set(r.x/scale + r.w/(2*scale), r.floor * 5, r.y/scale + r.h/(2*scale)); roomMesh.userData = { id: r.id, floor: r.floor }; scene.add(roomMesh); roomObjects3D.push(roomMesh); roomMeshes[r.id] = roomMesh; }); connectors.forEach(c => { const fromMesh = roomMeshes[c.from]; const toMesh = roomMeshes[c.to]; if (!fromMesh || !toMesh) return; const lineMat = new THREE.LineBasicMaterial({ color: 0xa0aec0, transparent: true, opacity: 0.7 }); const lineGeo = new THREE.BufferGeometry().setFromPoints([fromMesh.position, toMesh.position]); scene.add(new THREE.Line(lineGeo, lineMat)); }); const box = new THREE.Box3().setFromObject(scene); const center = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()); const maxDim = Math.max(size.x, size.y, size.z); const fov = camera.fov * (Math.PI / 180); let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2)); cameraZ *= 1.5; camera.position.set(center.x, center.y + cameraZ/2, center.z + cameraZ); controls.target.copy(center); controls.update(); }

// --- 애플리케이션 시작 ---
main();