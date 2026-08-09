# backend/app/simulation/core.py

class ElectricalNet:
    """Représente un câble ou un potentiel électrique reliant plusieurs bornes."""

    def __init__(self, name: str):
        self.name = name
        self.is_powered = False

    def reset(self):
        self.is_powered = False


class Terminal:
    """Représente une borne de connexion d'un composant."""

    def __init__(self, name: str, component):
        self.name = name
        self.component = component
        self.net = None


class ElectricalComponent:
    """Classe de base abstraite pour tous les composants du laboratoire."""

    def __init__(self, name: str):
        self.name = name
        self.terminals: dict[str, Terminal] = {}

    def connect(self, terminal_name: str, net_or_terminal):
        if isinstance(net_or_terminal, ElectricalNet):
            term = Terminal(terminal_name, self)
            term.net = net_or_terminal
            self.terminals[terminal_name] = term
        elif isinstance(net_or_terminal, Terminal):
            self.terminals[terminal_name] = net_or_terminal

    def evaluate(self):
        """Évaluation logique de la propagation du courant."""
        pass

    def update_state(self):
        """Mise à jour des états physiques internes (bobines, relais, etc.)."""
        pass

    # Alias pour assurer la compatibilité avec solver.py
Component = ElectricalComponent
