import os
import json
import asyncio
import random
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.simulation.solver import SimulationSolver
from app.simulation.builder import load_circuit_from_json
from app.simulation.components import PushButton, Contactor

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
    
    sim_context = {}
    sim_context["mode"] = "direct"
    sim_context["active_fault_clue"] = None
    sim_context["solver"], sim_context["components"] = build_circuit("direct")
    
    async def simulation_loop():
        try:
            while True:
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

                # NOUVEAU : Envoi de l'état de santé des bobines pour l'ohmmètre
                state = {
                    "km1_energized": km1.is_energized if km1 else False,
                    "km2_energized": km2.is_energized if km2 else False,
                    "km3_energized": km3.is_energized if km3 else False,
                    "km1_broken": getattr(km1, 'is_broken', False) if km1 else False,
                    "km2_broken": getattr(km2, 'is_broken', False) if km2 else False,
                    "km3_broken": getattr(km3, 'is_broken', False) if km3 else False,
                    "motor_running": motor.is_running if motor else False,
                    "fault_active": f1.is_tripped if f1 else False,
                    "fault_clue": sim_context["active_fault_clue"]
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
                sim_context["mode"] = target
                sim_context["active_fault_clue"] = None
                sim_context["solver"], sim_context["components"] = build_circuit(target)
            
            elif action == "generate_fault":
                components = sim_context["components"]
                mode = sim_context["mode"]
                
                candidates = ["km1"] if mode == "direct" else ["km1", "km2", "km3"]
                valid_candidates = [c for c in candidates if c in components]
                
                if valid_candidates:
                    faulty_id = random.choice(valid_candidates)
                    components[faulty_id].is_broken = True
                    
                    symptoms = {
                        "km1": "Symptôme : Le moteur ne réagit absolument pas.\nIndice : Le contacteur de ligne (KM1) ne ferme pas son circuit de puissance. Testez sa bobine à l'ohmmètre.",
                        "km2": "Symptôme : Le moteur grogne mais ne tourne pas.\nIndice : Le point neutre ne se fait pas. La bobine du contacteur Étoile (KM2) semble coupée.",
                        "km3": "Symptôme : Démarrage OK, puis coupure nette après 3s.\nIndice : Le passage en pleine puissance a échoué. La bobine du contacteur Triangle (KM3) est grillée."
                    }
                    sim_context["active_fault_clue"] = symptoms[faulty_id]
                    print(f"⚠️ PANNE GÉNÉRÉE : Bobine de {faulty_id.upper()} grillée !")

            elif action == "replace_part":
                components = sim_context["components"]
                if target in components and isinstance(components[target], Contactor):
                    components[target].is_broken = False
                    print(f"✅ Remplacement de {target.upper()} effectué.")
                
                all_repaired = True
                for comp in components.values():
                    if getattr(comp, "is_broken", False):
                        all_repaired = False
                if all_repaired:
                    sim_context["active_fault_clue"] = None
            
            else:
                components = sim_context["components"]
                if target in components and isinstance(components[target], PushButton):
                    if action == "press": components[target].press()
                    elif action == "release": components[target].release()
                elif target == "thermal_f1":
                    if action == "trip": components["thermal_f1"].trip()
                    elif action == "reset": components["thermal_f1"].reset()
                        
    except WebSocketDisconnect:
        pass
    finally:
        loop_task.cancel()