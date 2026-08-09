import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --- 1. INITIALISATION DE LA SCÈNE ---
const container = document.getElementById('app')!;
const scene = new THREE.Scene();

// Ajout d'une grille de repère au sol (esprit industriel)
const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x222222);
scene.add(gridHelper);

// --- 2. CAMÉRA ET RENDU ---
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
// On positionne la caméra pour avoir une belle vue isométrique
camera.position.set(100, 80, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// Important pour un rendu réaliste des métaux/plastiques (PBR)
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// --- 3. CONTRÔLES (Souris/Tactile) ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Ajoute de la fluidité aux mouvements
controls.dampingFactor = 0.05;

// --- 4. ÉCLAIRAGE (Crucial pour la 3D) ---
// Lumière d'ambiance globale
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

// Lumière directionnelle (simule un plafonnier d'usine)
const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(50, 100, 50);
scene.add(directionalLight);

// --- 5. CHARGEMENT DE L'ASSET ---
const loader = new GLTFLoader();
const statusText = document.getElementById('status')!;

// On va charger le moteur qu'on vient de générer
const assetUrl = '/assets/MOTOR.glb';

loader.load(
  assetUrl,
  (gltf) => {
    // Succès !
    const model = gltf.scene;
    scene.add(model);
    statusText.innerText = 'Composant : Moteur Asynchrone';

    // Centrer la caméra sur l'objet
    controls.target.set(0, 30, 0); // Le moteur fait ~120mm de haut, on vise le centre
  },
  (progress) => {
    // En cours de téléchargement
    const percent = Math.round((progress.loaded / progress.total) * 100);
    statusText.innerText = `Chargement... ${percent}%`;
  },
  (error) => {
    // Erreur
    console.error("Erreur de chargement du GLB :", error);
    statusText.innerText = "Erreur de chargement.";
  }
);

// --- 6. GESTION DU REDIMENSIONNEMENT ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 7. BOUCLE D'ANIMATION ---
function animate() {
  requestAnimationFrame(animate);
  controls.update(); // Nécessaire pour le damping
  renderer.render(scene, camera);
}

// Lancement du moteur
animate();
// --- 8. COMMUNICATION TEMPS RÉEL (WEBSOCKET) ---
// Remarque : Si tu es sur Codespaces, assure-toi que le port 8000 est bien en visibilité "Public" dans l'onglet "Ports"
// --- 8. COMMUNICATION TEMPS RÉEL (WEBSOCKET) ---
let wsUrl = 'ws://localhost:8000/ws/simulation';

// Détection automatique de GitHub Codespaces
if (window.location.hostname.includes('github.dev')) {
  // 1. On utilise WSS (WebSocket Secure) car Codespaces force le HTTPS
  // 2. On change le port 5173 (Frontend) en 8000 (Backend) dans l'URL magique de GitHub
  const backendHost = window.location.hostname.replace('5173', '8000');
  wsUrl = `wss://${backendHost}/ws/simulation`;
}

const ws = new WebSocket(wsUrl);
const statusWsText = document.getElementById('status')!;

// Variables d'état du circuit (dictées par le Backend)
let isMotorRunning = false;
let isContactorEnergized = false;

ws.onopen = () => {
  statusWsText.innerText = "🟢 Connecté au Solveur Physique";
  statusWsText.style.color = "#2ecc71";
};

ws.onclose = () => {
  statusWsText.innerText = "🔴 Déconnecté du Solveur";
  statusWsText.style.color = "#e74c3c";
};

// Réception de la physique calculée par le Backend
ws.onmessage = (event) => {
  const state = JSON.parse(event.data);
  isContactorEnergized = state.km1_energized;
  isMotorRunning = state.motor_running;

  // Log pour le débug
  console.log(`[Solveur] KM1: ${isContactorEnergized ? 'FERMÉ' : 'OUVERT'} | Moteur: ${isMotorRunning ? 'TOURNE' : 'ARRÊTÉ'}`);
};

// --- 9. INTERACTION PUPITRE ---
const btnStart = document.getElementById('btn-start')!;
const btnStop = document.getElementById('btn-stop')!;

// Gestion du Bouton START (Poussoir)
btnStart.addEventListener('mousedown', () => ws.send(JSON.stringify({ action: "press", target: "btn_start" })));
btnStart.addEventListener('mouseup', () => ws.send(JSON.stringify({ action: "release", target: "btn_start" })));
btnStart.addEventListener('mouseleave', () => ws.send(JSON.stringify({ action: "release", target: "btn_start" }))); // Sécurité

// Gestion du Bouton STOP (Poussoir)
btnStop.addEventListener('mousedown', () => ws.send(JSON.stringify({ action: "press", target: "btn_stop" })));
btnStop.addEventListener('mouseup', () => ws.send(JSON.stringify({ action: "release", target: "btn_stop" })));
btnStop.addEventListener('mouseleave', () => ws.send(JSON.stringify({ action: "release", target: "btn_stop" }))); // Sécurité

// --- 10. MISE À JOUR DE L'ANIMATION 3D ---
// Nous surchargeons la boucle d'animation existante pour inclure la rotation du moteur
const originalAnimate = animate; // On garde une référence (bien que dans ce cas, on pourrait juste modifier la fonction animate au dessus)

// On met à jour la fonction d'animation
function animateWithPhysics() {
  requestAnimationFrame(animateWithPhysics);
  controls.update();

  // Si le Backend dit que le moteur tourne, on fait tourner la scène complète (pour l'exemple)
  // Idéalement, on chercherait l'objet "Rotor" dans le GLB pour ne tourner que lui.
  if (isMotorRunning && scene.children.length > 0) {
    // On fait tourner le premier objet 3D trouvé (notre moteur) sur l'axe Y
    scene.children.forEach(child => {
      if (child.type === "Group") { // Le modèle GLB est souvent chargé comme un Group
        child.rotation.y += 0.1; // Vitesse de rotation
      }
    });
  }

  renderer.render(scene, camera);
}

// On remplace l'ancienne boucle par la nouvelle
animate = () => { }; // Neutralise l'ancienne
animateWithPhysics(); // Lance la nouvelle connectée à la physique