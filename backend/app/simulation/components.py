# backend/app/simulation/components.py
from app.simulation.core import ElectricalComponent, ElectricalNet

# Alias pour compatibilité
Component = ElectricalComponent


class PowerSource(ElectricalComponent):
    """Source d'alimentation 24V DC / Phase."""

    def __init__(self, name: str):
        super().__init__(name)
        self.terminals = {"OUT": None}

    def evaluate(self):
        net_out = self.terminals["OUT"].net
        if net_out:
            net_out.is_powered = True


class PushButton(ElectricalComponent):
    """Bouton poussoir (NO = Normally Open, NC = Normally Closed)."""

    def __init__(self, name: str, normally_closed: bool = False):
        super().__init__(name)
        self.terminals = {"IN": None, "OUT": None}
        self.normally_closed = normally_closed
        self.is_pressed = False

    def press(self):
        self.is_pressed = True

    def release(self):
        self.is_pressed = False

    def evaluate(self):
        net_in = self.terminals["IN"].net
        net_out = self.terminals["OUT"].net

        # Le courant passe si : (NO et appuyé) OU (NC et non appuyé)
        is_conductive = (self.normally_closed and not self.is_pressed) or (
            not self.normally_closed and self.is_pressed)

        if is_conductive and net_in and net_out:
            if net_in.is_powered:
                net_out.is_powered = True
            if net_out.is_powered:
                net_in.is_powered = True


class Contactor(ElectricalComponent):
    """Contacteur électromécanique avec bobine A1-A2 et contacts de puissance/auxiliaires."""

    def __init__(self, name: str):
        super().__init__(name)
        self.terminals = {
            "A1": None, "A2": None,      # Bobine
            "L1": None, "T1": None,      # Puissance 1
            "L2": None, "T2": None,      # Puissance 2
            "L3": None, "T3": None,      # Puissance 3
            "13": None, "14": None       # Auxiliaire NO (Auto-maintien)
        }
        self.is_energized = False

    def evaluate(self):
        # 1. Vérification de l'alimentation de la bobine (A1)
        net_a1 = self.terminals["A1"].net
        if net_a1 and net_a1.is_powered:
            self.is_energized = True

        # 2. Conduction des contacts si la bobine est excitée
        if self.is_energized:
            # Contacts de puissance
            for p_in, p_out in [("L1", "T1"), ("L2", "T2"), ("L3", "T3")]:
                n_in = self.terminals[p_in].net
                n_out = self.terminals[p_out].net
                if n_in and n_out:
                    if n_in.is_powered:
                        n_out.is_powered = True
                    if n_out.is_powered:
                        n_in.is_powered = True

            # Contact auxiliaire (13-14)
            n_13 = self.terminals["13"].net
            n_14 = self.terminals["14"].net
            if n_13 and n_14:
                if n_13.is_powered:
                    n_14.is_powered = True
                if n_14.is_powered:
                    n_13.is_powered = True

    def update_state(self):
        # Réinitialisation de l'état de la bobine à chaque début de tick
        net_a1 = self.terminals["A1"].net
        self.is_energized = bool(net_a1 and net_a1.is_powered)


class Motor(ElectricalComponent):
    """Moteur asynchrone triphasé."""

    def __init__(self, name: str):
        super().__init__(name)
        self.terminals = {"L1": None, "L2": None, "L3": None}
        self.is_running = False

    def evaluate(self):
        n1 = self.terminals["L1"].net
        n2 = self.terminals["L2"].net
        n3 = self.terminals["L3"].net

        # Le moteur tourne si toutes ses phases sont alimentées
        if n1 and n2 and n3 and n1.is_powered and n2.is_powered and n3.is_powered:
            self.is_running = True
        else:
            self.is_running = False

    def update_state(self):
        self.evaluate()


class ThermalRelay(ElectricalComponent):
    """Relais thermique industriel avec verrouillage mécanique et réarmement."""

    def __init__(self, name: str):
        super().__init__(name)
        self.terminals = {"95": None, "96": None}
        self.is_tripped = False

    def trip(self):
        self.is_tripped = True

    def reset(self):
        self.is_tripped = False

    def evaluate(self):
        net_95 = self.terminals["95"].net
        net_96 = self.terminals["96"].net

        if not self.is_tripped and net_95 and net_96:
            if net_95.is_powered:
                net_96.is_powered = True
            if net_96.is_powered:
                net_95.is_powered = True
