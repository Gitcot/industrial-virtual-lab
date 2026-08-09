import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --- 1. INITIALISATION DE LA SCÈNE ---
const container = document.getElementById('app')!;
const scene = new THREE.Scene();

// Grille de repère au sol
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

// --- 3. CONTRÔLES (Souris) ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- 4. ÉCLAIRAGE ---
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(50, 100, 50);
scene.add(directionalLight);

// --- 5. CHARGEMENT DU MOTEUR (STATOR + ROTOR SÉPARÉS) ---
const loader = new GLTFLoader();
const statusText = document.getElementById('status')!;

// Groupe parent pour regrouper le Stator et le Rotor
const motorGroup = new THREE.Group();
scene.add(motorGroup);

// Référence vers l'objet 3D du Rotor (partie mobile)
let rotorMesh: THREE.Object3D | null = null;

// A. Chargement du Stator (Partie fixe)
loader.load(
  '/assets/MOTOR_STATOR.glb',
  (gltf) => {
    motorGroup.add(gltf.scene);
  },
  undefined,
  (err) => console.error('Erreur lors du chargement du Stator :', err)
);

// B. Chargement du Rotor (Partie mobile)
loader.load(
  '/assets/MOTOR_ROTOR.glb',
  (gltf) => {
    rotorMesh = gltf.scene;
    motorGroup.add(rotorMesh);
    statusText.innerText = 'Composant : Moteur Asynchrone (Stator & Rotor)';
  },
  undefined,
  (err) => console.error('Erreur lors du chargement du Rotor :', err)
);

controls.target.set(0, 0, 0);

// --- 6. GESTION DU REDIMENSIONNEMENT ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 7. COMMUNICATION TEMPS RÉEL (WEBSOCKET) ---
let wsUrl = 'ws://localhost:8000/ws/simulation';

// Détection automatique pour GitHub Codespaces
if (window.location.hostname.includes('github.dev')) {
  const backendHost = window.location.hostname.replace('5173', '8000');
  wsUrl = `wss://${backendHost}/ws/simulation`;
}

const ws = new WebSocket(wsUrl);

let isMotorRunning = false;
let isContactorEnergized = false;

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
  isContactorEnergized = state.km1_energized;
  isMotorRunning = state.motor_running;
};

// --- 8. INTERACTION PUPITRE ---
const btnStart = document.getElementById('btn-start')!;
const btnStop = document.getElementById('btn-stop')!;

btnStart.addEventListener('mousedown', () => ws.send(JSON.stringify({ action: "press", target: "btn_start" })));
btnStart.addEventListener('mouseup', () => ws.send(JSON.stringify({ action: "release", target: "btn_start" })));
btnStart.addEventListener('mouseleave', () => ws.send(JSON.stringify({ action: "release", target: "btn_start" })));

btnStop.addEventListener('mousedown', () => ws.send(JSON.stringify({ action: "press", target: "btn_stop" })));
btnStop.addEventListener('mouseup', () => ws.send(JSON.stringify({ action: "release", target: "btn_stop" })));
btnStop.addEventListener('mouseleave', () => ws.send(JSON.stringify({ action: "release", target: "btn_stop" })));

// --- 9. BOUCLE D'ANIMATION TEMPS RÉEL ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Rotation exclusive du ROTOR sur l'axe X si le moteur est alimenté
  if (isMotorRunning && rotorMesh) {
    rotorMesh.rotation.x += 0.2;
  }

  renderer.render(scene, camera);
}

animate();