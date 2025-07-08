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
        const files = ['gates', 'rooms', 'connectors', 'details', 'monster', 'item', 'event', 'elements', 'agents'];
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
            state.currentUser = agent;
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
        logToTerminal(`Loading gate data: ${gate.name} [${gateId}]`, 'GATE');
        dom.gateInfoHeader.textContent = `${gate.name} [Rank ${gate.rank}]`;
        dom.promptContext.textContent = gateId;
        document.querySelectorAll('.gate-item').forEach(item => item.classList.toggle('active', item.dataset.id === gateId));

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
        activateMapView('2D', true);
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
                logToTerminal(`Inspecting room: ${roomDetail.RoomName}`, 'INSPECTOR');
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
                        logToTerminal(`Inspecting entity: ${monsterDetail.name}`, 'INSPECTOR');
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
                        logToTerminal(`Inspecting item: ${itemDetail.name}`, 'INSPECTOR');
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
                        logToTerminal(`Inspecting event: ${eventDetail.name}`, 'INSPECTOR');
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
        
        // [수정] 명령어 간소화
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
    
    // --- MAP FUNCTIONS (원본과 동일) ---
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
    
    function filterFloor(floorNum, silent = false){
        if (!silent) {
            logToTerminal(`Switching map view to floor ${floorNum}`, 'MAP');
        }
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
        if (!silent) {
            logToTerminal(`Activating ${mode} view`, 'VIEW');
        }
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
    
    // --- LIVE THREAT FEED (수정 완료) ---
    function startThreatFeed() {
        const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const agentNames = db.agents.map(a => a.name).filter(Boolean);

        function generate() {
            if (!db.gates || !db.gates.length) {
                 setTimeout(generate, 5000); // 데이터 로딩 전이면 5초 후 재시도
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
                    const randomThreat = db.monster[rand(0, db.monster.length - 1)];
                    const threatLocation = db.elements.find(e => e.refId === randomThreat.ID);
                    if (threatLocation) {
                        const gate = db.gates.find(g => g.id === db.rooms.find(r => r.id === threatLocation.RoomID)?.GID);
                        if (gate) {
                            message = `[${gate.id}] Rank ${randomThreat.rank} signature detected.`;
                            cssClass = 'feed-critical';
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

            if (!message) { // 메시지 생성 실패 시 재귀 호출로 바로 다음 생성 시도
                setTimeout(generate, 100);
                return;
            };

            const now = new Date();
            const timestamp = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
            
            const feedItem = document.createElement('div');
            feedItem.className = 'feed-item';
            // 클릭 관련 속성 및 이벤트 리스너 제거
            feedItem.innerHTML = `<span class="feed-timestamp">${timestamp}</span> <span class="${cssClass}">${message}</span>`;
            dom.threatFeed.prepend(feedItem);
            if (dom.threatFeed.children.length > 30) {
                dom.threatFeed.lastChild.remove();
            }

            setTimeout(generate, rand(1500, 5000));
        }
        setTimeout(generate, 1000); // 최초 실행
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
        
        dom.view2DBtn.addEventListener('click', () => activateMapView('2D'));
        dom.view3DBtn.addEventListener('click', () => activateMapView('3D'));
    }

    // --- 초기화 ---
    async function initializeMainApp(agent) {
        dom.agentName.textContent = `AGENT: ${agent.name}`;
        
        // 데이터 로딩이 끝난 후 앱 기능 초기화
        await loadAllData();

        renderGateList();
        init3D();
        setupEventListeners();
        startThreatFeed();
        
        // [수정] 로그인 시 터미널에 환영 메시지 및 help 안내 출력
        logToTerminal(`Welcome, Agent ${agent.name}. Type 'help' to see available commands.`, "AUTH");

        if (db.gates && db.gates.length > 0) {
            const activeGate = db.gates.find(g => g.isActive);
            loadGate(activeGate ? activeGate.id : db.gates[0].id);
        }
    }

    async function main() {
        document.body.classList.add('logged-out');
        // 로그인 전에 에이전트 정보만 먼저 로드합니다.
        try {
            const res = await fetch(`../database/agents.csv`);
            if (!res.ok) throw new Error(`Failed to load agents.csv`);
            const text = await res.text();
            db['agents'] = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
        } catch(e) {
            dom.loginErrorMessage.textContent = "FATAL ERROR: AGENT DB CONNECTION FAILED";
            return;
        }
        setupLogin();
    }

    main();
});