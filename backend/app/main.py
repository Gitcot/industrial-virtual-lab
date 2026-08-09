# backend/app/main.py
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.simulation.solver import SimulationSolver
from app.simulation.components import PowerSource, PushButton, Contactor, Motor
from app.simulation.core import ElectricalNet

app = FastAPI(title="Industrial Virtual Lab API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_circuit() -> tuple[SimulationSolver, dict]:
    solver = SimulationSolver()

    components = {
        "power": PowerSource("Alim_24V"),
        "btn_stop": PushButton("S1_STOP", normally_closed=True),
        "btn_start": PushButton("S2_START", normally_closed=False),
        "km1": Contactor("KM1"),
        "motor": Motor("M1_Moteur")
    }

    # 1. Création EXPLICITE de tous les câbles (Nets)
    net_24v = ElectricalNet("24V")
    net_mid = ElectricalNet("MID")
    net_coil = ElectricalNet("COIL")
    net_t1 = ElectricalNet("T1")
    net_t2 = ElectricalNet("T2")
    net_t3 = ElectricalNet("T3")

    # Commande
    components["power"].connect("OUT", net_24v)
    components["btn_stop"].connect("IN", net_24v)
    components["btn_stop"].connect("OUT", net_mid)

    components["btn_start"].connect("IN", net_mid)
    components["btn_start"].connect("OUT", net_coil)
    components["km1"].connect("A1", net_coil)

    # Auto-maintien
    components["km1"].connect("13", net_mid)
    components["km1"].connect("14", net_coil)

    # Puissance
    components["km1"].connect("L1", net_24v)
    components["km1"].connect("L2", net_24v)
    components["km1"].connect("L3", net_24v)
    components["km1"].connect("T1", net_t1)
    components["km1"].connect("T2", net_t2)
    components["km1"].connect("T3", net_t3)

    components["motor"].connect("L1", net_t1)
    components["motor"].connect("L2", net_t2)
    components["motor"].connect("L3", net_t3)

    # 2. Ajout de TOUS les composants et TOUS les câbles au Solveur
    for comp in components.values():
        solver.add_component(comp)

    for net in [net_24v, net_mid, net_coil, net_t1, net_t2, net_t3]:
        solver.add_net(net)

    return solver, components


@app.websocket("/ws/simulation")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[+] Nouveau client connecté au laboratoire 3D")

    solver, components = build_circuit()

    # Tâche de fond : Le Solveur tourne en continu (20 ticks/seconde)
    async def simulation_loop():
        try:
            while True:
                solver.tick()
                state = {
                    "km1_energized": components["km1"].is_energized,
                    "motor_running": components["motor"].is_running
                }
                await websocket.send_text(json.dumps(state))
                await asyncio.sleep(0.05)  # 50ms par tick
        except Exception:
            pass

    # Lancement de la boucle de simulation en arrière-plan
    loop_task = asyncio.create_task(simulation_loop())

    try:
        while True:
            # Écoute asynchrone des actions de l'utilisateur (souris sur les boutons)
            data = await websocket.receive_text()
            payload = json.loads(data)

            action = payload.get("action")
            target = payload.get("target")

            if target in components and isinstance(components[target], PushButton):
                if action == "press":
                    components[target].press()
                elif action == "release":
                    components[target].release()

    except WebSocketDisconnect:
        print("[-] Client déconnecté")
    finally:
        loop_task.cancel()
