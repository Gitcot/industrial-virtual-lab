# backend/app/main.py
import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.simulation.solver import SimulationSolver
from app.simulation.builder import load_circuit_from_json
from app.simulation.components import PushButton

app = FastAPI(title="Industrial Virtual Lab API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_circuit() -> tuple[SimulationSolver, dict]:
    """Charge et instancie le circuit à partir du schéma JSON de configuration."""
    schema_path = os.path.join(os.path.dirname(
        __file__), "schemas", "dism_circuit.json")
    return load_circuit_from_json(schema_path)


@app.websocket("/ws/simulation")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[+] Client connecté au laboratoire 3D")

    solver, components = build_circuit()

    async def simulation_loop():
        try:
            while True:
                # 1. Remise à zéro des câbles
                for net in solver.nets:
                    net.reset()

                # 2. Résolution multi-passes (3 passes pour stabiliser l'auto-maintien)
                for _ in range(3):
                    for comp in solver.components:
                        comp.evaluate()

                # 3. Mise à jour des états physiques des composants
                for comp in solver.components:
                    comp.update_state()

                state = {
                    "km1_energized": components["km1"].is_energized,
                    "motor_running": components["motor"].is_running,
                    "fault_active": components["thermal_f1"].is_tripped
                }
                await websocket.send_text(json.dumps(state))
                await asyncio.sleep(0.05)
        except Exception:
            pass

    loop_task = asyncio.create_task(simulation_loop())

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            action = payload.get("action")
            target = payload.get("target")

            # Action sur les boutons poussoirs (START, STOP)
            if target in components and isinstance(components[target], PushButton):
                if action == "press":
                    components[target].press()
                elif action == "release":
                    components[target].release()

            # Action sur le Relais Thermique F1 (Déclenchement / Réarmement)
            elif target == "thermal_f1":
                if action == "trip":
                    components["thermal_f1"].trip()
                elif action == "reset":
                    components["thermal_f1"].reset()

    except WebSocketDisconnect:
        print("[-] Client déconnecté")
    finally:
        loop_task.cancel()
