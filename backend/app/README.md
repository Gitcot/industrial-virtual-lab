# 🏭 Industrial Virtual Lab - MVP

Un laboratoire virtuel industriel en 3D temps réel, conçu pour simuler des circuits électrotechniques et des équipements industriels dans le cloud.

## 🏗️ Architecture du Projet

Ce projet est divisé en 3 micro-services :

1. **Asset Factory (Pipeline 3D)** :
   - Moteur : CadQuery (OpenCascade) & Trimesh
   - Rôle : Génération paramétrique de composants industriels (STEP) et conversion optimisée pour le web (GLB).

2. **Moteur Physique & Backend** :
   - Moteur : Python / FastAPI / WebSockets
   - Rôle : Solveur *Tick-Based* (20Hz) simulant la propagation électrique, l'inertie mécanique et l'auto-maintien des contacteurs.

3. **Interface 3D & Frontend** :
   - Moteur : Vite / TypeScript / Three.js
   - Rôle : Rendu WebGL (PBR), interface pupitre, et communication bidirectionnelle (WSS) avec le solveur.

## 🚀 Démarrage Rapide (Codespaces)

**1. Lancer le Backend Physique :**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000