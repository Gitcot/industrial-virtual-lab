import os
import json
import asyncio
import random
import time
import math
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.simulation.solver import SimulationSolver
from app.simulation.builder import load_circuit_from_json
from app.simulation.components import PushButton, Contactor

app = FastAPI(title="Industrial Virtual Lab API")

app.add_middleware(CORSMiddleware, allow_origins=[
                   "*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def build_circuit(mode: str = "direct") -> tuple[SimulationSolver, dict]:
    file_name = "star_delta_circuit.json" if mode == "star_delta" else "dism_circuit.json"
    schema_path = os.path.join(os.path.dirname(__file__), "schemas", file_name)
    return load_circuit_from_json(schema_path)


MOTOR_CATALOG = {
    "3.0_2p": {"Pn": 3.0, "Ns": 3000, "In": 5.9, "Id_ratio": 7.2, "Cn": 9.9, "Cmax_ratio": 2.5, "Jm": 0.003, "cos": 0.85, "name": "3.0 kW - 2 Pôles"},
    "7.5_4p": {"Pn": 7.5, "Ns": 1500, "In": 14.5, "Id_ratio": 6.8, "Cn": 49.0, "Cmax_ratio": 2.2, "Jm": 0.03, "cos": 0.82, "name": "7.5 kW - 4 Pôles"},
    "15.0_6p": {"Pn": 15.0, "Ns": 1000, "In": 30.0, "Id_ratio": 6.0, "Cn": 148.0, "Cmax_ratio": 2.0, "Jm": 0.15, "cos": 0.79, "name": "15.0 kW - 6 Pôles"}
}


def generate_dynamic_guide(mode, spec, load_type, load_factor, coupling, is_tripped, omega, Cm, Cr):
    if is_tripped:
        return "❌ DÉCLENCHEMENT (F1) : Surcharge thermique (I²t = 100%). Démarrage trop long ou calage."

    if mode == "direct" and coupling == "none":
        return "⚠️ CIRCUIT OUVERT : Aucune barrette n'est posée. Le courant ne peut pas circuler, le moteur ne démarrera pas."

    if coupling != "none" and omega <= 0.1 and Cm > 0 and Cm < Cr:
        return f"⚠️ MOTEUR CALÉ : Le couple en {coupling.upper()} ({Cm:.1f} Nm) ne vainc pas la charge ({Cr:.1f} Nm) ! Imax permanent."

    adv = ""
    if mode == "direct":
        adv += f"⚡ DIRECT : Pleine tension. Id ≈ {spec['In'] * spec['Id_ratio']:.1f}A. "
    elif coupling != "none":
        adv += f"🔄 Y/Δ : En Étoile, Cm est divisé par 3 ({Cm:.1f} Nm). "

    if load_type == "constant" and load_factor > 60 and coupling == "star":
        adv += "⚠️ DANGER : Charge constante élevée. L'Étoile risque de caler."
    elif load_type == "inertia" and coupling != "none":
        adv += "⚙️ FORTE INERTIE : Accélération lente. Surveillez la chauffe !"

    if omega > 0.1 and coupling == "delta" and mode == "star_delta":
        adv += "✅ TRANSITION RÉUSSIE : Moteur en Triangle (Pleine puissance)."

    return adv if adv else "Sélectionnez vos paramètres et appuyez sur START."


@app.websocket("/ws/simulation")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    sim_context = {
        "mode": "direct", "manual_coupling": "star", "active_fault_clue": None,
        "motor_id": "7.5_4p", "load_type": "quadratic", "load_factor": 50.0,
        "inertia_mult": 2.0, "omega": 0.0, "heat": 0.0
    }
    sim_context["solver"], sim_context["components"] = build_circuit("direct")

    async def simulation_loop():
        dt = 0.05
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
                f1 = components.get("thermal_f1")

                coupling = "none"
                if sim_context["mode"] == "star_delta":
                    if km1 and km1.is_energized:
                        if km2 and km2.is_energized:
                            coupling = "star"
                        elif km3 and km3.is_energized:
                            coupling = "delta"
                else:
                    if km1 and km1.is_energized:
                        coupling = sim_context["manual_coupling"]

                spec = MOTOR_CATALOG[sim_context["motor_id"]]
                ws_sync = spec["Ns"] * (2 * math.pi / 60.0)
                Cmax = spec["Cn"] * spec["Cmax_ratio"]
                inert_m = 50.0 if sim_context["load_type"] == "inertia" else sim_context["inertia_mult"]
                J_total = spec["Jm"] * (1.0 + inert_m)

                omega = sim_context["omega"]
                Cm = 0.0
                I_line = 0.0
                U_motor = 0.0

                if coupling in ["star", "delta"]:
                    g = (ws_sync - omega) / ws_sync
                    g = max(0.01, min(1.0, g))
                    Cm_delta = (2 * Cmax) / ((g / 0.20) + (0.20 / g))
                    I_delta = spec["In"] * \
                        (0.3 + (spec["Id_ratio"] - 0.3) * (g**1.5))

                    if coupling == "star":
                        Cm = Cm_delta / 3.0
                        I_line = I_delta / 3.0
                        U_motor = 230.0
                    else:
                        Cm = Cm_delta
                        I_line = I_delta
                        U_motor = 400.0

                Cr = 0.0
                lf = sim_context["load_factor"] / 100.0
                Cr += 0.02 * spec["Cn"]
                if omega > 0:
                    Cr += 0.01 * spec["Cn"] * (omega / ws_sync)
                if sim_context["load_type"] == "constant":
                    Cr += spec["Cn"] * lf
                else:
                    Cr += spec["Cn"] * lf * ((omega / ws_sync)**2)

                if omega <= 0 and Cm <= Cr and coupling != "none":
                    accel = 0.0
                    omega = 0.0
                elif coupling == "none":
                    accel = -Cr / J_total
                else:
                    accel = (Cm - Cr) / J_total

                omega += accel * dt
                if omega < 0:
                    omega = 0.0
                if omega > ws_sync * 0.995:
                    omega = ws_sync * 0.995

                sim_context["omega"] = omega
                speed_rpm = omega * (60.0 / (2 * math.pi))

                K_heat = 0.8
                if I_line > spec["In"] * 1.05:
                    sim_context["heat"] += ((I_line /
                                            spec["In"])**2) * dt * K_heat
                else:
                    sim_context["heat"] -= dt * 5.0
                sim_context["heat"] = max(0.0, min(sim_context["heat"], 100.0))

                is_tripped = False
                if sim_context["heat"] >= 100.0 and f1 and not f1.is_tripped:
                    f1.trip()
                    is_tripped = True

                if I_line > 0:
                    I_line += random.uniform(-0.2, 0.2)
                if U_motor > 0:
                    U_motor += random.uniform(-1.5, 1.5)

                guide_text = generate_dynamic_guide(
                    sim_context["mode"], spec, sim_context["load_type"], sim_context["load_factor"], coupling, is_tripped, omega, Cm, Cr)

                state = {
                    "km1_energized": km1.is_energized if km1 else False,
                    "km2_energized": km2.is_energized if km2 else False,
                    "km3_energized": km3.is_energized if km3 else False,
                    "coupling": coupling,
                    "motor_running": (coupling != "none"),
                    "speed_rpm": speed_rpm,
                    "fault_active": f1.is_tripped if f1 else False,
                    "fault_clue": sim_context["active_fault_clue"],
                    "guide_text": guide_text,
                    "voltage": round(U_motor, 1),
                    "current": round(I_line, 1),
                    "heat_percent": round(sim_context["heat"], 1),
                    "specs": spec
                }
                await websocket.send_text(json.dumps(state))
                await asyncio.sleep(dt)
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
                sim_context["solver"], sim_context["components"] = build_circuit(
                    target)
                sim_context["omega"] = 0.0
                sim_context["heat"] = 0.0
            elif action == "set_motor":
                sim_context["motor_id"] = target
            elif action == "set_load_type":
                sim_context["load_type"] = target
            elif action == "set_load_factor":
                sim_context["load_factor"] = float(target)
            elif action == "set_inertia":
                sim_context["inertia_mult"] = float(target)
            elif action == "set_manual_coupling":
                sim_context["manual_coupling"] = target

            elif action == "generate_fault":
                components = sim_context["components"]
                candidates = ["km1"] if sim_context["mode"] == "direct" else [
                    "km1", "km2", "km3"]
                valid = [c for c in candidates if c in components]
                if valid:
                    faulty_id = random.choice(valid)
                    components[faulty_id].is_broken = True
                    symptoms = {
                        "km1": "Panne : KM1 ne ferme pas la puissance. Vérifiez L1-T1 et A1-A2.",
                        "km2": "Panne : KM2 (Étoile) HS. Le point neutre ne se fait pas.",
                        "km3": "Panne : KM3 (Triangle) HS. Coupure après 3s."
                    }
                    sim_context["active_fault_clue"] = symptoms[faulty_id]

            elif action == "replace_part":
                components = sim_context["components"]
                if target in components:
                    components[target].is_broken = False
                if not any(getattr(c, "is_broken", False) for c in components.values()):
                    sim_context["active_fault_clue"] = None
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
                        sim_context["heat"] = 0.0
    except WebSocketDisconnect:
        pass
    finally:
        loop_task.cancel()
