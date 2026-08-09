# 🏭 Industrial Virtual Lab - Jumeau Numérique 3D

Une simulation 3D interactive, physique et temps réel d'un système de commande de moteur asynchrone industriel. 
Ce projet éducatif et technique connecte un frontend 3D immersif (Three.js) à un solveur électrique physique en backend (FastAPI / Python) via WebSockets.

![Version](https://img.shields.io/badge/Version-V0.8-blue)
![Stack](https://img.shields.io/badge/Stack-Three.js%20%7C%20FastAPI%20%7C%20WebSockets-success)

---

## ✨ Fonctionnalités Principales (V0.8)

*   **Simulation Électrique Complète :** Le backend calcule l'état du circuit en temps réel. Il gère l'alimentation, les boutons poussoirs, les relais thermiques, les contacteurs de puissance et les relais temporisés.
*   **Deux Modes de Démarrage :**
    *   **Direct :** Couplage manuel par barrettes (Étoile ou Triangle) dans la boîte à bornes.
    *   **Automatique Y/Δ (Étoile-Triangle) :** Couplage dynamique géré par un coffret de commande distant avec 3 contacteurs (KM1, KM2, KM3) et un relais temporisé à 3 secondes.
*   **Sécurité Industrielle (Interlock) :** Un couvercle de protection sur la boîte à bornes empêche le démarrage s'il est ouvert et provoque un arrêt d'urgence s'il est retiré en marche.
*   **Outil de Diagnostic (Multimètre 3D) :** Placez des pointes de touches virtuelles sur le bornier pour mesurer la tension (400V) en temps réel. Inclut une "Clé de Bypass" pour simuler un mode de maintenance sous tension.
*   **Design Sonore Industriel :** Génération audio dynamique (Web Audio API) reproduisant le claquement mécanique des contacteurs, l'alarme de défaut thermique, et le bourdonnement du moteur (35Hz en Étoile, 50Hz en Triangle).
*   **Animations Physiques :** Inertie réaliste du rotor lors de l'accélération et de la décélération, câblage dynamique qui s'illumine sous tension, et LEDs d'état sur le pupitre.

---

## 🛠️ Stack Technique

### Frontend (L'Interface et la 3D)
*   **TypeScript** & **HTML/CSS** pur (Pas de framework lourd).
*   **Three.js** : Moteur 3D pour le rendu du moteur, du coffret, des câbles et du multimètre.
*   **Vite** : Bundler ultra-rapide.

### Backend (Le Cerveau Électrique)
*   **Python 3**
*   **FastAPI** : Serveur asynchrone ultra-performant.
*   **WebSockets (asyncio)** : Communication bidirectionnelle en temps réel (50ms) entre la logique électrique et l'affichage 3D.

---

## 📂 Structure du Projet

```text
industrial-virtual-lab/
├── backend/
│   ├── app/
│   │   ├── main.py                 # Serveur FastAPI et logique WebSocket
│   │   ├── schemas/                # Fichiers JSON décrivant les circuits (Direct, Étoile-Triangle)
│   │   └── simulation/
│   │       ├── builder.py          # Parseur JSON -> Objets Python
│   │       ├── components.py       # Logique des composants (Contacteurs, Relais Temporisés, etc.)
│   │       ├── core.py             # Moteur de base (Nœuds, Composants)
│   │       └── solver.py           # Solveur de circuit électrique
│   └── requirements.txt            # Dépendances Python
│
├── frontend/
│   ├── index.html                  # Interface utilisateur (UI) superposée
│   ├── package.json                # Dépendances Node.js (Vite, Three.js)
│   ├── public/
│   │   └── assets/                 # Modèles 3D (.glb du moteur)
│   └── src/
│       └── main.ts                 # Logique 3D complète, Audio et connexion WebSocket