# backend/app/main.py
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.simulation.solver import SimulationSolver
from app.simulation.components import PowerSource, PushButton, Contactor, Motor, ThermalRelay
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
        "thermal_f1": ThermalRelay("F1_THERMAL"),
        "btn_stop": PushButton("S1_STOP", normally_closed=True),
        "btn_start": PushButton("S2_START", normally_closed=False),
        "km1": Contactor("KM1"),
        "motor": Motor("M1_Moteur")
    }

    net_24v = ElectricalNet("24V")
    net_after_f1 = ElectricalNet("AFTER_F1")
    net_mid = ElectricalNet("MID")
    net_coil = ElectricalNet("COIL")
    net_t1, net_t2, net_t3 = ElectricalNet(
        "T1"), ElectricalNet("T2"), ElectricalNet("T3")

    # 1. Alimentation -> Relais Thermique F1 (NC 95-96)
    components["power"].connect("OUT", net_24v)
    components["thermal_f1"].connect("95", net_24v)
    components["thermal_f1"].connect("96", net_after_f1)

    # 2. F1 -> Bouton STOP (NC 11-12)
    components["btn_stop"].connect("IN", net_after_f1)
    components["btn_stop"].connect("OUT", net_mid)

    # 3. STOP -> Bouton START (NO 13-14) & Bobine KM1 (A1)
    components["btn_start"].connect("IN", net_mid)
    components["btn_start"].connect("OUT", net_coil)
    components["km1"].connect("A1", net_coil)

    # 4. Auto-maintien Contact Auxiliaire KM1 (13-14)
    components["km1"].connect("13", net_mid)
    components["km1"].connect("14", net_coil)

    # 5. Circuit de Puissance
    components["km1"].connect("L1", net_24v)
    components["km1"].connect("L2", net_24v)
    components["km1"].connect("L3", net_24v)
    components["km1"].connect("T1", net_t1)
    components["km1"].connect("T2", net_t2)
    components["km1"].connect("T3", net_t3)

    components["motor"].connect("L1", net_t1)
    components["motor"].connect("L2", net_t2)
    components["motor"].connect("L3", net_t3)

    for comp in components.values():
        solver.add_component(comp)

    for net in [net_24v, net_after_f1, net_mid, net_coil, net_t1, net_t2, net_t3]:
        solver.add_net(net)

    return solver, components


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

                # 2. Resolution multi-passes
                for _ in range(3):
                    for comp in solver.components:
                        comp.evaluate()

                # 3. Mise à jour physique
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
        print("[-] Client déconnecté")
    finally:
        loop_task.cancel()
