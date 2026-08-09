import json
from app.simulation.core import ElectricalNet
from app.simulation.solver import SimulationSolver
from app.simulation.components import (
    PowerSource,
    PushButton,
    Contactor,
    Motor,
    ThermalRelay,
    TimerRelay
)

# Classe utilitaire pour représenter une borne connectée


class Terminal:
    def __init__(self, net: ElectricalNet):
        self.net = net


def load_circuit_from_json(filepath: str) -> tuple[SimulationSolver, dict]:
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    solver = SimulationSolver()
    components = {}

    # 1. Instanciation des composants depuis le JSON
    for comp_data in data.get("components", []):
        comp_type = comp_data["type"]
        comp_id = comp_data["id"]
        name = comp_data.get("name", comp_id)

        if comp_type == "PowerSource":
            comp = PowerSource(name)
        elif comp_type == "PushButton":
            normally_closed = comp_data.get("normally_closed", False)
            comp = PushButton(name, normally_closed)
        elif comp_type == "Contactor":
            comp = Contactor(name)
        elif comp_type == "Motor":
            comp = Motor(name)
        elif comp_type == "ThermalRelay":
            comp = ThermalRelay(name)
        elif comp_type == "TimerRelay":  # <-- LA LIGNE MAGIQUE QUI MANQUAIT !
            delay = comp_data.get("delay", 3.0)
            comp = TimerRelay(name, delay)
        else:
            print(f"⚠️ Type de composant inconnu ignoré : {comp_type}")
            continue

        components[comp_id] = comp
        solver.add_component(comp)

    # 2. Instanciation des fils/réseaux (Nets)
    nets = {}
    for net_name in data.get("nets", []):
        net = ElectricalNet(net_name)
        nets[net_name] = net
        solver.add_net(net)

    # 3. Câblage physique (Connexions)
    for conn in data.get("connections", []):
        comp_id = conn.get("comp")
        terminal = conn.get("terminal")
        net_name = conn.get("net")

        if comp_id in components and net_name in nets:
            # On assigne le câble (net) à la borne (terminal) du composant
            components[comp_id].terminals[terminal] = Terminal(nets[net_name])

    return solver, components
