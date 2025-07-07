import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- 글로벌 DB 및 상태 ---
    let db = {};
    const state = {
        sidebarMode: 'active',
        activeGateId: null,
        inspectorState: { view: 'none' }, 
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

    // --- DOM 요소 캐싱 ---
    const dom = {
        // Login Elements
        loginScreen: document.getElementById('login-screen'),
        securityCodeInput: document.getElementById('security-code-input'),
        loginErrorMessage: document.getElementById('login-error-message'),
        agentName: document.getElementById('agent-name'),
        // Main App Elements
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

    // --- 데이터 로딩 ---
    async function loadAllData() {
        // agents.csv도 로드 목록에 추가
        const files = ['gates', 'rooms', 'connectors', 'details', 'monster', 'item', 'event', 'elements', 'agents'];
        try {
            await Promise.all(files.map(async (file) => {
                const res = await fetch(`../database/${file}.csv`);
                if (!res.ok) throw new Error(`Failed to load ${file}.csv}`);
                const text = await res.text();
                db[file] = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
            }));
        } catch (error) {
            logToTerminal(`FATAL ERROR: ${error.message}`);
            console.error(error);
        }
    }
    
    // --- 헬퍼 함수 ---
    function getElementIcon(type) {
        switch(type) {
            case 'boss': return { icon: 'fa-crown', colorClass: 'icon-boss' };
            case 'monster': return { icon: 'fa-skull-crossbones', colorClass: 'icon-threat' };
            case 'item': return { icon: 'fa-gem', colorClass: 'icon-item' };
            case 'trap':
            case 'event': return { icon: 'fa-bolt', colorClass: 'icon-anomaly' };
            default: return { icon: 'fa-question-circle', colorClass: 'icon-default' };
        }
    }

    // --- 로그인 관련 함수 ---
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

        const agent = db.agents.find(a => a.code === numericCode);

        if (agent) {
            dom.loginErrorMessage.textContent = "";
            dom.securityCodeInput.disabled = true;
            
            document.body.classList.remove('logged-out');
            document.body.classList.add('logged-in');

            setTimeout(() => {
                initializeMainApp(agent);
            }, 500);
            
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

        dom.gateListContent.innerHTML = '';
        gatesToShow.forEach(gate => {
            const item = document.createElement('div');
            item.className = 'gate-item';
            item.dataset.id = gate.id;
            
            if (gate.isActive) {
                item.classList.add('is-active-gate');
            }
            if (gate.id === state.activeGateId) {
                item.classList.add('active');
            }
            
            item.innerHTML = `<div class="gate-name">${gate.name}</div><div class="gate-details">Rank ${gate.rank} | ${gate.location}</div>`;
            dom.gateListContent.appendChild(item);
        });
    }

    // --- 게이트 선택 ---
    function loadGate(gateId) {
        if (state.activeGateId === gateId) return;
        state.activeGateId = gateId;

        const gate = db.gates.find(g => g.id === gateId);
        dom.gateInfoHeader.textContent = `${gate.name} [Rank ${gate.rank}]`;
        dom.promptContext.textContent = gateId;
        document.querySelectorAll('.gate-item').forEach(item => item.classList.toggle('active', item.dataset.id === gateId));

        currentBlueprintData = buildBlueprintData(gateId);
        if (!currentBlueprintData || currentBlueprintData.rooms.length === 0) {
            logToTerminal(`[ERROR] No blueprint data found for ${gate.name}.`);
            dom.blueprintSvg.innerHTML = '';
            if(scene) while(scene.children.length > 2) { scene.remove(scene.children[2]); }
            return;
        }
        
        generate2DMap(currentBlueprintData);
        generate3DMap(currentBlueprintData);
        generateFloorControls(currentBlueprintData);
        
        const initialFloors = [...new Set(currentBlueprintData.rooms.map(r => r.floor))].sort((a, b) => b - a);
        currentMapFloor = initialFloors.length > 0 ? initialFloors[0] : 1;
        
        filterFloor(currentMapFloor);
        activateMapView('2D');
        selectRoom(null);
        onWindowResize3D();
        updateInspector({ view: 'none' });
    }

    // --- 인스펙터 관리 ---
    function updateInspector(newState) {
        state.inspectorState = newState;
        const { view, id, parentId } = state.inspectorState;

        let html = '';
        if (view === 'none') {
            html = `<div class="placeholder">Select a gate from the list, or a room on the map.</div>`;
        } else if (view === 'room') {
            const roomDetail = db.details.find(d => d.RoomID === id);
            if(roomDetail) {
                html += `<div class="inspector-header"><h4>${roomDetail.RoomName}</h4><span class="subtitle">${roomDetail.type}</span></div>`;
                html += `<p>${roomDetail.dec}</p>`;
                
                const elementsInRoom = (db.elements || []).filter(e => e.RoomID === id);
                if(elementsInRoom.length > 0) {
                    html += `<hr style="margin: 15px 0;"><div class="info-section"><h5>Contained Elements</h5>`;
                    elementsInRoom.forEach(el => {
                        const { icon, colorClass } = getElementIcon(el.type);
                        html += `<div class="inspector-item" data-type="${el.type}" data-id="${el.refId}" data-parent-id="${id}">
                                    <i class="fas ${icon} ${colorClass}"></i>
                                    <span>${el.desc}</span>
                                 </div>`;
                    });
                    html += `</div>`;
                }
            } else {
                 html = `<div class="placeholder">Details for room ${id} not found.</div>`;
            }
        } else if (['monster', 'boss', 'item', 'trap', 'event'].includes(view)) {
            const backButton = `<button class="inspector-back-btn" data-view="room" data-id="${parentId}"><i class="fas fa-arrow-left"></i> Back to Room</button>`;
            const parentRoom = db.details.find(d => d.RoomID === parentId);
            const fromSubtitle = `<span class="subtitle">From: ${parentRoom ? parentRoom.RoomName : parentId}</span>`;
            
            html += backButton;
            let detailHtml = '';

            switch(view) {
                case 'monster':
                case 'boss': {
                    const monsterDetail = db.monster.find(m => m.ID === id);
                    const elementInstance = db.elements.find(el => el.RoomID === parentId && el.refId === id);
                    if (monsterDetail) {
                        detailHtml += `<div class="inspector-header"><h4>${monsterDetail.name}</h4>${fromSubtitle}</div>`;
                        detailHtml += `<ul>`;
                        const rankClass = `rank-${String(monsterDetail.rank).toLowerCase()}`;
                        detailHtml += `<li><strong>Rank:</strong> <span class="rank-tag ${rankClass}">${monsterDetail.rank}</span></li>`;
                        if (elementInstance && elementInstance.quantity > 1) {
                             detailHtml += `<li><strong>Quantity:</strong> ${elementInstance.quantity}</li>`;
                        }
                        detailHtml += `</ul>`;
                    }
                    break;
                }
                case 'item': {
                    const itemDetail = db.item.find(i => i.ID === id);
                    if (itemDetail) {
                        detailHtml += `<div class="inspector-header"><h4>${itemDetail.name}</h4>${fromSubtitle}</div>`;
                        detailHtml += `<ul>`;
                        for(const [key, value] of Object.entries(itemDetail)) {
                            if (['index', 'ID', 'name'].includes(key) || !value) continue;
                            if (key === 'rank') {
                                const rankClass = `rank-${String(value).toLowerCase()}`;
                                detailHtml += `<li><strong>Rank:</strong> <span class="rank-tag ${rankClass}">${value}</span></li>`;
                            } else {
                                detailHtml += `<li><strong>${key}:</strong> ${value}</li>`;
                            }
                        }
                        detailHtml += `</ul>`;
                    }
                    break;
                }
                case 'trap':
                case 'event': {
                    const eventDetail = db.event.find(e => e.ID === id);
                     if (eventDetail) {
                        detailHtml += `<div class="inspector-header"><h4>${eventDetail.name}</h4>${fromSubtitle}</div>`;
                        detailHtml += `<ul>`;
                        for(const [key, value] of Object.entries(eventDetail)) {
                            if (['index', 'ID', 'name'].includes(key) || !value) continue;
                            detailHtml += `<li><strong>${key}:</strong> ${value}</li>`;
                        }
                        detailHtml += `</ul>`;
                    }
                    break;
                }
            }

            if (detailHtml) {
                html += detailHtml;
            } else {
                html += `<div class="placeholder">Details for element ${id} not found.</div>`;
            }
        }
        dom.inspectorContent.innerHTML = html;
        selectRoom(view === 'room' ? id : parentId); 
    }

    // --- 최단 경로 탐색 (BFS) ---
    function findShortestPath(startId, endId) {
        if (!state.activeGateId) return null;
        const rooms = db.rooms.filter(r => r.GID === state.activeGateId);
        const connectors = db.connectors.filter(c => c.GID === state.activeGateId);

        const adj = {};
        rooms.forEach(r => adj[r.id] = []);
        connectors.forEach(c => {
            adj[c.FromID].push(c.ToID);
            adj[c.ToID].push(c.FromID);
        });

        const queue = [[startId]];
        const visited = new Set([startId]);

        while (queue.length > 0) {
            const path = queue.shift();
            const node = path[path.length - 1];
            if (node === endId) return path;
            for (const neighbor of (adj[node] || [])) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    const newPath = [...path, neighbor];
                    queue.push(newPath);
                }
            }
        }
        return null;
    }
    
    // --- 경로 하이라이트 ---
    function highlightPath(path) {
        dom.blueprintSvg.querySelectorAll('.path-highlight').forEach(el => el.classList.remove('path-highlight'));
        if (!path) return;
        
        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            const line1 = dom.blueprintSvg.querySelector(`.connector[data-from="${from}"][data-to="${to}"]`);
            const line2 = dom.blueprintSvg.querySelector(`.connector[data-from="${to}"][data-to="${from}"]`);
            if (line1) line1.classList.add('path-highlight');
            if (line2) line2.classList.add('path-highlight');
        }
    }

    // --- 터미널 ---
    function logToTerminal(message) {
        dom.terminalOutput.innerHTML += `${message}\n`;
        dom.terminalOutput.scrollTop = dom.terminalOutput.scrollHeight;
    }

    function handleCommand(command) {
        if (!command) return;
        
        logToTerminal(`<span style="color:var(--accent-hyean);">${dom.promptContext.textContent}></span> ${command}`);
        
        if (command !== commandHistory[0]) {
            commandHistory.unshift(command);
            if (commandHistory.length > 50) {
                commandHistory.pop();
            }
        }
        historyIndex = -1;

        const args = command.trim().split(' ');
        const cmd = args[0].toLowerCase();
        
        switch(cmd) {
            case 'help':
                const helpText = `
--- ARACHNE OS Command List ---

  help
    Displays this help message.

  scan <room_id>
    Analyzes a specific room and shows its details in the inspector.
    Usage: scan entrance_hall

  path <from_room_id> <to_room_id>
    Finds and displays the shortest path between two rooms on the map.
    Usage: path entrance_hall boss_chamber

  clear
    Clears all output from the terminal screen.
  
  find <search_term>
    Searches all gates in the Data Hub (switches to Hub mode).
    Usage: find 남산
`;
                logToTerminal(helpText);
                break;
            case 'clear':
                dom.terminalOutput.innerHTML = '';
                break;
            case 'find':
                dom.modeHubBtn.click();
                dom.gateSearchInput.value = args.slice(1).join(' ');
                dom.gateSearchInput.dispatchEvent(new Event('input'));
                break;
            case 'scan':
                if (args[1] && state.activeGateId && db.details.find(d => d.RoomID === args[1])) {
                    updateInspector({ view: 'room', id: args[1] });
                } else {
                    logToTerminal("Error: Invalid room ID or no gate selected.");
                }
                break;
            case 'path':
                if (args.length < 3) {
                    logToTerminal("Usage: path <from_room_id> <to_room_id>");
                    break;
                }
                const path = findShortestPath(args[1], args[2]);
                if (path) {
                    highlightPath(path);
                    logToTerminal(`[SUCCESS] Path found: ${path.join(' -> ')}`);
                } else {
                    highlightPath(null);
                    logToTerminal(`[ERROR] No path found between ${args[1]} and ${args[2]}.`);
                }
                break;
            default: logToTerminal(`[ERROR] Command not found: ${cmd}`);
        }
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
            line.dataset.from = fromRoom.id;
            line.dataset.to = toRoom.id;
            const fromCenter = { x: fromRoom.x + fromRoom.w / 2, y: fromRoom.y + fromRoom.h / 2 };
            const toCenter = { x: toRoom.x + toRoom.w / 2, y: toRoom.y + toRoom.h / 2 };
            line.setAttribute('x1', fromCenter.x);
            line.setAttribute('y1', fromCenter.y);
            line.setAttribute('x2', toCenter.x);
            line.setAttribute('y2', toCenter.y);
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
            rect.setAttribute('class', 'room');
            rect.setAttribute('x', r.x);
            rect.setAttribute('y', r.y);
            rect.setAttribute('width', r.w);
            rect.setAttribute('height', r.h);
            
            const label = document.createElementNS("http://www.w3.org/2000/svg", 'text');
            label.setAttribute('class', 'room-label');
            label.setAttribute('x', r.x + r.w / 2);
            label.setAttribute('y', r.y + r.h / 2 + 5);
            label.textContent = r.name;
            g.appendChild(rect);
            g.appendChild(label);
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
            const roomMesh = new THREE.Mesh(geometry, materialDefault.clone());
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
    
    function filterFloor(floorNum){
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
        highlightPath(null);
    }

    function activateMapView(mode) {
        if (mode === '2D') {
            dom.blueprintSvg.classList.add('active-map-view');
            dom.map3DCanvas.classList.remove('active-map-view');
            dom.view2DBtn.classList.add('active');
            dom.view3DBtn.classList.remove('active');
            dom.floorControls.style.display = 'flex';
            filterFloor(currentMapFloor);
        } else {
            dom.map3DCanvas.classList.add('active-map-view');
            dom.blueprintSvg.classList.remove('active-map-view');
            dom.view3DBtn.classList.add('active');
            dom.view2DBtn.classList.remove('active');
            dom.floorControls.style.display = 'none';
            onWindowResize3D();
        }
        highlightPath(null);
    }

    function selectRoom(roomId) {
        document.querySelectorAll('#blueprint-svg .room.active').forEach(r => r.classList.remove('active'));
        if(roomId) {
            const targetSvg = document.getElementById(`room-${roomId}`);
            if(targetSvg) targetSvg.classList.add('active');
        }

        if(activeRoom3D) activeRoom3D.material = materialDefault.clone();
        activeRoom3D = null;
        if(roomId) {
            const target3D = roomObjects3D.find(obj => obj.userData.id === roomId);
            if(target3D) {
                target3D.material = materialSelected.clone();
                activeRoom3D = target3D;
            }
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
    
    // --- LIVE THREAT FEED (기능 개선) ---
    function startThreatFeed() {
        const agentNames = ["Echo-4", "Nova Prime", "Hex-Viper"];

        setInterval(() => {
            if (!db.gates || !db.gates.length) return;

            const eventTypes = ['threat_detected', 'gate_fluctuation', 'agent_report', 'system_check'];
            const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            
            let message = '';
            let gateId = null;
            let cssClass = 'feed-system';

            switch(eventType) {
                case 'threat_detected':
                    const randomThreat = db.monster[Math.floor(Math.random() * db.monster.length)];
                    const threatLocation = db.elements.find(e => e.refId === randomThreat.ID);
                    if (threatLocation) {
                        const gate = db.gates.find(g => g.id === db.rooms.find(r => r.id === threatLocation.RoomID)?.GID);
                        if (gate) {
                            gateId = gate.id;
                            message = `Rank ${randomThreat.rank} signature detected in ${gate.name}.`;
                            cssClass = 'feed-critical';
                        }
                    }
                    break;
                case 'gate_fluctuation':
                    const randomGate = db.gates[Math.floor(Math.random() * db.gates.length)];
                    gateId = randomGate.id;
                    message = `Minor mana fluctuation in ${randomGate.name}.`;
                    cssClass = 'feed-warning';
                    break;
                case 'agent_report':
                     const activeGates = db.gates.filter(g => g.isActive);
                     if (activeGates.length > 0) {
                        const randomActiveGate = activeGates[Math.floor(Math.random() * activeGates.length)];
                        const randomAgent = agentNames[Math.floor(Math.random() * agentNames.length)];
                        gateId = randomActiveGate.id;
                        message = `AGENT ${randomAgent} reports situation stable at ${randomActiveGate.name}.`;
                        cssClass = 'feed-info';
                     }
                    break;
                case 'system_check':
                    message = 'Database integrity check complete. No anomalies found.';
                    cssClass = 'feed-system';
                    break;
            }

            if (!message) return;

            const now = new Date();
            const timestamp = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
            
            const feedItem = document.createElement('div');
            feedItem.className = 'feed-item';
            if (gateId) {
                feedItem.dataset.gateId = gateId;
            }

            feedItem.innerHTML = `<span class="feed-timestamp">${timestamp}</span> <span class="${cssClass}">${message}</span>`;
            dom.threatFeed.prepend(feedItem);
            if (dom.threatFeed.children.length > 30) {
                dom.threatFeed.lastChild.remove();
            }

        }, 4500);
    }

    // --- 이벤트 핸들러 ---
    function setupEventListeners() {
        dom.sidebarToggleBtn.addEventListener('click', () => dom.sidebar.classList.toggle('collapsed'));
        
        dom.modeHubBtn.addEventListener('click', () => {
            state.sidebarMode = 'hub';
            dom.modeHubBtn.classList.add('active');
            dom.modeActiveBtn.classList.remove('active');
            renderGateList();
        });
        dom.modeActiveBtn.addEventListener('click', () => {
            state.sidebarMode = 'active';
            dom.modeHubBtn.classList.remove('active');
            dom.modeActiveBtn.classList.add('active');
            renderGateList();
        });

        dom.gateSearchInput.addEventListener('input', renderGateList);
        dom.gateListContent.addEventListener('click', e => {
            const gateItem = e.target.closest('.gate-item');
            if (gateItem) loadGate(gateItem.dataset.id);
        });
        
        dom.inspectorContent.addEventListener('click', e => {
            const item = e.target.closest('.inspector-item');
            const backBtn = e.target.closest('.inspector-back-btn');
            if (item) {
                updateInspector({ view: item.dataset.type, id: item.dataset.id, parentId: item.dataset.parentId });
            } else if (backBtn) {
                updateInspector({ view: backBtn.dataset.view, id: backBtn.dataset.id });
            }
        });
        
        dom.terminalInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                handleCommand(dom.terminalInput.value);
                dom.terminalInput.value = '';
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    dom.terminalInput.value = commandHistory[historyIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (historyIndex > 0) {
                    historyIndex--;
                    dom.terminalInput.value = commandHistory[historyIndex];
                } else {
                    historyIndex = -1;
                    dom.terminalInput.value = '';
                }
            }
        });

        dom.threatFeed.addEventListener('click', e => {
            const feedItem = e.target.closest('.feed-item');
            if (feedItem && feedItem.dataset.gateId) {
                loadGate(feedItem.dataset.gateId);
            }
        });
        
        dom.view2DBtn.addEventListener('click', () => activateMapView('2D'));
        dom.view3DBtn.addEventListener('click', () => activateMapView('3D'));
    }

    // --- 초기화 ---
    async function initializeMainApp(agent) {
        dom.agentName.textContent = `AGENT: ${agent.name}`;
        
        renderGateList();
        init3D();
        setupEventListeners();
        startThreatFeed();
        logToTerminal(`ARACHNE OPS v3.0 [SECURE ACCESS] Initialized. Welcome, Agent ${agent.name}.`);
    }

    async function main() {
        document.body.classList.add('logged-out');
        await loadAllData();
        setupLogin();
    }

    main();
});