import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Chart from 'chart.js/auto';

// ==========================================
// 🎵 MOTEUR AUDIO DYNAMIQUE (Restauré et Sécurisé)
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
  try {
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) { }
}

function playContactorClack() {
  if (!isAudioEnabled) return;
  try {
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'square'; osc.frequency.setValueAtTime(100, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.8, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.start(); osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) { }
}

function playFaultSound() {
  if (!isAudioEnabled) return;
  try {
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'square'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.start(); osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) { }
}

function setMotorSound(running: boolean, coupling: string) {
  if (!isAudioEnabled) return;
  try {
    if (running && !motorOsc) {
      motorOsc = audioCtx.createOscillator(); motorGain = audioCtx.createGain();
      motorOsc.connect(motorGain); motorGain.connect(audioCtx.destination);
      motorOsc.type = 'triangle';
      const freq = (coupling === 'star') ? 35 : 50;
      motorOsc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      motorGain.gain.setValueAtTime(0, audioCtx.currentTime); motorGain.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.5);
      motorOsc.start();
    } else if (!running && motorOsc && motorGain) {
      motorGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
      motorOsc.stop(audioCtx.currentTime + 0.5); motorOsc = null; motorGain = null;
    }
  } catch (e) { }
}

function updateMotorPitch(coupling: string) {
  if (!isAudioEnabled || !motorOsc) return;
  try {
    const targetFreq = (coupling === 'star') ? 35 : 50;
    motorOsc.frequency.linearRampToValueAtTime(targetFreq, audioCtx.currentTime + 0.2);
  } catch (e) { }
}

window.addEventListener('pointerdown', initAudio, { once: true });

// ==========================================
// 1. SCÈNE & RENDU
// ==========================================
const container = document.getElementById('app')!;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1d24);
const gridHelper = new THREE.GridHelper(300, 60, 0x00d2ff, 0x333b4d); scene.add(gridHelper);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.set(0, 120, 180);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.05;

scene.add(new THREE.AmbientLight(0xffffff, 2.0));
const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.5); dirLight1.position.set(80, 150, 100); scene.add(dirLight1);

// ==========================================
// 2. ÉTATS GLOBAUX & MATÉRIAUX
// ==========================================
let simMode = 'direct';
let isCoverOpen = false; let isBypassActive = false;
let currentCoupling = 'star';
let activeCouplingStr = 'none';
let isMotorPowered = false, isFaultActive = false;
let isKm1 = false, isKm2 = false, isKm3 = false;
let stateKm1Broken = false, stateKm2Broken = false, stateKm3Broken = false;
let realRpm = 0;

let mmMode: 'V' | 'OHM' | 'MEGA' = 'V';
let probeRedMesh: THREE.Mesh; let probeBlackMesh: THREE.Mesh;
let activeProbe: 'red' | 'black' | null = null;
let nodeRed: string | null = null; let nodeBlack: string | null = null;

let panelLedOrangeMat: THREE.MeshStandardMaterial, panelLedBlueMat: THREE.MeshStandardMaterial;
let km1LedMat: THREE.MeshStandardMaterial | null = null; let km2LedMat: THREE.MeshStandardMaterial | null = null; let km3LedMat: THREE.MeshStandardMaterial | null = null;

let coverGroup: THREE.Group, starStrap: THREE.Mesh, deltaStraps: THREE.Group;
const interactiveButtons: THREE.Mesh[] = []; const hoverableObjects: THREE.Object3D[] = [];

const cabinetGroup = new THREE.Group(); cabinetGroup.position.set(0, 65, -70); scene.add(cabinetGroup);
function buildCabinet(mode: string) {
  while (cabinetGroup.children.length > 0) cabinetGroup.remove(cabinetGroup.children[0]);
  const createContactor = (x: number, id: string, name: string) => {
    const cGroup = new THREE.Group(); cGroup.position.set(x, 0, 4);
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    body.userData = { label: `Contacteur ${name}` }; cGroup.add(body); hoverableObjects.push(body);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x004400, emissive: 0x000000 });
    const led = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 1), ledMat); led.position.set(0, 2, 4.5); led.userData = { label: `Voyant (${name})` };
    cGroup.add(led); hoverableObjects.push(led);

    const addTerm = (tx: number, ty: number, tName: string, tLabel: string) => {
      const term = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 }));
      term.position.set(tx, ty, 4.5); term.rotation.x = Math.PI / 2; term.userData = { type: 'terminal', net: `${id}_${tName}`, label: `Borne ${tLabel} (${name})` };
      cGroup.add(term); interactiveButtons.push(term); hoverableObjects.push(term);
    };
    addTerm(-3, 6, 'L1', 'L1'); addTerm(0, 6, 'L2', 'L2'); addTerm(3, 6, 'L3', 'L3');
    addTerm(-3, -6, 'T1', 'T1'); addTerm(0, -6, 'T2', 'T2'); addTerm(3, -6, 'T3', 'T3');
    addTerm(-4, 3, 'A1', 'A1 (Bobine)'); addTerm(4, -3, 'A2', 'A2 (Neutre)');
    cabinetGroup.add(cGroup); return ledMat;
  };
  if (mode === 'direct') {
    cabinetGroup.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 4), new THREE.MeshStandardMaterial({ color: 0x555555 })));
    km1LedMat = createContactor(0, 'km1', 'KM1'); km2LedMat = null; km3LedMat = null;
  } else {
    cabinetGroup.add(new THREE.Mesh(new THREE.BoxGeometry(45, 20, 4), new THREE.MeshStandardMaterial({ color: 0x555555 })));
    km1LedMat = createContactor(-15, 'km1', 'KM1 (Ligne)'); km2LedMat = createContactor(0, 'km2', 'KM2 (Étoile)'); km3LedMat = createContactor(15, 'km3', 'KM3 (Triangle)');
  }
}
buildCabinet(simMode);

function createIndicatorPanel() {
  const panelGroup = new THREE.Group(); panelGroup.position.set(-70, 20, 0);
  panelGroup.add(new THREE.Mesh(new THREE.BoxGeometry(22, 55, 18), new THREE.MeshStandardMaterial({ color: 0x2c3e50 })));
  const addPanelLed = (mat: THREE.Material, y: number, label: string) => {
    const led = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 5, 24), mat); led.position.set(0, y, 10); led.rotation.x = Math.PI / 2; led.userData = { label };
    panelGroup.add(led); hoverableObjects.push(led); return led;
  };
  const matGreen = new THREE.MeshStandardMaterial({ color: 0x004400, emissive: 0x000000 }); addPanelLed(matGreen, 16, "Marche");
  const matRed = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0x000000 }); addPanelLed(matRed, 0, "Arrêt");
  const matOrange = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0x000000 }); addPanelLed(matOrange, -16, "Défaut");
  scene.add(panelGroup); return { matGreen, matRed, matOrange };
}
const leds = createIndicatorPanel();

function create3DPushButtons() {
  const panelGroup = new THREE.Group(); panelGroup.position.set(60, 12, 20);
  panelGroup.add(new THREE.Mesh(new THREE.BoxGeometry(70, 20, 35), new THREE.MeshStandardMaterial({ color: 0x34495e })));
  const createBtn = (color: number, x: number, id: string, type: string, label: string) => {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 8, 32), new THREE.MeshStandardMaterial({ color })); btn.position.set(x, 11, 0); btn.userData = { id, type, initialY: 11, label };
    panelGroup.add(btn); interactiveButtons.push(btn); hoverableObjects.push(btn);
  };
  createBtn(0x27ae60, -24, 'btn_start', 'pulse', 'START'); createBtn(0xc0392b, -8, 'btn_stop', 'pulse', 'STOP');
  panelLedOrangeMat = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0x000000 });
  const ledO = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 3, 32), panelLedOrangeMat); ledO.position.set(8, 11.5, 0); ledO.userData = { label: 'Défaut Thermique' };
  panelGroup.add(ledO); hoverableObjects.push(ledO);
  panelLedBlueMat = new THREE.MeshStandardMaterial({ color: 0x001144, emissive: 0x000000 });
  const ledB = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 3, 32), panelLedBlueMat); ledB.position.set(24, 11.5, 0); ledB.userData = { label: 'Réarmement' };
  panelGroup.add(ledB); hoverableObjects.push(ledB);
  scene.add(panelGroup);
}
create3DPushButtons();

function createTerminalBox() {
  const boxGroup = new THREE.Group(); boxGroup.position.set(0, 32, -15);
  boxGroup.add(new THREE.Mesh(new THREE.BoxGeometry(32, 18, 28), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 })));
  const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 22), new THREE.MeshStandardMaterial({ color: 0xdedede })); plateMesh.position.y = 8; boxGroup.add(plateMesh);

  const studGeo = new THREE.CylinderGeometry(1.5, 1.5, 6, 16);
  const studMat = new THREE.MeshStandardMaterial({ color: 0xf39c12, metalness: 0.9, roughness: 0.2 });
  const positions = [{ name: "W2", pos: [-8, 12, -6] }, { name: "U2", pos: [0, 12, -6] }, { name: "V2", pos: [8, 12, -6] }, { name: "U1", pos: [-8, 12, 6] }, { name: "V1", pos: [0, 12, 6] }, { name: "W1", pos: [8, 12, 6] }];
  positions.forEach(p => {
    const stud = new THREE.Mesh(studGeo, studMat); stud.position.set(p.pos[0], p.pos[1], p.pos[2]); stud.userData = { id: p.name, type: 'terminal', net: p.name, label: `Borne Moteur ${p.name}` };
    boxGroup.add(stud); interactiveButtons.push(stud); hoverableObjects.push(stud);
  });

  const peStud = new THREE.Mesh(studGeo, new THREE.MeshStandardMaterial({ color: 0x27ae60, metalness: 0.8 })); peStud.position.set(-12, 12, 0); peStud.userData = { type: 'terminal', net: 'PE', label: 'Terre (PE)' };
  boxGroup.add(peStud); interactiveButtons.push(peStud); hoverableObjects.push(peStud);

  const strapMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.1 });
  starStrap = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 3), strapMat); starStrap.position.set(0, 13.5, -6); starStrap.userData = { label: 'Barrettes Étoile' };
  boxGroup.add(starStrap); hoverableObjects.push(starStrap);

  deltaStraps = new THREE.Group();
  [-8, 0, 8].forEach(x => { const ds = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 15), strapMat); ds.position.set(x, 13.5, 0); ds.userData = { label: 'Barrette Triangle' }; deltaStraps.add(ds); hoverableObjects.push(ds); });
  deltaStraps.visible = false; boxGroup.add(deltaStraps);

  coverGroup = new THREE.Group(); coverGroup.position.set(0, 9, -14);
  const coverMesh = new THREE.Mesh(new THREE.BoxGeometry(32, 2, 28), new THREE.MeshPhysicalMaterial({ color: 0xdddddd, transmission: 0.9, transparent: true, side: THREE.DoubleSide }));
  coverMesh.position.set(0, 1, 14); coverMesh.userData = { id: 'cover', type: 'cover', label: 'Couvercle' };
  coverGroup.add(coverMesh); boxGroup.add(coverGroup); interactiveButtons.push(coverMesh); hoverableObjects.push(coverMesh);

  const probeGeo = new THREE.ConeGeometry(1.5, 12, 16); probeGeo.rotateX(Math.PI); probeGeo.translate(0, 6, 0);
  probeRedMesh = new THREE.Mesh(probeGeo, new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3 })); probeRedMesh.visible = false; boxGroup.add(probeRedMesh);
  probeBlackMesh = new THREE.Mesh(probeGeo, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 })); probeBlackMesh.visible = false; boxGroup.add(probeBlackMesh);

  scene.add(boxGroup);
}
createTerminalBox();

function buildIndustrialCable(points: THREE.Vector3[], defaultColor: number, activeColor: number, netName: string, radius = 1.4) {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, radius, 12, false), new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.4 })); scene.add(mesh);
  return { mesh, material: mesh.material as THREE.MeshStandardMaterial, netName, activeColor, defaultColor };
}
const wires = [
  buildIndustrialCable([new THREE.Vector3(-10, 55, -65), new THREE.Vector3(-20, 45, -30), new THREE.Vector3(-8, 44, -9)], 0x5c3a21, 0xff5500, "L1_PHASE"),
  buildIndustrialCable([new THREE.Vector3(-5, 55, -65), new THREE.Vector3(-10, 45, -30), new THREE.Vector3(0, 44, -9)], 0x111111, 0x00d2ff, "L2_PHASE"),
  buildIndustrialCable([new THREE.Vector3(0, 55, -65), new THREE.Vector3(0, 45, -30), new THREE.Vector3(8, 44, -9)], 0x7f8c8d, 0xffff00, "L3_PHASE"),
  buildIndustrialCable([new THREE.Vector3(5, 55, -65), new THREE.Vector3(15, 30, -35), new THREE.Vector3(0, 15, -25)], 0x27ae60, 0x2ecc71, "PE_GROUND", 1.8)
];

const loader = new GLTFLoader();
const motorGroup = new THREE.Group(); scene.add(motorGroup);
let rotorMesh: THREE.Object3D | null = null;
loader.load('/assets/MOTOR_STATOR.glb', (gltf) => { gltf.scene.traverse((child) => { if ((child as THREE.Mesh).isMesh) child.userData.label = 'Stator'; }); motorGroup.add(gltf.scene); hoverableObjects.push(gltf.scene); });
loader.load('/assets/MOTOR_ROTOR.glb', (gltf) => { rotorMesh = gltf.scene; rotorMesh.traverse((child) => { if ((child as THREE.Mesh).isMesh) child.userData.label = 'Rotor'; }); motorGroup.add(rotorMesh); hoverableObjects.push(rotorMesh); });

// ==========================================
// 3. LOGIQUE UI & LABORATOIRE
// ==========================================
const statusText = document.getElementById('status')!;
const uiRpm = document.getElementById('ui-rpm')!;
const ctxChart = document.getElementById('oscillo-chart') as HTMLCanvasElement;
const oscilloChart = new Chart(ctxChart, {
  type: 'line',
  data: { labels: Array(50).fill(''), datasets: [{ label: 'Courant (A)', borderColor: '#f1c40f', borderWidth: 2, tension: 0.1, pointRadius: 0, data: Array(50).fill(0), yAxisID: 'yI' }, { label: 'Vitesse (RPM)', borderColor: '#3498db', borderWidth: 2, tension: 0.1, pointRadius: 0, data: Array(50).fill(0), yAxisID: 'yV' }] },
  options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#ecf0f1', boxWidth: 10 } } }, scales: { x: { display: false }, yI: { type: 'linear', position: 'left', min: 0, max: 120, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#f1c40f' } }, yV: { type: 'linear', position: 'right', min: 0, max: 1600, grid: { drawOnChartArea: false }, ticks: { color: '#3498db' } } } }
});

const selMotor = document.getElementById('sel-motor') as HTMLSelectElement;
const selLoadType = document.getElementById('sel-load-type') as HTMLSelectElement;
const sliderLoad = document.getElementById('slider-load') as HTMLInputElement;
const sliderInertia = document.getElementById('slider-inertia') as HTMLInputElement;
const loadVal = document.getElementById('load-val')!; const heatVal = document.getElementById('heat-val')!; const heatBar = document.getElementById('heat-bar')!;

if (selMotor) selMotor.addEventListener('change', (e) => {
  const val = (e.target as HTMLSelectElement).value; ws.send(JSON.stringify({ action: "set_motor", target: val }));
  if (val === "3.0_2p") { oscilloChart.options.scales!.yI!.max = 50; oscilloChart.options.scales!.yV!.max = 3200; }
  else if (val === "7.5_4p") { oscilloChart.options.scales!.yI!.max = 120; oscilloChart.options.scales!.yV!.max = 1600; }
  else if (val === "15.0_6p") { oscilloChart.options.scales!.yI!.max = 250; oscilloChart.options.scales!.yV!.max = 1100; }
  oscilloChart.update(); playClickSound();
});
if (selLoadType) selLoadType.addEventListener('change', (e) => { ws.send(JSON.stringify({ action: "set_load_type", target: (e.target as HTMLSelectElement).value })); playClickSound(); });
if (sliderInertia) sliderInertia.addEventListener('change', (e) => { ws.send(JSON.stringify({ action: "set_inertia", target: (e.target as HTMLInputElement).value })); });
if (sliderLoad) sliderLoad.addEventListener('input', (e) => { const val = (e.target as HTMLInputElement).value; loadVal.innerText = val; ws.send(JSON.stringify({ action: "set_load_factor", target: val })); });

const btnCover = document.getElementById('btn-cover') as HTMLButtonElement;
const btnStar = document.getElementById('btn-star') as HTMLButtonElement;
const btnDelta = document.getElementById('btn-delta') as HTMLButtonElement;
const btnNone = document.getElementById('btn-none') as HTMLButtonElement;

if (btnStar) btnStar.addEventListener('click', () => { playClickSound(); currentCoupling = 'star'; updateCouplingUI(); ws.send(JSON.stringify({ action: "set_manual_coupling", target: "star" })); });
if (btnDelta) btnDelta.addEventListener('click', () => { playClickSound(); currentCoupling = 'delta'; updateCouplingUI(); ws.send(JSON.stringify({ action: "set_manual_coupling", target: "delta" })); });
if (btnNone) btnNone.addEventListener('click', () => { playClickSound(); currentCoupling = 'none'; updateCouplingUI(); ws.send(JSON.stringify({ action: "set_manual_coupling", target: "none" })); });

function updateCouplingUI() {
  if (btnCover) btnCover.innerText = isCoverOpen ? "FERMER COUVERCLE" : "OUVRIR COUVERCLE";
  if (simMode === 'star_delta') {
    if (btnStar) { btnStar.disabled = true; btnStar.style.background = '#333'; }
    if (btnDelta) { btnDelta.disabled = true; btnDelta.style.background = '#333'; }
    if (btnNone) { btnNone.disabled = true; btnNone.style.background = '#333'; }
    starStrap.visible = false; deltaStraps.visible = false;
  } else {
    const canEdit = isCoverOpen && !isMotorPowered && !isKm1;
    if (canEdit) {
      if (btnStar) { btnStar.disabled = false; btnStar.style.background = currentCoupling === 'star' ? '#d35400' : '#2980b9'; }
      if (btnDelta) { btnDelta.disabled = false; btnDelta.style.background = currentCoupling === 'delta' ? '#d35400' : '#2980b9'; }
      if (btnNone) { btnNone.disabled = false; btnNone.style.background = currentCoupling === 'none' ? '#d35400' : '#2980b9'; }
    } else {
      if (btnStar) { btnStar.disabled = true; btnStar.style.background = '#7f8c8d'; }
      if (btnDelta) { btnDelta.disabled = true; btnDelta.style.background = '#7f8c8d'; }
      if (btnNone) { btnNone.disabled = true; btnNone.style.background = '#7f8c8d'; }
    }
    starStrap.visible = (currentCoupling === 'star' && simMode === 'direct');
    deltaStraps.visible = (currentCoupling === 'delta' && simMode === 'direct');
  }
}

function switchMode(newMode: string) {
  playClickSound(); simMode = newMode;
  if (simMode === 'direct') {
    document.getElementById('btn-mode-direct')!.style.background = '#8e44ad'; document.getElementById('btn-mode-sd')!.style.background = '#7f8c8d';
    document.getElementById('btn-rep-km2')!.style.display = 'none'; document.getElementById('btn-rep-km3')!.style.display = 'none';
  } else {
    document.getElementById('btn-mode-direct')!.style.background = '#7f8c8d'; document.getElementById('btn-mode-sd')!.style.background = '#8e44ad';
    document.getElementById('btn-rep-km2')!.style.display = 'block'; document.getElementById('btn-rep-km3')!.style.display = 'block';
  }
  buildCabinet(simMode); ws.send(JSON.stringify({ action: "change_mode", target: simMode })); updateCouplingUI();
}
document.getElementById('btn-mode-direct')?.addEventListener('click', () => switchMode('direct')); document.getElementById('btn-mode-sd')?.addEventListener('click', () => switchMode('star_delta'));

// ==========================================
// SOLVEUR ÉLECTRIQUE DU MULTIMÈTRE
// ==========================================
const chkBypass = document.getElementById('chk-bypass') as HTMLInputElement;
if (chkBypass) chkBypass.addEventListener('change', (e) => { isBypassActive = (e.target as HTMLInputElement).checked; playClickSound(); });
const displayMultimeter = document.getElementById('multimeter-display')!; const mmUnit = document.getElementById('mm-unit')!; const megaVoltageContainer = document.getElementById('mega-voltage-container')!;

const setMmMode = (mode: 'V' | 'OHM' | 'MEGA') => {
  playClickSound(); mmMode = mode;
  document.getElementById('btn-mm-v')!.style.background = mode === 'V' ? '#e74c3c' : '#7f8c8d'; document.getElementById('btn-mm-ohm')!.style.background = mode === 'OHM' ? '#e74c3c' : '#7f8c8d'; document.getElementById('btn-mm-mega')!.style.background = mode === 'MEGA' ? '#e74c3c' : '#7f8c8d';
  mmUnit.innerText = mode === 'V' ? 'AC V' : mode === 'OHM' ? 'Ω' : 'MΩ'; megaVoltageContainer.style.display = mode === 'MEGA' ? 'flex' : 'none'; updateMultimeter();
};
document.getElementById('btn-mm-v')?.addEventListener('click', () => setMmMode('V')); document.getElementById('btn-mm-ohm')?.addEventListener('click', () => setMmMode('OHM')); document.getElementById('btn-mm-mega')?.addEventListener('click', () => setMmMode('MEGA'));
document.getElementById('btn-probe-red')?.addEventListener('click', () => { activeProbe = 'red'; playClickSound(); }); document.getElementById('btn-probe-black')?.addEventListener('click', () => { activeProbe = 'black'; playClickSound(); });
document.getElementById('btn-remove-probes')?.addEventListener('click', () => { playClickSound(); nodeRed = null; nodeBlack = null; probeRedMesh.visible = false; probeBlackMesh.visible = false; updateMultimeter(); });

function getVoltage(n1: string, n2: string): number {
  if (n1 === n2) return 0.0;

  const getPhase = (n: string): string => {
    // Réseau sur l'amont KM1 (toujours présent)
    if (n === 'km1_L1') return 'P1'; if (n === 'km1_L2') return 'P2'; if (n === 'km1_L3') return 'P3';

    // Sortie KM1
    if (['km1_T1', 'km2_L1', 'km3_L1', 'U1'].includes(n)) return isKm1 ? 'P1' : 'OFF';
    if (['km1_T2', 'km2_L2', 'km3_L2', 'V1'].includes(n)) return isKm1 ? 'P2' : 'OFF';
    if (['km1_T3', 'km2_L3', 'km3_L3', 'W1'].includes(n)) return isKm1 ? 'P3' : 'OFF';

    // Bas du circuit
    if (['km3_T1', 'W2', 'km2_T1'].includes(n)) {
      if (simMode === 'star_delta') { if (isKm3 && isKm1) return 'P1'; if (isKm2 && isKm1) return 'STAR'; }
      else { if (currentCoupling === 'star' && isKm1) return 'STAR'; if (currentCoupling === 'delta' && isKm1) return 'P1'; }
      return 'OFF';
    }
    if (['km3_T2', 'U2', 'km2_T2'].includes(n)) {
      if (simMode === 'star_delta') { if (isKm3 && isKm1) return 'P2'; if (isKm2 && isKm1) return 'STAR'; }
      else { if (currentCoupling === 'star' && isKm1) return 'STAR'; if (currentCoupling === 'delta' && isKm1) return 'P2'; }
      return 'OFF';
    }
    if (['km3_T3', 'V2', 'km2_T3'].includes(n)) {
      if (simMode === 'star_delta') { if (isKm3 && isKm1) return 'P3'; if (isKm2 && isKm1) return 'STAR'; }
      else { if (currentCoupling === 'star' && isKm1) return 'STAR'; if (currentCoupling === 'delta' && isKm1) return 'P3'; }
      return 'OFF';
    }

    if (n.endsWith('_A2')) return 'NEUTRAL';
    if (n === 'km1_A1') return isKm1 ? 'P_CTRL' : 'OFF';
    if (n === 'km2_A1') return isKm2 ? 'P_CTRL' : 'OFF';
    if (n === 'km3_A1') return isKm3 ? 'P_CTRL' : 'OFF';

    if (n === 'PE') return 'NEUTRAL';
    return 'OFF';
  };

  const p1 = getPhase(n1); const p2 = getPhase(n2);
  if (p1 === 'OFF' || p2 === 'OFF' || p1 === p2) return 0.0;

  const phases = ['P1', 'P2', 'P3'];
  if (phases.includes(p1) && phases.includes(p2)) return 400.0; // Tension Composée
  if ((phases.includes(p1) && ['NEUTRAL', 'STAR'].includes(p2)) || (['NEUTRAL', 'STAR'].includes(p1) && phases.includes(p2))) return 230.0;
  if ((p1 === 'P_CTRL' && p2 === 'NEUTRAL') || (p2 === 'P_CTRL' && p1 === 'NEUTRAL')) return 24.0;
  return 0.0;
}

function calculateResistance(n1: string, n2: string): string {
  if (n1 === n2) return "0.0"; const pair = [n1, n2].sort().join('-');

  if (pair === 'km1_A1-km1_A2') return stateKm1Broken ? "O.L" : "324.5";
  if (pair === 'km2_A1-km2_A2') return stateKm2Broken ? "O.L" : "321.2";
  if (pair === 'km3_A1-km3_A2') return stateKm3Broken ? "O.L" : "328.0";

  if (pair.includes('_L1-') && pair.includes('_T1')) { const km = pair.split('_')[0]; const closed = (km === 'km1' && isKm1) || (km === 'km2' && isKm2) || (km === 'km3' && isKm3); return closed ? "0.1" : "O.L"; }
  if (pair.includes('_L2-') && pair.includes('_T2')) { const km = pair.split('_')[0]; const closed = (km === 'km1' && isKm1) || (km === 'km2' && isKm2) || (km === 'km3' && isKm3); return closed ? "0.1" : "O.L"; }
  if (pair.includes('_L3-') && pair.includes('_T3')) { const km = pair.split('_')[0]; const closed = (km === 'km1' && isKm1) || (km === 'km2' && isKm2) || (km === 'km3' && isKm3); return closed ? "0.1" : "O.L"; }

  const isW1 = ['U1', 'V1', 'W1', 'U2', 'V2', 'W2'].includes(n1);
  const isW2 = ['U1', 'V1', 'W1', 'U2', 'V2', 'W2'].includes(n2);

  if (isW1 && isW2) {
    const barrettesPresent = simMode === 'direct' && currentCoupling !== 'none';
    if (barrettesPresent) return "ERR(BAR)";
    if (['U1-U2', 'V1-V2', 'W1-W2'].includes(pair)) return (12.5 + Math.random() * 0.2).toFixed(1);
    return "O.L";
  }
  return "O.L";
}

function calculateMegaOhm(n1: string, n2: string): string {
  if (n1 === n2) return "0.0"; const pair = [n1, n2].sort().join('-');
  const isW1 = ['U1', 'V1', 'W1', 'U2', 'V2', 'W2'].includes(n1);
  const isW2 = ['U1', 'V1', 'W1', 'U2', 'V2', 'W2'].includes(n2);

  const barrettesPresent = simMode === 'direct' && currentCoupling !== 'none';
  if ((isW1 || isW2) && barrettesPresent) return "ERR(BAR)";

  if (pair.includes('PE') && (isW1 || isW2)) return "> 500";
  if (isW1 && isW2 && !['U1-U2', 'V1-V2', 'W1-W2'].includes(pair)) return "> 500";
  if ((pair.includes('L1') && pair.includes('L2')) || (pair.includes('L2') && pair.includes('L3')) || (pair.includes('L1') && pair.includes('L3'))) return "> 999";

  return "O.L";
}

function updateMultimeter() {
  if (!displayMultimeter) return;
  if (!nodeRed || !nodeBlack) { displayMultimeter.innerText = "---"; displayMultimeter.style.color = "#111"; displayMultimeter.style.textShadow = "none"; return; }

  const isCircuitLive = isKm1 || isKm2 || isKm3 || isMotorPowered;

  if (mmMode === 'V') {
    const baseVoltage = getVoltage(nodeRed, nodeBlack);
    if (baseVoltage > 0) {
      const fluctuation = (Math.random() * 3 - 1.5);
      displayMultimeter.innerText = (baseVoltage + fluctuation).toFixed(1);
      displayMultimeter.style.color = "#ff3333"; displayMultimeter.style.textShadow = "0 0 5px #ff0000";
    } else { displayMultimeter.innerText = "0.00"; displayMultimeter.style.color = "#111"; displayMultimeter.style.textShadow = "none"; }
  }
  else if (mmMode === 'OHM') {
    if (isCircuitLive && !isBypassActive) { displayMultimeter.innerText = "ERR(V)"; displayMultimeter.style.color = "#c0392b"; displayMultimeter.style.textShadow = "none"; }
    else {
      const res = calculateResistance(nodeRed, nodeBlack);
      displayMultimeter.innerText = res;
      displayMultimeter.style.color = res.includes("ERR") ? "#c0392b" : "#111"; displayMultimeter.style.textShadow = "none";
    }
  }
  else if (mmMode === 'MEGA') {
    if (isCircuitLive) { displayMultimeter.innerText = "ERR(V)"; displayMultimeter.style.color = "#c0392b"; displayMultimeter.style.textShadow = "none"; }
    else {
      const res = calculateMegaOhm(nodeRed, nodeBlack);
      displayMultimeter.innerText = res;
      displayMultimeter.style.color = res.includes("ERR") ? "#c0392b" : "#111"; displayMultimeter.style.textShadow = "none";
    }
  }
}

const handleReplace = (target: string) => {
  playClickSound();
  if (isKm1 || isMotorPowered) { statusText.innerText = "⚡ DANGER : Coupez (STOP) avant intervention !"; statusText.style.color = "#e74c3c"; playFaultSound(); return; }
  ws.send(JSON.stringify({ action: "replace_part", target }));
  statusText.innerText = `🔧 Pièce ${target.toUpperCase()} remplacée.`; statusText.style.color = "#3498db";
};
document.getElementById('btn-rep-km1')?.addEventListener('click', () => handleReplace('km1')); document.getElementById('btn-rep-km2')?.addEventListener('click', () => handleReplace('km2')); document.getElementById('btn-rep-km3')?.addEventListener('click', () => handleReplace('km3'));
document.getElementById('btn-fault')?.addEventListener('click', () => { playClickSound(); ws.send(JSON.stringify({ action: "generate_fault" })); });

// ==========================================
// 4. WEBSOCKET & MISE À JOUR CONTINUE
// ==========================================
let wsUrl = 'ws://localhost:8000/ws/simulation'; // Par défaut : PC Local

if (window.location.hostname.includes('github.dev')) {
  // CAS 1 : Tu codes sur GitHub Codespaces
  const backendHost = window.location.hostname.replace('5173', '8000');
  wsUrl = `wss://${backendHost}/ws/simulation`;
}
else if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  // CAS 2 : Application en ligne (Production sur Vercel)
  // ⚠️ Tu remplaceras ce lien par celui de Render à l'étape 3
  wsUrl = 'wss://industrial-lab-backend.onrender.com/ws/simulation';
}

const ws = new WebSocket(wsUrl);

ws.onopen = () => { statusText.innerText = "🟢 Connecté"; statusText.style.color = "#2ecc71"; };
ws.onmessage = (event) => {
  const state = JSON.parse(event.data);
  const wasPowered = isMotorPowered; const wasFaultActive = isFaultActive;
  const wasKm1 = isKm1; const wasKm2 = isKm2; const wasKm3 = isKm3;

  isMotorPowered = state.motor_running;
  isFaultActive = state.fault_active;
  isKm1 = state.km1_energized; isKm2 = state.km2_energized; isKm3 = state.km3_energized;
  stateKm1Broken = state.km1_broken; stateKm2Broken = state.km2_broken; stateKm3Broken = state.km3_broken;
  activeCouplingStr = state.coupling || 'none';

  realRpm = state.speed_rpm || 0; uiRpm.innerText = Math.round(realRpm).toString();

  oscilloChart.data.datasets[0].data.push(state.current || 0); oscilloChart.data.datasets[0].data.shift();
  oscilloChart.data.datasets[1].data.push(realRpm); oscilloChart.data.datasets[1].data.shift();
  oscilloChart.update();

  if (state.heat_percent !== undefined) {
    heatVal.innerText = state.heat_percent.toString(); heatBar.style.width = state.heat_percent + "%";
    heatBar.style.background = state.heat_percent > 80 ? '#e74c3c' : (state.heat_percent > 50 ? '#f39c12' : '#2ecc71');
  }

  if (state.specs) {
    document.getElementById('spec-pn')!.innerText = state.specs.Pn.toFixed(1); document.getElementById('spec-in')!.innerText = state.specs.In.toFixed(1); document.getElementById('spec-ns')!.innerText = state.specs.Ns.toString(); document.getElementById('spec-cos')!.innerText = state.specs.cos.toFixed(2);
  }

  const guideText = document.getElementById('dynamic-guide-text')!;
  if (state.guide_text) guideText.innerHTML = state.guide_text;

  updateCouplingUI(); updateMultimeter();

  const clueBox = document.getElementById('fault-clue-box')!; const clueText = document.getElementById('fault-clue-text')!;
  if (state.fault_clue) { clueBox.style.display = 'block'; clueText.innerText = state.fault_clue; } else { clueBox.style.display = 'none'; }

  if ((isKm1 && !wasKm1) || (isKm2 && !wasKm2) || (isKm3 && !wasKm3)) playContactorClack();
  if ((!isKm1 && wasKm1) || (!isKm2 && wasKm2) || (!isKm3 && wasKm3)) playContactorClack();

  if (km1LedMat) km1LedMat.emissive.setHex(isKm1 ? 0x00ff00 : 0x000000);
  if (km2LedMat) km2LedMat.emissive.setHex(isKm2 ? 0x00ff00 : 0x000000);
  if (km3LedMat) km3LedMat.emissive.setHex(isKm3 ? 0x00ff00 : 0x000000);

  if (isFaultActive && !wasFaultActive) playFaultSound();
  if (panelLedOrangeMat) panelLedOrangeMat.emissive.setHex(isFaultActive ? 0xffaa00 : 0x000000);

  if (isFaultActive) {
    leds.matOrange.emissive.setHex(0xffaa00); leds.matGreen.emissive.setHex(0x000000); leds.matRed.emissive.setHex(0x000000);
    statusText.innerText = "⚠️ DÉFAUT THERMIQUE ACTIF"; statusText.style.color = "#e67e22";
  } else if (!state.fault_clue && statusText.innerText.includes("remplacée")) {
  } else if (state.fault_clue) {
    leds.matRed.emissive.setHex(0xff0000); leds.matGreen.emissive.setHex(0x000000); leds.matOrange.emissive.setHex(0x000000);
    statusText.innerText = "⚠️ PANNE INJECTÉE"; statusText.style.color = "#c0392b";
  } else {
    if (isMotorPowered) {
      leds.matGreen.emissive.setHex(0x00ff00); leds.matRed.emissive.setHex(0x000000); leds.matOrange.emissive.setHex(0x000000);
      statusText.innerText = "🟢 MOTEUR SOUS TENSION"; statusText.style.color = "#2ecc71";
    } else {
      leds.matRed.emissive.setHex(0xff0000); leds.matGreen.emissive.setHex(0x000000); leds.matOrange.emissive.setHex(0x000000);
      statusText.innerText = "🔴 CIRCUIT AU REPOS"; statusText.style.color = "#e74c3c";
    }
  }

  wires.forEach(w => {
    if (w.netName.includes("PHASE")) {
      const isLive = isKm1 || isKm2 || isKm3;
      w.material.color.setHex(isLive ? w.activeColor : w.defaultColor); w.material.emissive.setHex(isLive ? w.activeColor : 0x000000);
    }
  });

  if (isMotorPowered && !wasPowered) setMotorSound(true, activeCouplingStr);
  if (!isMotorPowered && wasPowered) setMotorSound(false, 'none');
  if (isMotorPowered) updateMotorPitch(activeCouplingStr);
};

// ==========================================
// 5. GESTION CLICS & TOOLTIPS
// ==========================================
const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2(); const tooltipDiv = document.getElementById('tooltip')!;

function sendAction(id: string, type: string, action: string) {
  if (action === 'press') playClickSound();
  if (id === 'btn_start' && action === 'press' && isCoverOpen && !isBypassActive) { statusText.innerText = "🔒 SÉCURITÉ : COUVERCLE OUVERT !"; statusText.style.color = "#e74c3c"; playFaultSound(); return; }
  if (type === 'pulse') ws.send(JSON.stringify({ action, target: id }));
  else if (type === 'trip' && action === 'press') ws.send(JSON.stringify({ action: 'trip', target: id }));
  else if (type === 'reset' && action === 'press') ws.send(JSON.stringify({ action: 'reset', target: id }));
}

function toggleCover() {
  playClickSound();
  if (!isCoverOpen) { if (isMotorPowered && !isBypassActive) { sendAction('btn_stop', 'pulse', 'press'); setTimeout(() => sendAction('btn_stop', 'pulse', 'release'), 100); } isCoverOpen = true; }
  else { isCoverOpen = false; }
  updateCouplingUI();
}
document.getElementById('btn-cover')?.addEventListener('click', toggleCover);

window.addEventListener('pointermove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1; mouse.y = -(event.clientY / window.innerHeight) * 2 + 1; raycaster.setFromCamera(mouse, camera);
  const intersectsHover = raycaster.intersectObjects([...hoverableObjects], true);
  let foundLabel = false;
  for (let i = 0; i < intersectsHover.length; i++) {
    let obj = intersectsHover[i].object;
    while (obj) {
      if (obj.userData && obj.userData.label) {
        tooltipDiv.style.display = 'block'; tooltipDiv.style.left = (event.clientX + 15) + 'px'; tooltipDiv.style.top = (event.clientY + 15) + 'px';
        tooltipDiv.innerText = obj.userData.label; foundLabel = true; break;
      }
      if (obj.parent) obj = obj.parent; else break;
    }
    if (foundLabel) break;
  }
  if (!foundLabel) tooltipDiv.style.display = 'none';
  const intersectsClick = raycaster.intersectObjects(interactiveButtons); document.body.style.cursor = intersectsClick.length > 0 ? 'pointer' : 'default';
});

let activePressedMesh: THREE.Mesh | null = null;
window.addEventListener('pointerdown', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1; mouse.y = -(event.clientY / window.innerHeight) * 2 + 1; raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveButtons);
  if (intersects.length > 0) {
    const mesh = intersects[0].object as THREE.Mesh;
    if (mesh.userData.type === 'terminal') {
      if (activeProbe === 'red') {
        probeRedMesh.position.copy(mesh.position); if (mesh.position.y > 10) probeRedMesh.position.y += 3; else probeRedMesh.position.z += 3;
        probeRedMesh.visible = true; nodeRed = mesh.userData.net; activeProbe = null; playClickSound();
      } else if (activeProbe === 'black') {
        probeBlackMesh.position.copy(mesh.position); if (mesh.position.y > 10) probeBlackMesh.position.y += 3; else probeBlackMesh.position.z += 3;
        probeBlackMesh.visible = true; nodeBlack = mesh.userData.net; activeProbe = null; playClickSound();
      }
      updateMultimeter(); return;
    }
    if (mesh.userData.type === 'cover') toggleCover(); else { activePressedMesh = mesh; mesh.position.y = mesh.userData.initialY - 3; sendAction(mesh.userData.id, mesh.userData.type, 'press'); }
  }
});

window.addEventListener('pointerup', () => {
  if (activePressedMesh && activePressedMesh.userData.type !== 'cover' && activePressedMesh.userData.type !== 'terminal') {
    activePressedMesh.position.y = activePressedMesh.userData.initialY; sendAction(activePressedMesh.userData.id, activePressedMesh.userData.type, 'release'); activePressedMesh = null;
  }
});

// Fonction utilitaire pour une réactivité mobile instantanée (0ms delay)
function bindFastClick(btnId: string, onPress: () => void, onRelease?: () => void) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  let isPressed = false;

  const handlePress = (e: Event) => {
    e.preventDefault(); // Bloque le délai mobile natif
    if (!isPressed) { isPressed = true; onPress(); }
  };

  const handleRelease = (e: Event) => {
    e.preventDefault();
    if (isPressed) { isPressed = false; if (onRelease) onRelease(); }
  };

  // Écoute tactile (Smartphone) ET Souris (PC)
  btn.addEventListener('mousedown', handlePress);
  btn.addEventListener('touchstart', handlePress, { passive: false });

  if (onRelease) {
    btn.addEventListener('mouseup', handleRelease);
    btn.addEventListener('touchend', handleRelease);
    btn.addEventListener('mouseleave', handleRelease);
    btn.addEventListener('touchcancel', handleRelease);
  }
}

// Application aux boutons du pupitre
bindFastClick('btn-start',
  () => sendAction('btn_start', 'pulse', 'press'),
  () => sendAction('btn_start', 'pulse', 'release')
);

bindFastClick('btn-stop',
  () => sendAction('btn_stop', 'pulse', 'press'),
  () => sendAction('btn_stop', 'pulse', 'release')
);

bindFastClick('btn-trip',
  () => sendAction('thermal_f1', 'trip', 'press')
);

bindFastClick('btn-reset',
  () => { if (panelLedBlueMat) panelLedBlueMat.emissive.setHex(0x0088ff); sendAction('thermal_f1', 'reset', 'press'); },
  () => { if (panelLedBlueMat) panelLedBlueMat.emissive.setHex(0x000000); }
);
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now(); const dt = (now - lastTime) / 1000.0; lastTime = now;
  controls.update();
  const targetRotX = isCoverOpen ? -Math.PI / 1.7 : 0; coverGroup.rotation.x += (targetRotX - coverGroup.rotation.x) * 0.15;
  if (rotorMesh) { const rotationPerSec = (realRpm / 60) * (2 * Math.PI); rotorMesh.rotation.x += rotationPerSec * dt; }
  renderer.render(scene, camera);
}
animate();
// À la toute fin de main.ts :
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});