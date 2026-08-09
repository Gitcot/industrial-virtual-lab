# backend/app/simulation/core.py
from typing import Dict, List


class ElectricalNet:
    """
    Représente un fil électrique ou un potentiel commun.
    L'énergie se propage dans ce 'Net'. Si un Net est alimenté, 
    tous les composants connectés à ce Net reçoivent l'énergie.
    """

    def __init__(self, name: str):
        self.name = name
        self.is_powered: bool = False

    def reset(self):
        """Réinitialise l'état avant chaque tick de calcul."""
        self.is_powered = False


class Component:
    """
    Classe de base pour tous les équipements industriels.
    """

    def __init__(self, name: str):
        self.name = name
        # Dictionnaire des connexions physiques (ex: "L1" -> Net_A)
        self.terminals: Dict[str, ElectricalNet] = {}

    def connect(self, terminal_name: str, net: ElectricalNet):
        """Connecte une borne du composant à un fil (Net)."""
        self.terminals[terminal_name] = net

    def update(self):
        """
        Logique métier du composant. 
        Surchargeable par les classes enfants (ex: si Bobine A1-A2 alimentée -> fermer contacts).
        """
        pass
