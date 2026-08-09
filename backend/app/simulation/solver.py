# backend/app/simulation/solver.py
from app.simulation.core import ElectricalComponent, ElectricalNet


class SimulationSolver:
    """Moteur de résolution de simulation électrique temps réel."""

    def __init__(self):
        self.components: list[ElectricalComponent] = []
        self.nets: list[ElectricalNet] = []

    def add_component(self, component: ElectricalComponent):
        if component not in self.components:
            self.components.append(component)

    def add_net(self, net: ElectricalNet):
        if net not in self.nets:
            self.nets.append(net)

    def tick(self):
        """Un cycle de calcul du solveur (3 passes de propagation + mise à jour d'état)."""
        # 1. Remise à zéro des câbles
        for net in self.nets:
            net.reset()

        # 2. Propagation multi-passes pour stabiliser l'auto-maintien
        for _ in range(3):
            for comp in self.components:
                comp.evaluate()

        # 3. Mise à jour des états physiques
        for comp in self.components:
            comp.update_state()
