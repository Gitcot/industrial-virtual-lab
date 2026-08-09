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
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)


def build_circuit(mode: str = "direct") -> tuple[SimulationSolver, dict]:
    file_name = "star_delta_circuit.json" if mode == "star_delta" else "dism_circuit.json"
    schema_path = os.path.join(os.path.dirname(__file__), "schemas", file_name)
    return load_circuit_from_json(schema_path)


@app.websocket("/ws/simulation")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # SOLUTION : Utiliser un dictionnaire de contexte partagé pour que
    # la boucle de simulation et le récepteur WebSocket utilisent toujours le même circuit.
    sim_context = {}
    sim_context["solver"], sim_context["components"] = build_circuit("direct")

    async def simulation_loop():
        try:
            while True:
                # Récupération dynamique du circuit actuel
                solver = sim_context["solver"]
                components = sim_context["components"]

                for net in solver.nets:
                    net.reset()

                for _ in range(3):
                    for comp in solver.components:
                        comp.evaluate()

                for comp in solver.components:
                    comp.update_state()

                km1 = components.get("km1")
                km2 = components.get("km2")
                km3 = components.get("km3")
                motor = components.get("motor")
                f1 = components.get("thermal_f1")

                state = {
                    "km1_energized": km1.is_energized if km1 else False,
                    "km2_energized": km2.is_energized if km2 else False,
                    "km3_energized": km3.is_energized if km3 else False,
                    "motor_running": motor.is_running if motor else False,
                    "fault_active": f1.is_tripped if f1 else False
                }
                await websocket.send_text(json.dumps(state))
                await asyncio.sleep(0.05)
        except Exception as e:
            print(f"Erreur simulation: {e}")

    loop_task = asyncio.create_task(simulation_loop())

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            action = payload.get("action")
            target = payload.get("target")

            if action == "change_mode":
                # On met à jour le contexte partagé !
                sim_context["solver"], sim_context["components"] = build_circuit(
                    target)

            else:
                components = sim_context["components"]

                if target in components and isinstance(components[target], PushButton):
                    if action == "press":
                        components[target].press()
                    elif action == "release":
                        components[target].release()

                elif target == "thermal_f1":
                    if action == "trip":
                        components["thermal_f1"].trip()
                    elif action == "reset":
                        components["thermal_f1"].reset()

    except WebSocketDisconnect:
        pass
    finally:
        loop_task.cancel()
