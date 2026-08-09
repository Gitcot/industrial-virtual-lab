# backend/app/simulation/builder.py
import json
import os
from app.simulation.solver import SimulationSolver
from app.simulation.core import ElectricalNet
from app.simulation.components import PowerSource, PushButton, Contactor, Motor, ThermalRelay

COMPONENT_TYPES = {
    "PowerSource": PowerSource,
    "PushButton": PushButton,
    "Contactor": Contactor,
    "Motor": Motor,
    "ThermalRelay": ThermalRelay
}


def load_circuit_from_json(json_path: str) -> tuple[SimulationSolver, dict]:
    if not os.path.exists(json_path):
        raise FileNotFoundError(
            f"Le fichier de configuration {json_path} est introuvable.")

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    solver = SimulationSolver()
    components = {}
    nets = {}

    # 1. Instanciation des composants
    for comp_data in data["components"]:
        comp_id = comp_data["id"]
        comp_type = comp_data["type"]
        comp_name = comp_data.get("name", comp_id)

        cls = COMPONENT_TYPES.get(comp_type)
        if not cls:
            raise ValueError(f"Type de composant inconnu : {comp_type}")

        if comp_type == "PushButton":
            nc = comp_data.get("normally_closed", False)
            comp_obj = cls(comp_name, normally_closed=nc)
        else:
            comp_obj = cls(comp_name)

        components[comp_id] = comp_obj
        solver.add_component(comp_obj)

    # 2. Instanciation des réseaux (câbles)
    for net_name in data["nets"]:
        net_obj = ElectricalNet(net_name)
        nets[net_name] = net_obj
        solver.add_net(net_obj)

    # 3. Établissement des connexions
    for conn in data["connections"]:
        comp_id = conn["comp"]
        terminal_name = conn["terminal"]
        net_name = conn["net"]

        if comp_id in components and net_name in nets:
            components[comp_id].connect(terminal_name, nets[net_name])

    return solver, components
