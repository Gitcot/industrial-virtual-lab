# backend/app/simulation/components.py
from .core import Component


class PowerSource(Component):
    """Générateur d'énergie. Alimente en permanence tout ce qui est connecté à ses sorties."""

    def update(self):
        for net in self.terminals.values():
            net.is_powered = True


class PushButton(Component):
    """
    Bouton poussoir industriel.
    Peut être Normalement Ouvert (NO - ex: START) ou Normalement Fermé (NC - ex: STOP).
    """

    def __init__(self, name: str, normally_closed: bool = False):
        super().__init__(name)
        self.normally_closed = normally_closed
        self.is_pressed = False

    def press(self):
        self.is_pressed = True

    def release(self):
        self.is_pressed = False

    def update(self):
        if "IN" not in self.terminals or "OUT" not in self.terminals:
            return

        # Détermination de l'état mécanique du contact interne
        is_closed = not self.is_pressed if self.normally_closed else self.is_pressed

        # Si le contact est fermé et que l'entrée a du courant, on laisse passer
        if is_closed and self.terminals["IN"].is_powered:
            self.terminals["OUT"].is_powered = True


class Contactor(Component):
    """
    Contacteur électromagnétique (ex: TeSys D).
    Sépare la commande (Bobine A1/A2) de la puissance (L1/T1...).
    """

    def __init__(self, name: str):
        super().__init__(name)
        # Mémoire mécanique du contacteur
        self.is_energized = False

    def update(self):
        # 1. Évaluation instantanée : La bobine reçoit-elle du courant MAINTENANT ?
        coil_powered = "A1" in self.terminals and self.terminals["A1"].is_powered

        # 2. On ferme les contacts SI on ÉTAIT excité (inertie/mémoire)
        # OU SI on VIENT de l'être (réactivité immédiate).
        if self.is_energized or coil_powered:
            # Contacts de puissance
            for i in range(1, 4):
                line = f"L{i}"
                terminal = f"T{i}"
                if line in self.terminals and terminal in self.terminals:
                    if self.terminals[line].is_powered:
                        self.terminals[terminal].is_powered = True

            # Contact auxiliaire NO (13->14)
            if "13" in self.terminals and "14" in self.terminals:
                if self.terminals["13"].is_powered:
                    self.terminals["14"].is_powered = True

        # 3. On sauvegarde le véritable état électrique pour le prochain cycle
        self.is_energized = coil_powered


class Motor(Component):
    """Actionneur final. Tourne si ses 3 phases sont alimentées."""

    def __init__(self, name: str):
        super().__init__(name)
        self.is_running = False

    def update(self):
        # Vérifie la présence de tension sur L1, L2 et L3
        p1 = "L1" in self.terminals and self.terminals["L1"].is_powered
        p2 = "L2" in self.terminals and self.terminals["L2"].is_powered
        p3 = "L3" in self.terminals and self.terminals["L3"].is_powered

        self.is_running = p1 and p2 and p3
