import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --- 1. INITIALISATION DE LA SCÈNE ---
const container = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d24);

const gridHelper = new THREE.GridHelper(300, 60, 0x00d2ff, 0x333b4d);
scene.add(gridHelper);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 110, 160);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- 2. ÉCLAIRAGE ---
const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
scene.add(ambientLight);
const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.5);
dirLight1.position.set(80, 150, 100);
scene.add(dirLight1);
const dirLight2 = new THREE.DirectionalLight(0x00d2ff, 1.0);
dirLight2.position.set(-80, 100, -80);
scene.add(dirLight2);

// --- 3. VARIABLES GLOBALES DE SÉCURITÉ ET COUPLAGE ---
let isCoverOpen = false;
let currentCoupling = 'star'; // 'star' ou 'delta'
let isMotorRunning = false;
let isContactorEnergized = false;
let isFaultActive = false;

// Matériaux dynamiques pour les nouvelles LEDs du pupitre
let panelLedOrangeMat: THREE.MeshStandardMaterial;
let panelLedBlueMat: THREE.MeshStandardMaterial;

// Objets 3D manipulables
let coverGroup: THREE.Group;
let starStrap: THREE.Mesh;
let deltaStraps: THREE.Group;
const interactiveButtons: THREE.Mesh[] = [];

// --- 4. BOÎTIER LEDS 3D (Mur) ---
function createIndicatorPanel() {
  const panelGroup = new THREE.Group();
  panelGroup.position.set(-70, 20, 0);

  const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(22, 55, 18), new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.4 }));
  panelGroup.add(baseMesh);

  const ledGeo = new THREE.CylinderGeometry(5, 5, 5, 24);
  const matGreen = new THREE.MeshStandardMaterial({ color: 0x004400, emissive: 0x000000 });
  const ledGreen = new THREE.Mesh(ledGeo, matGreen);
  ledGreen.position.set(0, 16, 10); ledGreen.rotation.x = Math.PI / 2; panelGroup.add(ledGreen);

  const matRed = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0x000000 });
  const ledRed = new THREE.Mesh(ledGeo, matRed);
  ledRed.position.set(0, 0, 10); ledRed.rotation.x = Math.PI / 2; panelGroup.add(ledRed);

  const matOrange = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0x000000 });
  const ledOrange = new THREE.Mesh(ledGeo, matOrange);
  ledOrange.position.set(0, -16, 10); ledOrange.rotation.x = Math.PI / 2; panelGroup.add(ledOrange);

  scene.add(panelGroup);
  return { matGreen, matRed, matOrange };
}
const leds = createIndicatorPanel();

// --- 5. PUPITRE DE COMMANDE 3D ---
function create3DPushButtons() {
  const panelGroup = new THREE.Group();
  panelGroup.position.set(60, 12, 20);

  const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(70, 20, 35), new THREE.MeshStandardMaterial({ color: 0x34495e }));
  panelGroup.add(baseMesh);

  // BOUTONS POUSSOIRS INTERACTIFS (START / STOP)
  const btnGeo = new THREE.CylinderGeometry(5, 5, 8, 32);
  const createBtn = (color: number, x: number, id: string, type: string) => {
    const btn = new THREE.Mesh(btnGeo, new THREE.MeshStandardMaterial({ color }));
    btn.position.set(x, 11, 0);
    btn.userData = { id, type, initialY: 11 };
    panelGroup.add(btn);
    interactiveButtons.push(btn);
  };
  createBtn(0x27ae60, -24, 'btn_start', 'pulse'); // START
  createBtn(0xc0392b, -8, 'btn_stop', 'pulse');   // STOP

  // NOUVELLES LEDS DE SIGNALISATION (Non-interactives en 3D)
  const ledGeo = new THREE.CylinderGeometry(4, 4, 3, 32);

  // LED Orange (Défaut)
  panelLedOrangeMat = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0x000000, roughness: 0.1, metalness: 0.8 });
  const ledOrangePanel = new THREE.Mesh(ledGeo, panelLedOrangeMat);
  ledOrangePanel.position.set(8, 11.5, 0); // Légèrement encastrée
  panelGroup.add(ledOrangePanel);

  // LED Bleue (Réarmement)
  panelLedBlueMat = new THREE.MeshStandardMaterial({ color: 0x001144, emissive: 0x000000, roughness: 0.1, metalness: 0.8 });
  const ledBluePanel = new THREE.Mesh(ledGeo, panelLedBlueMat);
  ledBluePanel.position.set(24, 11.5, 0);
  panelGroup.add(ledBluePanel);

  scene.add(panelGroup);
}
create3DPushButtons();

// --- 6. BOÎTE À BORNES MOTEUR (COUVERCLE & COUPLAGE) ---
function createTerminalBox() {
  const boxGroup = new THREE.Group();
  boxGroup.position.set(0, 32, -15);

  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(32, 18, 28), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
  boxGroup.add(boxMesh);

  const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 22), new THREE.MeshStandardMaterial({ color: 0xdedede }));
  plateMesh.position.y = 8;
  boxGroup.add(plateMesh);

  const studGeo = new THREE.CylinderGeometry(1, 1, 6, 16);
  const studMat = new THREE.MeshStandardMaterial({ color: 0xf39c12, metalness: 0.9, roughness: 0.2 });
  const positions = [
    { name: "W2", pos: [-8, 12, -6] }, { name: "U2", pos: [0, 12, -6] }, { name: "V2", pos: [8, 12, -6] },
    { name: "U1", pos: [-8, 12, 6] },  { name: "V1", pos: [0, 12, 6] },  { name: "W1", pos: [8, 12, 6] }
  ];
  positions.forEach(p => {
    const stud = new THREE.Mesh(studGeo, studMat);
    stud.position.set(p.pos[0], p.pos[1], p.pos[2]);
    boxGroup.add(stud);
  });

  const strapMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.1 });
  
  // Étoile
  starStrap = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 3), strapMat);
  starStrap.position.set(0, 13.5, -6);
  boxGroup.add(starStrap);

  // Triangle
  deltaStraps = new THREE.Group();
  const vStrapGeo = new THREE.BoxGeometry(3, 1.5, 15);
  [-8, 0, 8].forEach(x => {
    const ds = new THREE.Mesh(vStrapGeo, strapMat);
    ds.position.set(x, 13.5, 0);
    deltaStraps.add(ds);
  });
  deltaStraps.visible = false;
  boxGroup.add(deltaStraps);

  // Couvercle Transparent
  coverGroup = new THREE.Group();
  coverGroup.position.set(0, 9, -14); 

  const coverMat = new THREE.MeshPhysicalMaterial({
    color: 0xdddddd, metalness: 0.1, roughness: 0.1, transmission: 0.9, opacity: 1, transparent: true, side: THREE.DoubleSide
  });
  const coverMesh = new THREE.Mesh(new THREE.BoxGeometry(32, 2, 28), coverMat);
  coverMesh.position.set(0, 1, 14);
  coverMesh.userData = { id: 'cover', type: 'cover' };
  
  coverGroup.add(coverMesh);
  boxGroup.add(coverGroup);
  interactiveButtons.push(coverMesh);

  scene.add(boxGroup);
}
createTerminalBox();

// --- 7. CÂBLAGE INDUSTRIEL RÉALISTE ---
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

wires.push(buildIndustrialCable([new THREE.Vector3(60, 20, 20), new THREE.Vector3(30, 45, 10), new THREE.Vector3(-8, 44, -9)], 0x5c3a21, 0xff5500, "L1_PHASE"));
wires.push(buildIndustrialCable([new THREE.Vector3(60, 20, 15), new THREE.Vector3(25, 45, 5), new THREE.Vector3(0, 44, -9)], 0x111111, 0x00d2ff, "L2_PHASE"));
wires.push(buildIndustrialCable([new THREE.Vector3(60, 20, 10), new THREE.Vector3(20, 45, 0), new THREE.Vector3(8, 44, -9)], 0x7f8c8d, 0xffff00, "L3_PHASE"));
wires.push(buildIndustrialCable([new THREE.Vector3(60, 20, 5), new THREE.Vector3(15, 30, -20), new THREE.Vector3(0, 15, -25)], 0x27ae60, 0x2ecc71, "PE_GROUND", 1.8));

// --- 8. CHARGEMENT MOTEUR 3D ---
const loader = new GLTFLoader();
const motorGroup = new THREE.Group();
scene.add(motorGroup);
let rotorMesh: THREE.Object3D | null = null;
loader.load('/assets/MOTOR_STATOR.glb', (gltf) => motorGroup.add(gltf.scene));
loader.load('/assets/MOTOR_ROTOR.glb', (gltf) => { rotorMesh = gltf.scene; motorGroup.add(rotorMesh); });

// --- 9. ÉLÉMENTS HTML ---
const statusText = document.getElementById('status')!;
const btnCover = document.getElementById('btn-cover') as HTMLButtonElement;
const btnStar = document.getElementById('btn-star') as HTMLButtonElement;
const btnDelta = document.getElementById('btn-delta') as HTMLButtonElement;

function updateCouplingUI() {
  if (btnCover) btnCover.innerText = isCoverOpen ? "FERMER COUVERCLE" : "OUVRIR COUVERCLE";

  const canEdit = isCoverOpen && !isMotorRunning && !isContactorEnergized;

  if (btnStar && btnDelta) {
    if (canEdit) {
      btnStar.disabled = false; btnStar.style.cursor = 'pointer';
      btnStar.style.background = currentCoupling === 'star' ? '#d35400' : '#2980b9';

      btnDelta.disabled = false; btnDelta.style.cursor = 'pointer';
      btnDelta.style.background = currentCoupling === 'delta' ? '#d35400' : '#2980b9';
    } else {
      btnStar.disabled = true; btnStar.style.cursor = 'not-allowed'; btnStar.style.background = '#7f8c8d';
      btnDelta.disabled = true; btnDelta.style.cursor = 'not-allowed'; btnDelta.style.background = '#7f8c8d';
    }
  }

  starStrap.visible = (currentCoupling === 'star');
  deltaStraps.visible = (currentCoupling === 'delta');
}

if (btnStar) btnStar.addEventListener('click', () => { currentCoupling = 'star'; updateCouplingUI(); });
if (btnDelta) btnDelta.addEventListener('click', () => { currentCoupling = 'delta'; updateCouplingUI(); });

// --- 10. WEBSOCKET ET TEMPS RÉEL ---
let wsUrl = 'ws://localhost:8000/ws/simulation';
if (window.location.hostname.includes('github.dev')) {
  const backendHost = window.location.hostname.replace('5173', '8000');
  wsUrl = `wss://${backendHost}/ws/simulation`;
}
const ws = new WebSocket(wsUrl);

ws.onopen = () => { statusText.innerText = "🟢 Connecté au Solveur Physique"; statusText.style.color = "#2ecc71"; };
ws.onmessage = (event) => {
  const state = JSON.parse(event.data);
  isMotorRunning = state.motor_running;
  isFaultActive = state.fault_active;
  isContactorEnergized = state.km1_energized;

  updateCouplingUI(); 

  // Mise à jour de la LED 3D ORANGE (Défaut) sur le pupitre
  if (panelLedOrangeMat) {
    panelLedOrangeMat.emissive.setHex(isFaultActive ? 0xffaa00 : 0x000000);
  }

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

// --- 11. SÉCURITÉS & GESTION DES CLICS ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let activePressedMesh: THREE.Mesh | null = null;

function sendAction(id: string, type: string, action: string) {
  // SÉCURITÉ 1 : Anti-démarrage si couvercle ouvert
  if (id === 'btn_start' && action === 'press' && isCoverOpen) {
    statusText.innerText = "🔒 SÉCURITÉ : COUVERCLE OUVERT !";
    statusText.style.color = "#e74c3c";
    setTimeout(() => {
      if (!isMotorRunning && !isFaultActive) {
        statusText.innerText = "🔴 CIRCUIT AU REPOS";
        statusText.style.color = "#e74c3c";
      }
    }, 2000);
    return;
  }

  // Envoi normal
  if (type === 'pulse') ws.send(JSON.stringify({ action, target: id }));
  else if (type === 'trip' && action === 'press') ws.send(JSON.stringify({ action: 'trip', target: id }));
  else if (type === 'reset' && action === 'press') ws.send(JSON.stringify({ action: 'reset', target: id }));
}

function toggleCover() {
  if (!isCoverOpen) {
    // SÉCURITÉ 2 : Arrêt d'urgence si on ouvre en marche
    if (isMotorRunning) {
      sendAction('btn_stop', 'pulse', 'press');
      setTimeout(() => sendAction('btn_stop', 'pulse', 'release'), 100);
    }
    isCoverOpen = true;
  } else {
    isCoverOpen = false;
  }
  updateCouplingUI();
}

if (btnCover) btnCover.addEventListener('click', () => toggleCover());

window.addEventListener('pointermove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 - 0.05;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveButtons);
  document.body.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
});

window.addEventListener('pointerdown', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 - 0.05;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveButtons);

  if (intersects.length > 0) {
    const mesh = intersects[0].object as THREE.Mesh;
    
    if (mesh.userData.type === 'cover') {
      toggleCover();
    } else {
      activePressedMesh = mesh;
      mesh.position.y = mesh.userData.initialY - 3;
      sendAction(mesh.userData.id, mesh.userData.type, 'press');
    }
  }
});

window.addEventListener('pointerup', () => {
  if (activePressedMesh && activePressedMesh.userData.type !== 'cover') {
    activePressedMesh.position.y = activePressedMesh.userData.initialY;
    sendAction(activePressedMesh.userData.id, activePressedMesh.userData.type, 'release');
    activePressedMesh = null;
  }
});

// Évènements Boutons HTML (START / STOP)
const setupHTMLButton = (btnId: string, targetId: string) => {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('mousedown', () => sendAction(targetId, 'pulse', 'press'));
  btn.addEventListener('mouseup', () => sendAction(targetId, 'pulse', 'release'));
  btn.addEventListener('mouseleave', () => sendAction(targetId, 'pulse', 'release'));
};
setupHTMLButton('btn-start', 'btn_start');
setupHTMLButton('btn-stop', 'btn_stop');

// Évènement HTML pour le DÉFAUT
const btnTripHTML = document.getElementById('btn-trip');
if (btnTripHTML) {
  btnTripHTML.addEventListener('click', () => {
    sendAction('thermal_f1', 'trip', 'press');
  });
}

// Évènement HTML pour le RÉARMEMENT (Avec contrôle de la LED Bleue 3D)
const btnResetHTML = document.getElementById('btn-reset');
if (btnResetHTML) {
  btnResetHTML.addEventListener('mousedown', () => {
    if (panelLedBlueMat) panelLedBlueMat.emissive.setHex(0x0088ff); // Allume la LED 3D Bleue
    sendAction('thermal_f1', 'reset', 'press');
  });
  
  const turnOffBlue = () => {
    if (panelLedBlueMat) panelLedBlueMat.emissive.setHex(0x000000); // Éteint la LED 3D Bleue
  };
  
  btnResetHTML.addEventListener('mouseup', turnOffBlue);
  btnResetHTML.addEventListener('mouseleave', turnOffBlue);
}

// --- 12. ANIMATION ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  const targetRotX = isCoverOpen ? -Math.PI / 1.7 : 0;
  coverGroup.rotation.x += (targetRotX - coverGroup.rotation.x) * 0.15;

  if (isMotorRunning && rotorMesh) {
    rotorMesh.rotation.x += 0.2;
  }

  renderer.render(scene, camera);
}
animate();