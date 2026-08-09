# backend/app/simulation/solver.py
from typing import List
from .core import Component, ElectricalNet


class SimulationSolver:
    """
    Le moteur d'exécution (Tick-Based) du laboratoire virtuel.
    Orchestre la propagation de l'énergie à travers les composants.
    """

    def __init__(self):
        self.components: List[Component] = []
        self.nets: List[ElectricalNet] = []

    def add_component(self, component: Component):
        self.components.append(component)

    def add_net(self, net: ElectricalNet):
        self.nets.append(net)

    def tick(self, iterations: int = 5):
        """
        Exécute un cycle de simulation complet.

        Args:
            iterations: Nombre de passes de calcul. Une valeur de 5 garantit 
                        que le courant a le temps de traverser jusqu'à 5 composants 
                        en série de manière "instantanée" pour l'utilisateur.
        """
        # 1. Remise à zéro de tous les câbles (Top-Down Propagation)
        for net in self.nets:
            net.reset()

        # 2. Propagation de l'énergie et logique métier
        # On répète la mise à jour pour stabiliser le réseau (résoudre les dépendances en série)
        for _ in range(iterations):
            for component in self.components:
                component.update()
