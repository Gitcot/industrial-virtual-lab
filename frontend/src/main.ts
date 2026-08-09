import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --- 1. INITIALISATION DE LA SCÈNE ---
const container = document.getElementById('app')!;
const scene = new THREE.Scene();

const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x222222);
scene.add(gridHelper);

// --- 2. CAMÉRA ET RENDU ---
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(100, 80, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// --- 3. CONTRÔLES ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- 4. ÉCLAIRAGE ---
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(50, 100, 50);
scene.add(directionalLight);

// --- 5. CRÉATION DES 3 LEDS 3D (BOÎTIER DE SIGNALISATION) ---
function createIndicatorPanel() {
  const panelGroup = new THREE.Group();
  panelGroup.position.set(-60, 15, 0); // Positionné à côté du moteur

  // Support noir des LEDs
  const baseGeometry = new THREE.BoxGeometry(20, 50, 15);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.5 });
  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  panelGroup.add(baseMesh);

  // Géométrie des cabochons de LEDs
  const ledGeometry = new THREE.CylinderGeometry(4, 4, 4, 16);

  // LED VERTE (MARCHE)
  const matGreen = new THREE.MeshStandardMaterial({ color: 0x004400, emissive: 0x000000, roughness: 0.2 });
  const ledGreen = new THREE.Mesh(ledGeometry, matGreen);
  ledGreen.position.set(0, 15, 8);
  ledGreen.rotation.x = Math.PI / 2;
  panelGroup.add(ledGreen);

  // LED ROUGE (ARRÊT)
  const matRed = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0x000000, roughness: 0.2 });
  const ledRed = new THREE.Mesh(ledGeometry, matRed);
  ledRed.position.set(0, 0, 8);
  ledRed.rotation.x = Math.PI / 2;
  panelGroup.add(ledRed);

  // LED ORANGE (DÉFAUT)
  const matOrange = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0x000000, roughness: 0.2 });
  const ledOrange = new THREE.Mesh(ledGeometry, matOrange);
  ledOrange.position.set(0, -15, 8);
  ledOrange.rotation.x = Math.PI / 2;
  panelGroup.add(ledOrange);

  scene.add(panelGroup);

  return { matGreen, matRed, matOrange };
}

const leds = createIndicatorPanel();

// --- 6. CHARGEMENT DU MOTEUR ---
const loader = new GLTFLoader();
const statusText = document.getElementById('status')!;

const motorGroup = new THREE.Group();
scene.add(motorGroup);

let rotorMesh: THREE.Object3D | null = null;

loader.load('/assets/MOTOR_STATOR.glb', (gltf) => motorGroup.add(gltf.scene));
loader.load('/assets/MOTOR_ROTOR.glb', (gltf) => {
  rotorMesh = gltf.scene;
  motorGroup.add(rotorMesh);
});

controls.target.set(0, 0, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 7. WEBSOCKET & MISE À JOUR DES LEDS ---
let wsUrl = 'ws://localhost:8000/ws/simulation';
if (window.location.hostname.includes('github.dev')) {
  const backendHost = window.location.hostname.replace('5173', '8000');
  wsUrl = `wss://${backendHost}/ws/simulation`;
}

const ws = new WebSocket(wsUrl);

let isMotorRunning = false;
let isFaultActive = false;

ws.onopen = () => {
  statusText.innerText = "🟢 Connecté au Solveur Physique";
  statusText.style.color = "#2ecc71";
};

ws.onclose = () => {
  statusText.innerText = "🔴 Déconnecté du Solveur";
  statusText.style.color = "#e74c3c";
};

ws.onmessage = (event) => {
  const state = JSON.parse(event.data);
  isMotorRunning = state.motor_running;
  isFaultActive = state.fault_active;

  // --- LOGIQUE D'ALLUMAGE DES LEDS 3D ---
  if (isFaultActive) {
    // 1. État DÉFAUT : Voyant Orange Émis, Rouge & Vert Éteints
    leds.matOrange.emissive.setHex(0xffaa00);
    leds.matGreen.emissive.setHex(0x000000);
    leds.matRed.emissive.setHex(0x000000);
    statusText.innerText = "⚠️ DÉFAUT THERMIQUE ACTIF";
    statusText.style.color = "#e67e22";
  } else if (isMotorRunning) {
    // 2. État MARCHE : Voyant Vert Émis
    leds.matGreen.emissive.setHex(0x00ff00);
    leds.matRed.emissive.setHex(0x000000);
    leds.matOrange.emissive.setHex(0x000000);
    statusText.innerText = "🟢 MOTEUR EN MARCHE";
    statusText.style.color = "#2ecc71";
  } else {
    // 3. État ARRÊT (au repos) : Voyant Rouge Émis
    leds.matRed.emissive.setHex(0xff0000);
    leds.matGreen.emissive.setHex(0x000000);
    leds.matOrange.emissive.setHex(0x000000);
    statusText.innerText = "🔴 CIRCUIT AU REPOS";
    statusText.style.color = "#e74c3c";
  }
};

// --- 8. INTERACTION PUPITRE ---
const btnStart = document.getElementById('btn-start')!;
const btnStop = document.getElementById('btn-stop')!;
const btnTrip = document.getElementById('btn-trip')!;
const btnReset = document.getElementById('btn-reset')!;

// START (Impulsion)
btnStart.addEventListener('mousedown', () => ws.send(JSON.stringify({ action: "press", target: "btn_start" })));
btnStart.addEventListener('mouseup', () => ws.send(JSON.stringify({ action: "release", target: "btn_start" })));
btnStart.addEventListener('mouseleave', () => ws.send(JSON.stringify({ action: "release", target: "btn_start" })));

// STOP (Impulsion)
btnStop.addEventListener('mousedown', () => ws.send(JSON.stringify({ action: "press", target: "btn_stop" })));
btnStop.addEventListener('mouseup', () => ws.send(JSON.stringify({ action: "release", target: "btn_stop" })));
btnStop.addEventListener('mouseleave', () => ws.send(JSON.stringify({ action: "release", target: "btn_stop" })));

// TEST DÉFAUT (Verrouille le défaut F1)
btnTrip.addEventListener('click', () => ws.send(JSON.stringify({ action: "trip", target: "thermal_f1" })));

// RÉARMER (Acquitte le défaut F1)
btnReset.addEventListener('click', () => ws.send(JSON.stringify({ action: "reset", target: "thermal_f1" })));
// --- 9. ANIMATION 3D ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (isMotorRunning && rotorMesh) {
    rotorMesh.rotation.x += 0.2;
  }

  renderer.render(scene, camera);
}

animate();