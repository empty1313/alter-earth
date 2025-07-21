// 최종본: v3.1 - Standalone Arachne Web with Full Scenario Integration
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- 글로벌 DB 및 상태 ---
    let db = {};
    const state = {
        sidebarMode: 'active',
        activeGateId: null,
        inspectorState: { view: 'none' }, 
        currentUser: null,
    };

    // --- 터미널 히스토리 ---
    let commandHistory = [];
    let historyIndex = -1;

    // --- 3D 맵 전역 변수 ---
    let scene, camera, renderer, controls, raycaster, pointer, roomObjects3D = [];
    let activeRoom3D = null;
    let currentBlueprintData = {};
    let currentMapFloor = 1;
    const materialDefault = new THREE.MeshStandardMaterial({ color: 0x7d8590, transparent: true, opacity: 0.7 });
    const materialSelected = new THREE.MeshStandardMaterial({ color: 0xEC407A, emissive: 0xEC407A, emissiveIntensity: 0.5 });
    const materialStart = new THREE.MeshStandardMaterial({ color: 0x238636, emissive: 0x238636, emissiveIntensity: 0.2 });

    // --- DOM 요소 캐싱 ---
    const dom = {
        loginScreen: document.getElementById('login-screen'),
        securityCodeInput: document.getElementById('security-code-input'),
        loginErrorMessage: document.getElementById('login-error-message'),
        agentName: document.getElementById('agent-name'),
        opsContainer: document.querySelector('.ops-container'),
        sidebar: document.getElementById('ops-sidebar'),
        sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
        modeHubBtn: document.getElementById('mode-hub-btn'),
        modeActiveBtn: document.getElementById('mode-active-btn'),
        gateSearchInput: document.getElementById('gate-search-input'),
        gateListContent: document.getElementById('gate-list-content'),
        gateInfoHeader: document.getElementById('gate-info-header'),
        inspectorPanel: document.getElementById('inspector-panel'),
        inspectorContent: document.getElementById('inspector-content'),
        terminalOutput: document.getElementById('terminal-output'),
        terminalInput: document.getElementById('terminal-input'),
        promptContext: document.getElementById('prompt-context'),
        threatFeed: document.getElementById('threat-feed-content'),
        mapViewer: document.getElementById('map-viewer'),
        blueprintSvg: document.getElementById('blueprint-svg'),
        map3DCanvas: document.getElementById('map-canvas'),
        view2DBtn: document.getElementById('view-2d-btn'),
        view3DBtn: document.getElementById('view-3d-btn'),
        floorControls: document.getElementById('floor-controls'),
    };
    
    // --- 터미널 로깅 함수 ---
    function logToTerminal(message, context = "SYSTEM") {
        const timestamp = new Date().toLocaleTimeString('en-GB');
        const entry = document.createElement('div');
        const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");
        entry.innerHTML = `<span class="feed-timestamp">[${timestamp}]</span> <span class="feed-info">[${context}]</span> > ${sanitizedMessage}`;
        dom.terminalOutput.appendChild(entry);
        dom.terminalOutput.scrollTop = dom.terminalOutput.scrollHeight;
    }

    // --- 데이터 로딩 ---
    async function loadAllData() {
        const files = ['gates', 'rooms', 'connectors', 'details', 'monster', 'item', 'event', 'elements', 'agents', 'protocols', 'scenarios'];
        try {
            await Promise.all(files.map(async (file) => {
                const res = await fetch(`../database/${file}.csv`);
                if (!res.ok) throw new Error(`Failed to load ${file}.csv`);
                const text = await res.text();
                db[file] = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
            }));
        } catch (error) {
            logToTerminal(`FATAL ERROR: ${error.message}`, "CRITICAL");
            console.error(error);
        }
    }
    
    // --- 헬퍼 함수 ---
    function getElementIcon(type) {
        switch(type) {
            case 'boss': return 'fa-crown';
            case 'monster': return 'fa-skull-crossbones';
            case 'item': return 'fa-gem';
            case 'trap':
            case 'event': return 'fa-bolt';
            case 'room': return 'fa-cube';
            default: return 'fa-question-circle';
        }
    }
    
    function getEntityRank(entityData, entityType) {
        if (entityData && entityData.rank) {
            return String(entityData.rank).toUpperCase();
        }
        if (entityType === 'trap' || entityType === 'event') {
            return 'NONE';
        }
        return 'E';
    }


    // --- 로그인 관련 함수 ---
    function setupLogin() {
        dom.securityCodeInput.focus();
        dom.securityCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLoginAttempt();
        });
    }

    function handleLoginAttempt() {
        const numericCode = parseInt(dom.securityCodeInput.value, 10);
        if (isNaN(numericCode)) {
            dom.loginErrorMessage.textContent = "INVALID FORMAT: NUMERIC CODE REQUIRED";
            dom.securityCodeInput.value = '';
            return;
        }
        const agent = db.agents.find(a => a.code === numericCode);
        if (agent) {
            state.currentUser = agent;
            dom.loginErrorMessage.textContent = "";
            dom.securityCodeInput.disabled = true;
            document.body.classList.remove('logged-out');
            document.body.classList.add('logged-in');
            setTimeout(() => initializeMainApp(agent), 500);
        } else {
            dom.loginErrorMessage.textContent = "ACCESS DENIED: INVALID SECURITY CODE";
            dom.securityCodeInput.value = '';
        }
    }

    // --- 사이드바 및 게이트 목록 ---
    function renderGateList() {
        const searchTerm = dom.gateSearchInput.value.toLowerCase();
        let gatesToShow = db.gates || [];

        if (state.sidebarMode === 'active') {
            gatesToShow = gatesToShow.filter(g => g.isActive === true);
        }
        if (searchTerm && state.sidebarMode === 'hub') {
            gatesToShow = gatesToShow.filter(g =>
                (g.name && g.name.toLowerCase().includes(searchTerm)) ||
                (g.location && g.location.toLowerCase().includes(searchTerm)) ||
                (g.id && g.id.toLowerCase().includes(searchTerm))
            );
        }

        dom.gateListContent.innerHTML = gatesToShow.map(gate => {
            const isActiveClass = gate.isActive ? 'is-active-gate' : '';
            const activeClass = gate.id === state.activeGateId ? 'active' : '';
            return `<div class="gate-item ${isActiveClass} ${activeClass}" data-id="${gate.id}">
                        <div class="gate-name">${gate.name}</div>
                        <div class="gate-details">Rank ${gate.rank} | ${gate.location}</div>
                    </div>`;
        }).join('');
    }

    // --- 게이트 선택 ---
    function loadGate(gateId) {
        if (state.activeGateId === gateId) return;
        state.activeGateId = gateId;

        const gate = db.gates.find(g => g.id === gateId);
        logToTerminal(`Loading gate data: ${gate.name} [${gateId}]`, 'GATE');
        dom.gateInfoHeader.textContent = `${gate.name} [Rank ${gate.rank}]`;
        dom.promptContext.textContent = gateId;
        renderGateList();

        currentBlueprintData = buildBlueprintData(gateId);
        if (!currentBlueprintData || currentBlueprintData.rooms.length === 0) {
            logToTerminal(`No blueprint data found for ${gate.name}.`, "ERROR");
            dom.blueprintSvg.innerHTML = '';
            if(scene) while(scene.children.length > 2) { scene.remove(scene.children[2]); }
            return;
        }
        
        generate2DMap(currentBlueprintData);
        generate3DMap(currentBlueprintData);
        generateFloorControls(currentBlueprintData);
        
        const initialFloors = [...new Set(currentBlueprintData.rooms.map(r => r.floor))].sort((a, b) => b - a);
        currentMapFloor = initialFloors.length > 0 ? initialFloors[0] : 1;
        
        filterFloor(currentMapFloor, true); 
        activateMapView('3D', true);
        selectRoom(null);
        onWindowResize3D();
        updateInspector({ view: 'none' });
    }

    function updateInspector(newState) {
        state.inspectorState = newState;
        const { view, id, parentId } = state.inspectorState;

        let html = '';
        if (view === 'none') {
            html = `<div class="placeholder">Select a gate from the list, or a room on the map.</div>`;
            dom.inspectorContent.innerHTML = html;
            return;
        }

        html = `<div class="inspector-wrapper corner-bracket"><div>`;

        if (['monster', 'boss', 'item', 'trap', 'event'].includes(view)) {
             html += `<button class="inspector-back-btn" data-view="room" data-id="${parentId}"><i class="fas fa-arrow-left"></i> Back to Room Analysis</button>`;
        }
        
        let headerHtml = '', primaryStatsHtml = '', containedElementsHtml = '', scenariosHtml = '', descriptionHtml = '';

        if (view === 'room') {
            const roomDetail = db.details.find(d => d.RoomID === id);
            if(roomDetail) {
                logToTerminal(`Inspecting room: ${roomDetail.RoomName}`, 'INSPECTOR');
                headerHtml = `<div class="inspector-header">
                                <div class="icon"><i class="fas ${getElementIcon('room')}"></i></div>
                                <div class="title-block"><h4>${roomDetail.RoomName}</h4><span class="subtitle">${roomDetail.type}</span></div>
                              </div>`;
                descriptionHtml = `<div class="inspector-section"><h5>// ROOM DESCRIPTION</h5><div class="description-section">${roomDetail.dec}</div></div>`;
                
                const elementsInRoom = (db.elements || []).filter(e => e.RoomID === id);
                if (elementsInRoom.length > 0) {
                     containedElementsHtml += `<div class="inspector-section"><h5>// CONTAINED ELEMENTS</h5><div class="contained-elements-list">`;
                    elementsInRoom.forEach(el => {
                        let entityData;
                        switch (el.type) {
                            case 'monster': case 'boss': entityData = db.monster.find(m => m.ID === el.refId); break;
                            case 'item': entityData = db.item.find(i => i.ID === el.refId); break;
                            case 'trap': case 'event': entityData = db.event.find(e => e.ID === el.refId); break;
                            default: entityData = null;
                        }
                        if (!entityData) {
                            entityData = { name: el.refId + " (⚠️)", rank: 'NONE' };
                        }
                        
                        const rank = getEntityRank(entityData, el.type);
                        const rankClass = `rank-${rank.toLowerCase()}`;
                        let displayName = entityData.name;
                        if (el.quantity > 1) displayName += ` x${el.quantity}`;

                        containedElementsHtml += `
                        <div class="inspector-item ${rankClass}" data-type="${el.type}" data-id="${el.refId}" data-parent-id="${id}">
                            <div class="inspector-item-header">
                                <i class="item-icon fas ${getElementIcon(el.type)}"></i>
                                <span>${displayName}</span>
                            </div>
                            <div class="inspector-item-details">
                                <div class="details-content">${el.desc || 'No additional description.'}</div>
                                <a href="#" class="details-analyze-btn">Analyze Details...</a>
                            </div>
                        </div>`;
                    });
                     containedElementsHtml += `</div></div>`;
                }
                
                const scenariosInRoom = (db.scenarios || []).filter(s => s.scope === 'ROOM' && s.scope_id === id);
                if (scenariosInRoom.length > 0) {
                    scenariosHtml += `<div class="inspector-section"><h5>// ACTIVE GIMMICKS / EVENTS</h5><div class="scenarios-list">`;
                    scenariosInRoom.forEach(scn => {
                        // [v3.1 수정] 링크 기능 제거, 단순 텍스트로 표시
                        let descHtml = scn.description;
                        if (scn.linked_entities) {
                             const linkedIds = scn.linked_entities.split(',').map(s => s.trim());
                             linkedIds.forEach(linkedId => {
                                 descHtml = descHtml.replace(new RegExp(`'${linkedId}'`, 'g'), `'<span class="linked-entity-link">${linkedId}</span>'`);
                             });
                        }
                        scenariosHtml += `<div class="scenario-item"><p><span class="category">[${scn.category}]</span> ${descHtml}</p></div>`;
                    });
                    scenariosHtml += `</div></div>`;
                }
            }
        } else { // 상세 뷰
            let entityData, entityType = view;
            switch (view) {
                case 'monster': case 'boss': entityData = db.monster.find(m => m.ID === id); break;
                case 'item': entityData = db.item.find(i => i.ID === id); break;
                case 'trap': case 'event': entityData = db.event.find(e => e.ID === id); break;
            }

            if(entityData) {
                const parentRoom = db.details.find(d => d.RoomID === parentId);
                logToTerminal(`Analyzing entity: ${entityData.name}`, 'INSPECTOR');
                headerHtml = `<div class="inspector-header">
                                <div class="icon"><i class="fas ${getElementIcon(view)}"></i></div>
                                <div class="title-block"><h4>${entityData.name}</h4><span class="subtitle">From: ${parentRoom ? parentRoom.RoomName : parentId}</span></div>
                              </div>`;
                
                const rank = getEntityRank(entityData, entityType);
                primaryStatsHtml += `<div class="primary-stats">`;
                if (rank !== 'NONE') {
                    primaryStatsHtml += `<div class="stat-item"><div class="rank-hexagon ${'rank-'+rank.toLowerCase()}">${rank}</div></div>`;
                }
                const elInstance = db.elements.find(e => e.refId === id && e.RoomID === parentId);
                if (elInstance && elInstance.quantity > 1) primaryStatsHtml += `<div class="stat-item"><i class="fas fa-users"></i><span class="value">${elInstance.quantity}</span></div>`;

                if (entityType === 'monster' || entityType === 'boss') {
                    if (entityData.weak) primaryStatsHtml += `<div class="stat-item"><i class="fas fa-shield-halved"></i><span class="value">${entityData.weak}</span></div>`;
                    if (entityData.habit) primaryStatsHtml += `<div class="stat-item"><i class="fas fa-crosshairs"></i><span class="value">${entityData.habit}</span></div>`;
                } else if (entityData.category) {
                    primaryStatsHtml += `<div class="stat-item"><i class="fas fa-tag"></i><span class="value">${entityData.category}</span></div>`;
                }
                primaryStatsHtml += `</div>`;

                if(entityData.desc) {
                    descriptionHtml = `<div class="inspector-section"><h5>// TACTICAL MEMO</h5><div class="description-section">${entityData.desc}</div></div>`;
                }
            }
        }
        
        html += headerHtml + primaryStatsHtml + descriptionHtml + containedElementsHtml + scenariosHtml;
        html += `</div></div>`;

        dom.inspectorContent.innerHTML = html;
        selectRoom(view === 'room' ? id : parentId); 
    }
    
    // --- 터미널 ---
    function handleCommand(command) {
        if (!command) return;
        
        const commandLog = `<span style="color:var(--accent-hyean);">${dom.promptContext.textContent}></span> ${command}`;
        const entry = document.createElement('div');
        entry.innerHTML = commandLog;
        dom.terminalOutput.appendChild(entry);

        if (command !== commandHistory[0]) {
            commandHistory.unshift(command);
            if (commandHistory.length > 50) commandHistory.pop();
        }
        historyIndex = -1;

        const args = command.trim().split(' ');
        const cmd = args[0].toLowerCase();
        
        switch(cmd) {
            case 'help':
                const helpText = `
<pre>--- ARACHNE OS Command List ---

  help
    Displays this help message.

  scan <room_id>
    Analyzes a specific room and shows its details.
    Usage: scan entrance_hall

  find <search_term>
    Searches all gates in the Data Hub.
    Usage: find 남산

  clear
    Clears all output from the terminal screen.
</pre>`;
                dom.terminalOutput.innerHTML += helpText;
                break;
            case 'clear':
                dom.terminalOutput.innerHTML = '';
                break;
            case 'find':
                dom.modeHubBtn.click();
                dom.gateSearchInput.value = args.slice(1).join(' ');
                dom.gateSearchInput.dispatchEvent(new Event('input'));
                logToTerminal(`Searching for '${args.slice(1).join(' ')}' in Hub...`, 'CMD');
                break;
            case 'scan':
                if (args[1] && state.activeGateId && db.details.find(d => d.RoomID === args[1])) {
                    updateInspector({ view: 'room', id: args[1] });
                } else {
                    logToTerminal("Invalid room ID or no gate selected.", "ERROR");
                }
                break;
            default: logToTerminal(`Command not found: ${cmd}`, "ERROR");
        }
        dom.terminalOutput.scrollTop = dom.terminalOutput.scrollHeight;
    }
    
    // --- MAP FUNCTIONS ---
    function buildBlueprintData(gateId) {
        const rooms = db.rooms.filter(r => r.GID === gateId);
        const connectors = db.connectors.filter(c => c.GID === gateId).map(c => ({ from: c.FromID, to: c.ToID }));
        return { rooms, connectors };
    }

    function generate2DMap(blueprintData) {
        dom.blueprintSvg.innerHTML = '';
        const { rooms, connectors } = blueprintData;
        if(!rooms || rooms.length === 0) return;

        const gConnectors = document.createElementNS("http://www.w3.org/2000/svg", 'g');
        connectors.forEach(c => {
            const fromRoom = rooms.find(r => r.id === c.from);
            const toRoom = rooms.find(r => r.id === c.to);
            if (!fromRoom || !toRoom) return;
            
            const g = document.createElementNS("http://www.w3.org/2000/svg", 'g');
            g.dataset.fromFloor = fromRoom.floor;
            g.dataset.toFloor = toRoom.floor;

            const line = document.createElementNS("http://www.w3.org/2000/svg", 'line');
            line.setAttribute('class', 'connector');
            const fromCenter = { x: fromRoom.x + fromRoom.w / 2, y: fromRoom.y + fromRoom.h / 2 };
            const toCenter = { x: toRoom.x + toRoom.w / 2, y: toRoom.y + toRoom.h / 2 };
            line.setAttribute('x1', fromCenter.x); line.setAttribute('y1', fromCenter.y);
            line.setAttribute('x2', toCenter.x); line.setAttribute('y2', toCenter.y);
            g.appendChild(line);

            if (fromRoom.floor !== toRoom.floor) {
                const icon = document.createElementNS("http://www.w3.org/2000/svg", 'text');
                icon.setAttribute('class', 'floor-connector-icon');
                icon.setAttribute('x', (fromCenter.x + toCenter.x) / 2);
                icon.setAttribute('y', (fromCenter.y + toCenter.y) / 2 + 6);
                icon.textContent = '⇕';
                g.appendChild(icon);
            }
            gConnectors.appendChild(g);
        });
        dom.blueprintSvg.appendChild(gConnectors);

        const gRooms = document.createElementNS("http://www.w3.org/2000/svg", 'g');
        rooms.forEach(r => {
            const g = document.createElementNS("http://www.w3.org/2000/svg", 'g');
            g.dataset.floor = r.floor;
            g.addEventListener('click', () => updateInspector({ view: 'room', id: r.id }));
            
            const rect = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
            rect.id = `room-${r.id}`;
            const roomClass = r.IsStart ? 'room start-room' : 'room';
            rect.setAttribute('class', roomClass);
            rect.setAttribute('x', r.x); rect.setAttribute('y', r.y);
            rect.setAttribute('width', r.w); rect.setAttribute('height', r.h);
            
            const label = document.createElementNS("http://www.w3.org/2000/svg", 'text');
            label.setAttribute('class', 'room-label');
            label.setAttribute('x', r.x + r.w / 2); label.setAttribute('y', r.y + r.h / 2 + 5);
            label.textContent = r.name;
            g.appendChild(rect); g.appendChild(label);
            gRooms.appendChild(g);
        });
        dom.blueprintSvg.appendChild(gRooms);

        const bbox = dom.blueprintSvg.getBBox();
        const padding = 50;
        if (bbox.width > 0 && bbox.height > 0) {
            dom.blueprintSvg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding*2} ${bbox.height + padding*2}`);
        }
    }
    
    function generate3DMap(blueprintData) {
        if(!scene) return;
        while(scene.children.length > 2) { scene.remove(scene.children[2]); }
        roomObjects3D = [];
        activeRoom3D = null;
        const { rooms, connectors } = blueprintData;
        if (!rooms || rooms.length === 0) return;

        const roomMeshes = {};
        const scale = 10;
        rooms.forEach(r => {
            const geometry = new THREE.BoxGeometry(r.w/scale, 2, r.h/scale);
            const material = r.IsStart ? materialStart.clone() : materialDefault.clone();
            const roomMesh = new THREE.Mesh(geometry, material);
            roomMesh.position.set(r.x/scale + r.w/(2*scale), r.floor * 5, r.y/scale + r.h/(2*scale));
            roomMesh.userData = { id: r.id, floor: r.floor };
            scene.add(roomMesh);
            roomObjects3D.push(roomMesh);
            roomMeshes[r.id] = roomMesh;
        });

        connectors.forEach(c => {
            const fromMesh = roomMeshes[c.from];
            const toMesh = roomMeshes[c.to];
            if (!fromMesh || !toMesh) return;
            const lineMat = new THREE.LineBasicMaterial({ color: 0x7d8590, transparent: true, opacity: 0.7 });
            const lineGeo = new THREE.BufferGeometry().setFromPoints([fromMesh.position, toMesh.position]);
            scene.add(new THREE.Line(lineGeo, lineMat));
        });

        const box = new THREE.Box3().setFromObject(scene);
        const center = box.getCenter(new THREE.Vector3());
        controls.target.copy(center);
        camera.position.set(center.x, center.y + 100, center.z + 100);
        controls.update();
    }
    
    function generateFloorControls(blueprintData) {
        dom.floorControls.innerHTML = '';
        const floors = [...new Set((blueprintData.rooms || []).map(r => r.floor))].sort((a,b) => b-a);
        floors.forEach(floorNum => {
            const btn = document.createElement('button');
            btn.textContent = floorNum >= 1 ? `${floorNum}F` : `B${-floorNum+1}F`;
            btn.dataset.floor = floorNum;
            btn.addEventListener('click', () => filterFloor(floorNum));
            dom.floorControls.appendChild(btn);
        });
    }
    
    function filterFloor(floorNum, silent = false){
        if (!silent) { logToTerminal(`Switching map view to floor ${floorNum}`, 'MAP'); }
        currentMapFloor = floorNum;
        dom.blueprintSvg.querySelectorAll('[data-floor], [data-from-floor]').forEach(el => {
            const elFloor = parseInt(el.dataset.floor);
            const fromFloor = parseInt(el.dataset.fromFloor);
            const toFloor = parseInt(el.dataset.toFloor);
            let isVisible = false;
            if (!isNaN(elFloor)) { isVisible = elFloor === floorNum; }
            else if (!isNaN(fromFloor)) { isVisible = fromFloor === floorNum || toFloor === floorNum; }
            el.style.display = isVisible ? '' : 'none';
        });
        dom.floorControls.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.floor) === floorNum));
    }

    function activateMapView(mode, silent = false) {
        if (!silent) { logToTerminal(`Activating ${mode} view`, 'VIEW'); }
        if (mode === '2D') {
            dom.blueprintSvg.classList.add('active-map-view');
            dom.map3DCanvas.classList.remove('active-map-view');
            dom.view2DBtn.classList.add('active');
            dom.view3DBtn.classList.remove('active');
            dom.floorControls.style.display = 'flex';
            filterFloor(currentMapFloor, true);
        } else {
            dom.map3DCanvas.classList.add('active-map-view');
            dom.blueprintSvg.classList.remove('active-map-view');
            dom.view3DBtn.classList.add('active');
            dom.view2DBtn.classList.remove('active');
            dom.floorControls.style.display = 'none';
            onWindowResize3D();
        }
    }

    function selectRoom(roomId) {
        document.querySelectorAll('#blueprint-svg .room.active').forEach(r => r.classList.remove('active'));
        if(roomId) {
            const targetSvg = document.getElementById(`room-${roomId}`);
            if(targetSvg) targetSvg.classList.add('active');
        }

        roomObjects3D.forEach(mesh => {
            const roomData = db.rooms.find(r => r.id === mesh.userData.id);
            if (roomData && roomData.IsStart) { mesh.material = materialStart.clone(); }
            else { mesh.material = materialDefault.clone(); }
        });
        
        activeRoom3D = null;
        if(roomId) {
            const target3D = roomObjects3D.find(obj => obj.userData.id === roomId);
            if(target3D) { target3D.material = materialSelected.clone(); activeRoom3D = target3D; }
        }
    }
    
    function init3D() {
        scene = new THREE.Scene();
        raycaster = new THREE.Raycaster();
        pointer = new THREE.Vector2();
        camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
        renderer = new THREE.WebGLRenderer({ canvas: dom.map3DCanvas, antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 0);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(50, 100, 75);
        scene.add(dirLight);

        dom.map3DCanvas.addEventListener('click', (event) => {
            const rect = dom.map3DCanvas.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            const intersects = raycaster.intersectObjects(roomObjects3D);
            if (intersects.length > 0) {
                updateInspector({ view: 'room', id: intersects[0].object.userData.id });
            }
        });

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();
    }

    function onWindowResize3D(){
        const wrapper = dom.mapViewer;
        if(!wrapper || wrapper.clientWidth === 0) return;
        camera.aspect = wrapper.clientWidth / wrapper.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
    }
    
    function startThreatFeed() {
        const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const agentNames = (db.agents || []).map(a => a.name).filter(Boolean);
        if (agentNames.length === 0) agentNames.push("SYSTEM");

        function generate() {
            if (!db.gates || !db.gates.length) {
                 setTimeout(generate, 5000);
                 return;
            }

            const eventTypes = [
                { type: 'threat_detected', weight: 5 }, { type: 'gate_fluctuation', weight: 10 },
                { type: 'agent_report', weight: 8 }, { type: 'system_check', weight: 15 }
            ];
            
            const totalWeight = eventTypes.reduce((sum, t) => sum + t.weight, 0);
            let random = Math.random() * totalWeight;
            let eventType = 'system_check';
            for (const t of eventTypes) {
                if (random < t.weight) { eventType = t.type; break; }
                random -= t.weight;
            }
            
            let message = '';
            let cssClass = 'feed-system';

            switch(eventType) {
                case 'threat_detected':
                    if (db.monster && db.monster.length > 0) {
                        const randomThreat = db.monster[rand(0, db.monster.length - 1)];
                        const threatLocation = (db.elements || []).find(e => e.refId === randomThreat.ID);
                        if (threatLocation) {
                            const room = (db.rooms || []).find(r => r.id === threatLocation.RoomID);
                            if (room) {
                                const gate = db.gates.find(g => g.id === room.GID);
                                if (gate) {
                                    message = `[${gate.id}] Rank ${randomThreat.rank} signature detected.`;
                                    cssClass = 'feed-critical';
                                }
                            }
                        }
                    }
                    break;
                case 'gate_fluctuation':
                    const randomGate = db.gates[rand(0, db.gates.length-1)];
                    const fluctuation = (rand(1, 50) / 100).toFixed(2);
                    message = `[${randomGate.id}] Minor mana fluctuation detected: ±${fluctuation}%.`;
                    cssClass = 'feed-warning';
                    break;
                case 'agent_report':
                     const activeGates = db.gates.filter(g => g.isActive);
                     if (activeGates.length > 0) {
                        const randomActiveGate = activeGates[rand(0, activeGates.length-1)];
                        const randomAgent = agentNames[rand(0, agentNames.length-1)];
                        message = `[${randomActiveGate.id}] AGENT ${randomAgent} reports situation stable.`;
                        cssClass = 'feed-info';
                     }
                    break;
                case 'system_check':
                    message = 'Database integrity check complete. No anomalies found.';
                    cssClass = 'feed-system';
                    break;
            }

            if (!message) { 
                setTimeout(generate, 100);
                return;
            };

            const now = new Date();
            const timestamp = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
            
            const feedItem = document.createElement('div');
            feedItem.className = 'feed-item';
            feedItem.innerHTML = `<span class="feed-timestamp">${timestamp}</span> <span class="${cssClass}">${message}</span>`;
            dom.threatFeed.prepend(feedItem);
            if (dom.threatFeed.children.length > 30) {
                dom.threatFeed.lastChild.remove();
            }

            setTimeout(generate, rand(1500, 5000));
        }
        setTimeout(generate, 1000);
    }

    // --- 이벤트 핸들러 ---
    function setupEventListeners() {
        dom.sidebarToggleBtn.addEventListener('click', () => dom.sidebar.classList.toggle('collapsed'));
        
        dom.modeHubBtn.addEventListener('click', () => { state.sidebarMode = 'hub'; dom.modeHubBtn.classList.add('active'); dom.modeActiveBtn.classList.remove('active'); renderGateList(); });
        dom.modeActiveBtn.addEventListener('click', () => { state.sidebarMode = 'active'; dom.modeHubBtn.classList.remove('active'); dom.modeActiveBtn.classList.add('active'); renderGateList(); });

        dom.gateSearchInput.addEventListener('input', renderGateList);
        dom.gateListContent.addEventListener('click', e => {
            const gateItem = e.target.closest('.gate-item');
            if (gateItem) loadGate(gateItem.dataset.id);
        });
        
        dom.inspectorContent.addEventListener('click', e => {
            const backBtn = e.target.closest('.inspector-back-btn');
            if (backBtn) {
                updateInspector({ view: backBtn.dataset.view, id: backBtn.dataset.id });
                return;
            }
            
            const item = e.target.closest('.inspector-item');
            if (item) {
                if (e.target.closest('.details-analyze-btn')) {
                    e.preventDefault();
                    updateInspector({ view: item.dataset.type, id: item.dataset.id, parentId: item.dataset.parentId });
                } 
                else {
                     const currentlyOpen = dom.inspectorContent.querySelector('.inspector-item.open');
                    if (currentlyOpen && currentlyOpen !== item) {
                        currentlyOpen.classList.remove('open');
                    }
                    item.classList.toggle('open');
                }
            }
        });
        
        dom.terminalInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { handleCommand(dom.terminalInput.value); dom.terminalInput.value = ''; } 
            else if (e.key === 'ArrowUp') { e.preventDefault(); if (historyIndex < commandHistory.length - 1) { historyIndex++; dom.terminalInput.value = commandHistory[historyIndex]; } } 
            else if (e.key === 'ArrowDown') { e.preventDefault(); if (historyIndex > 0) { historyIndex--; dom.terminalInput.value = commandHistory[historyIndex]; } else { historyIndex = -1; dom.terminalInput.value = ''; } }
        });
        
        dom.view2DBtn.addEventListener('click', () => activateMapView('2D'));
        dom.view3DBtn.addEventListener('click', () => activateMapView('3D'));
    }

    // --- 초기화 ---
    async function initializeMainApp(agent) {
        dom.agentName.textContent = `AGENT: ${agent.name}`;
        await loadAllData();
        renderGateList();
        init3D();
        setupEventListeners();
        startThreatFeed();
        
        logToTerminal(`Welcome, Agent ${agent.name}. Type 'help' to see available commands.`, "AUTH");

        if (db.gates && db.gates.length > 0) {
            const activeGate = db.gates.find(g => g.isActive);
            loadGate(activeGate ? activeGate.id : db.gates[0].id);
        }
    }

    async function main() {
        document.body.classList.add('logged-out');
        try {
            const res = await fetch(`../database/agents.csv`);
            if (!res.ok) throw new Error(`Failed to fetch agents.csv`);
            db['agents'] = Papa.parse(await res.text(), { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
        } catch(e) {
            dom.loginErrorMessage.textContent = "FATAL: CANNOT LOAD AGENT PROFILES";
            return;
        }
        setupLogin();
    }

    main();
});