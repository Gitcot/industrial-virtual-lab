import time
from app.simulation.core import ElectricalComponent, ElectricalNet

Component = ElectricalComponent

class PowerSource(ElectricalComponent):
    def __init__(self, name: str):
        super().__init__(name)
        self.terminals = {"OUT": None}

    def evaluate(self):
        net_out = self.terminals["OUT"].net
        if net_out:
            net_out.is_powered = True

class PushButton(ElectricalComponent):
    def __init__(self, name: str, normally_closed: bool = False):
        super().__init__(name)
        self.terminals = {"IN": None, "OUT": None}
        self.normally_closed = normally_closed
        self.is_pressed = False

    def press(self): self.is_pressed = True
    def release(self): self.is_pressed = False

    def evaluate(self):
        net_in = self.terminals["IN"].net
        net_out = self.terminals["OUT"].net
        is_conductive = (self.normally_closed and not self.is_pressed) or (not self.normally_closed and self.is_pressed)
        if is_conductive and net_in and net_out:
            if net_in.is_powered: net_out.is_powered = True
            if net_out.is_powered: net_in.is_powered = True

class Contactor(ElectricalComponent):
    def __init__(self, name: str):
        super().__init__(name)
        self.terminals = {
            "A1": None, "A2": None,
            "L1": None, "T1": None, "L2": None, "T2": None, "L3": None, "T3": None,
            "13": None, "14": None,
            "21": None, "22": None
        }
        self.is_energized = False

    def evaluate(self):
        # L'évaluation se base sur l'état mécanique consolidé
        if self.is_energized:
            for p_in, p_out in [("L1", "T1"), ("L2", "T2"), ("L3", "T3"), ("13", "14")]:
                n_in = self.terminals.get(p_in)
                n_out = self.terminals.get(p_out)
                if n_in and n_out and n_in.net and n_out.net:
                    if n_in.net.is_powered: n_out.net.is_powered = True
                    if n_out.net.is_powered: n_in.net.is_powered = True
        else:
            # Contact de verrouillage NC (21-22) conduit si NON excité
            n_21 = self.terminals.get("21")
            n_22 = self.terminals.get("22")
            if n_21 and n_22 and n_21.net and n_22.net:
                if n_21.net.is_powered: n_22.net.is_powered = True
                if n_22.net.is_powered: n_21.net.is_powered = True

    def update_state(self):
        # L'état mécanique (is_energized) est validé à la toute fin du cycle
        net_a1 = self.terminals["A1"].net
        self.is_energized = bool(net_a1 and net_a1.is_powered)

class TimerRelay(ElectricalComponent):
    def __init__(self, name: str, delay: float = 3.0):
        super().__init__(name)
        self.terminals = {"A1": None, "55": None, "56": None, "67": None, "68": None}
        self.delay = delay
        self.start_time = 0
        self.is_triggered = False
        self.is_powered = False

    def evaluate(self):
        n55 = self.terminals.get("55")
        n56 = self.terminals.get("56")
        if not self.is_triggered and n55 and n56 and n55.net and n56.net:
            if n55.net.is_powered: n56.net.is_powered = True
            if n56.net.is_powered: n55.net.is_powered = True

        n67 = self.terminals.get("67")
        n68 = self.terminals.get("68")
        if self.is_triggered and n67 and n68 and n67.net and n68.net:
            if n67.net.is_powered: n68.net.is_powered = True
            if n68.net.is_powered: n67.net.is_powered = True

    def update_state(self):
        net_a1 = self.terminals["A1"].net
        is_powered_now = bool(net_a1 and net_a1.is_powered)
        
        # Front montant : on démarre le chrono
        if is_powered_now and not self.is_powered:
            self.start_time = time.time()
            
        self.is_powered = is_powered_now
        
        # Bascule des contacts si le temps est écoulé
        if self.is_powered and (time.time() - self.start_time >= self.delay):
            self.is_triggered = True
        else:
            self.is_triggered = False

class Motor(ElectricalComponent):
    def __init__(self, name: str):
        super().__init__(name)
        self.terminals = {"L1": None, "L2": None, "L3": None}
        self.is_running = False

    def evaluate(self):
        pass

    def update_state(self):
        n1 = self.terminals["L1"].net
        n2 = self.terminals["L2"].net
        n3 = self.terminals["L3"].net
        self.is_running = bool(n1 and n2 and n3 and n1.is_powered and n2.is_powered and n3.is_powered)

class ThermalRelay(ElectricalComponent):
    def __init__(self, name: str):
        super().__init__(name)
        self.terminals = {"95": None, "96": None}
        self.is_tripped = False

    def trip(self): self.is_tripped = True
    def reset(self): self.is_tripped = False

    def evaluate(self):
        net_95 = self.terminals["95"].net
        net_96 = self.terminals["96"].net
        if not self.is_tripped and net_95 and net_96:
            if net_95.is_powered: net_96.is_powered = True
            if net_96.is_powered: net_95.is_powered = True