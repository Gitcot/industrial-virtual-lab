import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ==========================================
// 🎵 MOTEUR AUDIO 
// ==========================================
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
let motorOsc: OscillatorNode | null = null;
let motorGain: GainNode | null = null;
let isAudioEnabled = false;

function initAudio() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  isAudioEnabled = true;
}

function playClickSound() {
  if (!isAudioEnabled) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}

function playContactorClack() {
  if (!isAudioEnabled) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.type = 'square'; osc.frequency.setValueAtTime(100, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
  osc.start(); osc.stop(audioCtx.currentTime + 0.15);
}

function setMotorSound(running: boolean, isStar: boolean = false) {
  if (!isAudioEnabled) return;
  if (running && !motorOsc) {
    motorOsc = audioCtx.createOscillator();
    motorGain = audioCtx.createGain();
    motorOsc.connect(motorGain); motorGain.connect(audioCtx.destination);
    motorOsc.type = 'triangle';
    const initialFreq = isStar ? 35 : 50;
    motorOsc.frequency.setValueAtTime(initialFreq, audioCtx.currentTime);
    motorGain.gain.setValueAtTime(0, audioCtx.currentTime);
    motorGain.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.5);
    motorOsc.start();
  } else if (!running && motorOsc && motorGain) {
    motorGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
    motorOsc.stop(audioCtx.currentTime + 0.5);
    motorOsc = null; motorGain = null;
  }
}

function updateMotorPitch(isStar: boolean) {
  if (!isAudioEnabled || !motorOsc) return;
  const targetFreq = isStar ? 35 : 50;
  motorOsc.frequency.linearRampToValueAtTime(targetFreq, audioCtx.currentTime + 0.2);
}

function playFaultSound() {
  if (!isAudioEnabled) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.type = 'square'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
  osc.start(); osc.stop(audioCtx.currentTime + 0.5);
}

window.addEventListener('pointerdown', initAudio, { once: true });

// ==========================================
// 1. SCÈNE & RENDU
// ==========================================
const container = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d24);

const gridHelper = new THREE.GridHelper(300, 60, 0x00d2ff, 0x333b4d);
scene.add(gridHelper);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 120, 180);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.05;

const ambientLight = new THREE.AmbientLight(0xffffff, 2.0); scene.add(ambientLight);
const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.5); dirLight1.position.set(80, 150, 100); scene.add(dirLight1);

// ==========================================
// 2. ÉTATS GLOBAUX & MATÉRIAUX
// ==========================================
let simMode = 'direct';
let isCoverOpen = false;
let isBypassActive = false; // <-- BYPASS SÉCURITÉ
let currentCoupling = 'star';
let isMotorRunning = false, isFaultActive = false;
let isKm1 = false, isKm2 = false, isKm3 = false;

let currentRotorSpeed = 0;
let targetRotorSpeed = 0;

// Variables du Multimètre
let probeRedMesh: THREE.Mesh;
let probeBlackMesh: THREE.Mesh;
let activeProbe: 'red' | 'black' | null = null;
let nodeRed: string | null = null;
let nodeBlack: string | null = null;

let panelLedOrangeMat: THREE.MeshStandardMaterial, panelLedBlueMat: THREE.MeshStandardMaterial;
let km1LedMat: THREE.MeshStandardMaterial | null = null;
let km2LedMat: THREE.MeshStandardMaterial | null = null;
let km3LedMat: THREE.MeshStandardMaterial | null = null;

let coverGroup: THREE.Group, starStrap: THREE.Mesh, deltaStraps: THREE.Group;
const interactiveButtons: THREE.Mesh[] = [];

// --- COFFRET DE COMMANDE DYNAMIQUE 3D ---
const cabinetGroup = new THREE.Group();
cabinetGroup.position.set(0, 65, -70);
scene.add(cabinetGroup);

function buildCabinet(mode: string) {
  while (cabinetGroup.children.length > 0) cabinetGroup.remove(cabinetGroup.children[0]);

  const createContactor = (x: number) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    c.position.set(x, 0, 4);
    cabinetGroup.add(c);

    const ledMat = new THREE.MeshStandardMaterial({ color: 0x004400, emissive: 0x000000 });
    const led = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 1), ledMat);
    led.position.set(x, 2, 8.5);
    cabinetGroup.add(led);
    return ledMat;
  };

  if (mode === 'direct') {
    const board = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 4), new THREE.MeshStandardMaterial({ color: 0x555555 }));
    cabinetGroup.add(board);
    km1LedMat = createContactor(0);
    km2LedMat = null; km3LedMat = null;
  } else {
    const board = new THREE.Mesh(new THREE.BoxGeometry(45, 20, 4), new THREE.MeshStandardMaterial({ color: 0x555555 }));
    cabinetGroup.add(board);
    km1LedMat = createContactor(-15);
    km2LedMat = createContactor(0);
    km3LedMat = createContactor(15);
  }
}
buildCabinet(simMode);

// --- BOÎTIER LEDS 3D ---
function createIndicatorPanel() {
  const panelGroup = new THREE.Group(); panelGroup.position.set(-70, 20, 0);
  const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(22, 55, 18), new THREE.MeshStandardMaterial({ color: 0x2c3e50 }));
  panelGroup.add(baseMesh);

  const ledGeo = new THREE.CylinderGeometry(5, 5, 5, 24);
  const matGreen = new THREE.MeshStandardMaterial({ color: 0x004400, emissive: 0x000000 });
  const ledGreen = new THREE.Mesh(ledGeo, matGreen); ledGreen.position.set(0, 16, 10); ledGreen.rotation.x = Math.PI / 2; panelGroup.add(ledGreen);

  const matRed = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0x000000 });
  const ledRed = new THREE.Mesh(ledGeo, matRed); ledRed.position.set(0, 0, 10); ledRed.rotation.x = Math.PI / 2; panelGroup.add(ledRed);

  const matOrange = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0x000000 });
  const ledOrange = new THREE.Mesh(ledGeo, matOrange); ledOrange.position.set(0, -16, 10); ledOrange.rotation.x = Math.PI / 2; panelGroup.add(ledOrange);

  scene.add(panelGroup); return { matGreen, matRed, matOrange };
}
const leds = createIndicatorPanel();

// --- PUPITRE DE COMMANDE 3D ---
function create3DPushButtons() {
  const panelGroup = new THREE.Group(); panelGroup.position.set(60, 12, 20);
  const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(70, 20, 35), new THREE.MeshStandardMaterial({ color: 0x34495e }));
  panelGroup.add(baseMesh);

  const btnGeo = new THREE.CylinderGeometry(5, 5, 8, 32);
  const createBtn = (color: number, x: number, id: string, type: string) => {
    const btn = new THREE.Mesh(btnGeo, new THREE.MeshStandardMaterial({ color }));
    btn.position.set(x, 11, 0); btn.userData = { id, type, initialY: 11 };
    panelGroup.add(btn); interactiveButtons.push(btn);
  };
  createBtn(0x27ae60, -24, 'btn_start', 'pulse');
  createBtn(0xc0392b, -8, 'btn_stop', 'pulse');

  const ledGeo = new THREE.CylinderGeometry(4, 4, 3, 32);
  panelLedOrangeMat = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0x000000 });
  const ledOrangePanel = new THREE.Mesh(ledGeo, panelLedOrangeMat); ledOrangePanel.position.set(8, 11.5, 0); panelGroup.add(ledOrangePanel);

  panelLedBlueMat = new THREE.MeshStandardMaterial({ color: 0x001144, emissive: 0x000000 });
  const ledBluePanel = new THREE.Mesh(ledGeo, panelLedBlueMat); ledBluePanel.position.set(24, 11.5, 0); panelGroup.add(ledBluePanel);

  scene.add(panelGroup);
}
create3DPushButtons();

// --- BOÎTE À BORNES MOTEUR & POINTES DE MULTIMÈTRE ---
function createTerminalBox() {
  const boxGroup = new THREE.Group(); boxGroup.position.set(0, 32, -15);
  boxGroup.add(new THREE.Mesh(new THREE.BoxGeometry(32, 18, 28), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 })));

  const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 22), new THREE.MeshStandardMaterial({ color: 0xdedede }));
  plateMesh.position.y = 8; boxGroup.add(plateMesh);

  const studGeo = new THREE.CylinderGeometry(2, 2, 6, 16);
  const studMat = new THREE.MeshStandardMaterial({ color: 0xf39c12, metalness: 0.9, roughness: 0.2 });
  const positions = [
    { name: "W2", pos: [-8, 12, -6] }, { name: "U2", pos: [0, 12, -6] }, { name: "V2", pos: [8, 12, -6] },
    { name: "U1", pos: [-8, 12, 6] }, { name: "V1", pos: [0, 12, 6] }, { name: "W1", pos: [8, 12, 6] }
  ];
  positions.forEach(p => {
    const stud = new THREE.Mesh(studGeo, studMat);
    stud.position.set(p.pos[0], p.pos[1], p.pos[2]);
    stud.userData = { id: p.name, type: 'terminal', net: p.name };
    boxGroup.add(stud);
    interactiveButtons.push(stud);
  });

  const strapMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.1 });
  starStrap = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 3), strapMat); starStrap.position.set(0, 13.5, -6); boxGroup.add(starStrap);

  deltaStraps = new THREE.Group();
  [-8, 0, 8].forEach(x => {
    const ds = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 15), strapMat);
    ds.position.set(x, 13.5, 0); deltaStraps.add(ds);
  });
  deltaStraps.visible = false; boxGroup.add(deltaStraps);

  coverGroup = new THREE.Group(); coverGroup.position.set(0, 9, -14);
  const coverMesh = new THREE.Mesh(new THREE.BoxGeometry(32, 2, 28), new THREE.MeshPhysicalMaterial({ color: 0xdddddd, transmission: 0.9, transparent: true, side: THREE.DoubleSide }));
  coverMesh.position.set(0, 1, 14); coverMesh.userData = { id: 'cover', type: 'cover' };
  coverGroup.add(coverMesh); boxGroup.add(coverGroup); interactiveButtons.push(coverMesh);

  const probeGeo = new THREE.ConeGeometry(1.5, 12, 16);
  probeGeo.rotateX(Math.PI);
  probeGeo.translate(0, 6, 0);

  probeRedMesh = new THREE.Mesh(probeGeo, new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3 }));
  probeRedMesh.visible = false; boxGroup.add(probeRedMesh);

  probeBlackMesh = new THREE.Mesh(probeGeo, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }));
  probeBlackMesh.visible = false; boxGroup.add(probeBlackMesh);

  scene.add(boxGroup);
}
createTerminalBox();

// --- 7. CÂBLAGE INDUSTRIEL ---
interface Wire3D { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; netName: string; activeColor: number; defaultColor: number; }
const wires: Wire3D[] = [];

function buildIndustrialCable(points: THREE.Vector3[], defaultColor: number, activeColor: number, netName: string, radius = 1.4): Wire3D {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, 48, radius, 12, false);
  const material = new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.4 });
  const mesh = new THREE.Mesh(tubeGeo, material);
  scene.add(mesh);
  return { mesh, material, netName, activeColor, defaultColor };
}

wires.push(buildIndustrialCable([new THREE.Vector3(-10, 55, -65), new THREE.Vector3(-20, 45, -30), new THREE.Vector3(-8, 44, -9)], 0x5c3a21, 0xff5500, "L1_PHASE"));
wires.push(buildIndustrialCable([new THREE.Vector3(-5, 55, -65), new THREE.Vector3(-10, 45, -30), new THREE.Vector3(0, 44, -9)], 0x111111, 0x00d2ff, "L2_PHASE"));
wires.push(buildIndustrialCable([new THREE.Vector3(0, 55, -65), new THREE.Vector3(0, 45, -30), new THREE.Vector3(8, 44, -9)], 0x7f8c8d, 0xffff00, "L3_PHASE"));
wires.push(buildIndustrialCable([new THREE.Vector3(5, 55, -65), new THREE.Vector3(15, 30, -35), new THREE.Vector3(0, 15, -25)], 0x27ae60, 0x2ecc71, "PE_GROUND", 1.8));

wires.push(buildIndustrialCable([new THREE.Vector3(15, 55, -65), new THREE.Vector3(30, 20, -30), new THREE.Vector3(55, 10, 15)], 0x555555, 0x555555, "CONTROL", 2.2));

// --- 8. CHARGEMENT MOTEUR 3D ---
const loader = new GLTFLoader();
const motorGroup = new THREE.Group(); scene.add(motorGroup);
let rotorMesh: THREE.Object3D | null = null;
loader.load('/assets/MOTOR_STATOR.glb', (gltf) => motorGroup.add(gltf.scene));
loader.load('/assets/MOTOR_ROTOR.glb', (gltf) => { rotorMesh = gltf.scene; motorGroup.add(rotorMesh); });

// ==========================================
// 3. LOGIQUE UI / MODE AUTO & MULTIMÈTRE
// ==========================================
const statusText = document.getElementById('status')!;
const btnCover = document.getElementById('btn-cover') as HTMLButtonElement;
const btnStar = document.getElementById('btn-star') as HTMLButtonElement;
const btnDelta = document.getElementById('btn-delta') as HTMLButtonElement;
const btnModeDirect = document.getElementById('btn-mode-direct') as HTMLButtonElement;
const btnModeSD = document.getElementById('btn-mode-sd') as HTMLButtonElement;

// Bypass sécurité
const chkBypass = document.getElementById('chk-bypass') as HTMLInputElement;
if (chkBypass) {
  chkBypass.addEventListener('change', (e) => {
    isBypassActive = (e.target as HTMLInputElement).checked;
    playClickSound();
  });
}

// Logique Multimètre UI
const displayMultimeter = document.getElementById('multimeter-display')!;
const btnProbeRed = document.getElementById('btn-probe-red')!;
const btnProbeBlack = document.getElementById('btn-probe-black')!;
const instrProbe = document.getElementById('probe-instruction')!;

if (btnProbeRed) btnProbeRed.addEventListener('click', () => { activeProbe = 'red'; playClickSound(); instrProbe.innerText = "🔴 Sonde Rouge active : Cliquez sur une borne"; });
if (btnProbeBlack) btnProbeBlack.addEventListener('click', () => { activeProbe = 'black'; playClickSound(); instrProbe.innerText = "⚫ Sonde Noire active : Cliquez sur une borne"; });

function updateMultimeter() {
  if (!displayMultimeter) return;
  if (!nodeRed || !nodeBlack) {
    displayMultimeter.innerText = "--- V"; return;
  }
  if (nodeRed === nodeBlack) {
    displayMultimeter.innerText = "0.00 V"; return;
  }
  
  // On autorise TOUTES les bornes de la plaque (haut et bas)
  const validNodes = ['U1', 'V1', 'W1', 'U2', 'V2', 'W2'];
  
  if (isKm1) {
    const isPhaseRed = validNodes.includes(nodeRed);
    const isPhaseBlack = validNodes.includes(nodeBlack);
    
    if (isPhaseRed && isPhaseBlack) {
      // Effet Multimètre Réaliste : Fluctuation de la tension de +/- 1.5V
      const fluctuation = (Math.random() * 3 - 1.5);
      displayMultimeter.innerText = (400.0 + fluctuation).toFixed(1) + " V";
      
      // On met le texte en rouge fluo pour indiquer la présence de tension !
      displayMultimeter.style.color = "#ff3333"; 
      displayMultimeter.style.textShadow = "0 0 5px #ff0000";
    } else {
      displayMultimeter.innerText = "0.00 V";
      displayMultimeter.style.color = "#111";
      displayMultimeter.style.textShadow = "none";
    }
  } else {
    displayMultimeter.innerText = "0.00 V";
    displayMultimeter.style.color = "#111";
    displayMultimeter.style.textShadow = "none";
  }
}

function switchMode(newMode: string) {
  playClickSound(); simMode = newMode;
  if (simMode === 'direct') {
    btnModeDirect.style.background = '#8e44ad'; btnModeSD.style.background = '#7f8c8d';
  } else {
    btnModeDirect.style.background = '#7f8c8d'; btnModeSD.style.background = '#8e44ad';
  }
  buildCabinet(simMode);
  ws.send(JSON.stringify({ action: "change_mode", target: simMode }));
  updateCouplingUI();
}

if (btnModeDirect) btnModeDirect.addEventListener('click', () => switchMode('direct'));
if (btnModeSD) btnModeSD.addEventListener('click', () => switchMode('star_delta'));

function updateCouplingUI() {
  if (btnCover) btnCover.innerText = isCoverOpen ? "FERMER COUVERCLE" : "OUVRIR COUVERCLE";

  if (simMode === 'star_delta') {
    if (btnStar) { btnStar.disabled = true; btnStar.style.background = '#333'; btnStar.innerText = "AUTO (KM2)"; }
    if (btnDelta) { btnDelta.disabled = true; btnDelta.style.background = '#333'; btnDelta.innerText = "AUTO (KM3)"; }
    starStrap.visible = false; deltaStraps.visible = false;
  } else {
    if (btnStar) btnStar.innerText = "ÉTOILE (Y)";
    if (btnDelta) btnDelta.innerText = "TRIANGLE (Δ)";

    const canEdit = isCoverOpen && !isMotorRunning && !isKm1;
    if (canEdit) {
      if (btnStar) { btnStar.disabled = false; btnStar.style.background = currentCoupling === 'star' ? '#d35400' : '#2980b9'; }
      if (btnDelta) { btnDelta.disabled = false; btnDelta.style.background = currentCoupling === 'delta' ? '#d35400' : '#2980b9'; }
    } else {
      if (btnStar) { btnStar.disabled = true; btnStar.style.background = '#7f8c8d'; }
      if (btnDelta) { btnDelta.disabled = true; btnDelta.style.background = '#7f8c8d'; }
    }
    starStrap.visible = (currentCoupling === 'star');
    deltaStraps.visible = (currentCoupling === 'delta');
  }
}

if (btnStar) btnStar.addEventListener('click', () => { playClickSound(); currentCoupling = 'star'; updateCouplingUI(); });
if (btnDelta) btnDelta.addEventListener('click', () => { playClickSound(); currentCoupling = 'delta'; updateCouplingUI(); });

// ==========================================
// 4. WEBSOCKET & MISE À JOUR
// ==========================================
let wsUrl = 'ws://localhost:8000/ws/simulation';
if (window.location.hostname.includes('github.dev')) {
  const backendHost = window.location.hostname.replace('5173', '8000');
  wsUrl = `wss://${backendHost}/ws/simulation`;
}
const ws = new WebSocket(wsUrl);

ws.onopen = () => { statusText.innerText = "🟢 Connecté"; statusText.style.color = "#2ecc71"; };
ws.onmessage = (event) => {
  const state = JSON.parse(event.data);
  const wasRunning = isMotorRunning;
  const wasFaultActive = isFaultActive;
  const wasKm1 = isKm1; const wasKm2 = isKm2; const wasKm3 = isKm3;

  isMotorRunning = state.motor_running;
  isFaultActive = state.fault_active;
  isKm1 = state.km1_energized;
  isKm2 = state.km2_energized;
  isKm3 = state.km3_energized;

  updateCouplingUI();
  updateMultimeter();

  if ((isKm1 && !wasKm1) || (isKm2 && !wasKm2) || (isKm3 && !wasKm3)) playContactorClack();
  if ((!isKm1 && wasKm1) || (!isKm2 && wasKm2) || (!isKm3 && wasKm3)) playContactorClack();

  if (km1LedMat) km1LedMat.emissive.setHex(isKm1 ? 0x00ff00 : 0x000000);
  if (km2LedMat) km2LedMat.emissive.setHex(isKm2 ? 0x00ff00 : 0x000000);
  if (km3LedMat) km3LedMat.emissive.setHex(isKm3 ? 0x00ff00 : 0x000000);

  if (isMotorRunning) {
    if (simMode === 'star_delta') {
      if (isKm2) { targetRotorSpeed = 0.15; updateMotorPitch(true); }
      else if (isKm3) { targetRotorSpeed = 0.4; updateMotorPitch(false); }
      else { targetRotorSpeed = 0.1; }
    } else {
      targetRotorSpeed = 0.4;
    }
  } else {
    targetRotorSpeed = 0;
  }

  if (isMotorRunning && !wasRunning) setMotorSound(true, simMode === 'star_delta' && isKm2);
  if (!isMotorRunning && wasRunning) setMotorSound(false);

  if (isFaultActive && !wasFaultActive) playFaultSound();
  if (panelLedOrangeMat) panelLedOrangeMat.emissive.setHex(isFaultActive ? 0xffaa00 : 0x000000);

  if (isFaultActive) {
    leds.matOrange.emissive.setHex(0xffaa00); leds.matGreen.emissive.setHex(0x000000); leds.matRed.emissive.setHex(0x000000);
    statusText.innerText = "⚠️ DÉFAUT THERMIQUE ACTIF"; statusText.style.color = "#e67e22";
  } else if (isMotorRunning) {
    leds.matGreen.emissive.setHex(0x00ff00); leds.matRed.emissive.setHex(0x000000); leds.matOrange.emissive.setHex(0x000000);
    statusText.innerText = "🟢 MOTEUR EN MARCHE"; statusText.style.color = "#2ecc71";
  } else {
    leds.matRed.emissive.setHex(0xff0000); leds.matGreen.emissive.setHex(0x000000); leds.matOrange.emissive.setHex(0x000000);
    statusText.innerText = "🔴 CIRCUIT AU REPOS"; statusText.style.color = "#e74c3c";
  }

  wires.forEach(w => {
    if (w.netName.includes("PHASE")) {
      w.material.color.setHex(isMotorRunning ? w.activeColor : w.defaultColor);
      w.material.emissive.setHex(isMotorRunning ? w.activeColor : 0x000000);
    }
  });
};

// --- 5. GESTION CLICS & SÉCURITÉS ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let activePressedMesh: THREE.Mesh | null = null;

function sendAction(id: string, type: string, action: string) {
  if (action === 'press') playClickSound();

  if (id === 'btn_start' && action === 'press' && isCoverOpen && !isBypassActive) {
    statusText.innerText = "🔒 SÉCURITÉ : COUVERCLE OUVERT !"; statusText.style.color = "#e74c3c";
    playFaultSound();
    setTimeout(() => {
      if (!isMotorRunning && !isFaultActive) { statusText.innerText = "🔴 CIRCUIT AU REPOS"; statusText.style.color = "#e74c3c"; }
    }, 2000);
    return;
  }

  if (type === 'pulse') ws.send(JSON.stringify({ action, target: id }));
  else if (type === 'trip' && action === 'press') ws.send(JSON.stringify({ action: 'trip', target: id }));
  else if (type === 'reset' && action === 'press') ws.send(JSON.stringify({ action: 'reset', target: id }));
}

function toggleCover() {
  playClickSound();
  if (!isCoverOpen) {
    if (isMotorRunning && !isBypassActive) {
      sendAction('btn_stop', 'pulse', 'press');
      setTimeout(() => sendAction('btn_stop', 'pulse', 'release'), 100);
    }
    isCoverOpen = true;
  } else { isCoverOpen = false; }
  updateCouplingUI();
}

if (btnCover) btnCover.addEventListener('click', () => toggleCover());

window.addEventListener('pointermove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveButtons);
  document.body.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
});

window.addEventListener('pointerdown', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveButtons);

  if (intersects.length > 0) {
    const mesh = intersects[0].object as THREE.Mesh;

    if (mesh.userData.type === 'terminal') {
      if (activeProbe === 'red') {
        probeRedMesh.position.copy(mesh.position);
        probeRedMesh.position.y += 3;
        probeRedMesh.visible = true;
        nodeRed = mesh.userData.net;
        activeProbe = null;
        if (instrProbe) instrProbe.innerText = "Sonde Rouge placée.";
        playClickSound();
      } else if (activeProbe === 'black') {
        probeBlackMesh.position.copy(mesh.position);
        probeBlackMesh.position.y += 3;
        probeBlackMesh.visible = true;
        nodeBlack = mesh.userData.net;
        activeProbe = null;
        if (instrProbe) instrProbe.innerText = "Sonde Noire placée.";
        playClickSound();
      }
      updateMultimeter();
      return;
    }

    if (mesh.userData.type === 'cover') {
      toggleCover();
    } else {
      activePressedMesh = mesh; mesh.position.y = mesh.userData.initialY - 3;
      sendAction(mesh.userData.id, mesh.userData.type, 'press');
    }
  }
});

window.addEventListener('pointerup', () => {
  if (activePressedMesh && activePressedMesh.userData.type !== 'cover' && activePressedMesh.userData.type !== 'terminal') {
    activePressedMesh.position.y = activePressedMesh.userData.initialY;
    sendAction(activePressedMesh.userData.id, activePressedMesh.userData.type, 'release');
    activePressedMesh = null;
  }
});

const setupHTMLButton = (btnId: string, targetId: string) => {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('mousedown', () => sendAction(targetId, 'pulse', 'press'));
  btn.addEventListener('mouseup', () => sendAction(targetId, 'pulse', 'release'));
  btn.addEventListener('mouseleave', () => sendAction(targetId, 'pulse', 'release'));
};
setupHTMLButton('btn-start', 'btn_start'); setupHTMLButton('btn-stop', 'btn_stop');

const btnTripHTML = document.getElementById('btn-trip');
if (btnTripHTML) btnTripHTML.addEventListener('click', () => sendAction('thermal_f1', 'trip', 'press'));

const btnResetHTML = document.getElementById('btn-reset');
if (btnResetHTML) {
  btnResetHTML.addEventListener('mousedown', () => { if (panelLedBlueMat) panelLedBlueMat.emissive.setHex(0x0088ff); sendAction('thermal_f1', 'reset', 'press'); });
  const turnOffBlue = () => { if (panelLedBlueMat) panelLedBlueMat.emissive.setHex(0x000000); };
  btnResetHTML.addEventListener('mouseup', turnOffBlue); btnResetHTML.addEventListener('mouseleave', turnOffBlue);
}

// --- 6. ANIMATION ---
function animate() {
  requestAnimationFrame(animate); controls.update();

  const targetRotX = isCoverOpen ? -Math.PI / 1.7 : 0;
  coverGroup.rotation.x += (targetRotX - coverGroup.rotation.x) * 0.15;

  currentRotorSpeed += (targetRotorSpeed - currentRotorSpeed) * 0.03;
  if (rotorMesh) {
    rotorMesh.rotation.x += currentRotorSpeed;
  }

  renderer.render(scene, camera);
}
animate();