# backend/tests/test_simulation.py
from app.simulation.solver import SimulationSolver
from app.simulation.components import PowerSource, PushButton, Contactor, Motor
from app.simulation.core import ElectricalNet, Component


class SimpleWireCompo(Component):
    """Un composant factice qui transmet le courant de IN vers OUT."""

    def update(self):
        if "IN" in self.terminals and "OUT" in self.terminals:
            # Si l'entrée est alimentée, on alimente la sortie
            if self.terminals["IN"].is_powered:
                self.terminals["OUT"].is_powered = True


def test_electrical_net_propagation():
    """Vérifie que le courant passe d'un Net à un autre via un composant."""

    # 1. Arrange : Création du circuit
    net_source = ElectricalNet("Phase_24V")
    net_load = ElectricalNet("Vers_Lampe")

    wire_component = SimpleWireCompo("Fil_Direct")
    wire_component.connect("IN", net_source)
    wire_component.connect("OUT", net_load)

    # 2. Act : On allume la source et on fait un "tick" de calcul
    net_source.is_powered = True
    wire_component.update()

    # 3. Assert : La charge doit être alimentée
    assert net_load.is_powered is True, "Le courant n'a pas traversé le composant"

# Ajoute ces imports au début du fichier test_simulation.py

# ... (Garde le test_electrical_net_propagation existant) ...


def test_contactor_logic():
    """Vérifie l'isolation entre la commande et la puissance d'un contacteur."""
    # 1. Arrange : Création du réseau
    source_24v = PowerSource("Alim_24V")
    source_400v = PowerSource("Alim_400V")

    net_cmd = ElectricalNet("Fil_Commande")
    net_power = ElectricalNet("Fil_Puissance")
    net_to_motor = ElectricalNet("Fil_Moteur")

    contactor = Contactor("KM1")

    # Câblage
    source_24v.connect("OUT", net_cmd)
    source_400v.connect("OUT", net_power)

    contactor.connect("A1", net_cmd)       # Bobine sur le 24V
    contactor.connect("L1", net_power)     # Entrée puissance sur le 400V
    contactor.connect("T1", net_to_motor)  # Sortie puissance vers moteur

    # 2. Act : On allume SEULEMENT la puissance (pas de commande)
    source_400v.update()
    contactor.update()

    # 3. Assert : Le moteur ne doit pas être alimenté car le contacteur est ouvert
    assert contactor.is_energized is False
    assert net_to_motor.is_powered is False

    # 4. Act 2 : On allume la commande
    source_24v.update()
    contactor.update()

    # 5. Assert 2 : Le contacteur se ferme, la puissance passe
    assert contactor.is_energized is True
    assert net_to_motor.is_powered is True

# backend/tests/test_simulation.py (À ajouter à la fin)


def test_full_direct_on_line_starter():
    """
    Test du circuit complet : Démarrage Direct avec Auto-maintien.
    Vérifie que la logique de mémorisation (contact 13-14) fonctionne sans le solveur.
    """
    solver = SimulationSolver()

    # 1. Création des composants
    power_24v = PowerSource("Alim_24V")
    btn_stop = PushButton("S1_STOP", normally_closed=True)
    btn_start = PushButton("S2_START", normally_closed=False)
    km1 = Contactor("KM1")

    # 2. Création des câbles (Nets)
    net_24v = ElectricalNet("24V_OUT")
    net_before_start = ElectricalNet("Node_Stop_To_Start")
    net_coil = ElectricalNet("Node_Start_To_Coil")

    # On enregistre tout dans le solveur
    for comp in [power_24v, btn_stop, btn_start, km1]:
        solver.add_component(comp)
    for net in [net_24v, net_before_start, net_coil]:
        solver.add_net(net)

    # 3. Câblage du circuit de commande
    power_24v.connect("OUT", net_24v)

    btn_stop.connect("IN", net_24v)
    btn_stop.connect("OUT", net_before_start)

    btn_start.connect("IN", net_before_start)
    btn_start.connect("OUT", net_coil)

    km1.connect("A1", net_coil)

    # L'auto-maintien (Le contact 13-14 du KM1 se met en parallèle du bouton START)
    km1.connect("13", net_before_start)
    km1.connect("14", net_coil)

    # --- SCÉNARIO DE SIMULATION ---

    # ÉTAPE A : Repos
    solver.tick()
    assert km1.is_energized is False, "Le contacteur devrait être au repos"

    # ÉTAPE B : On appuie sur START
    btn_start.press()
    solver.tick()
    assert km1.is_energized is True, "Le contacteur doit s'enclencher avec START"

    # ÉTAPE C : On relâche START (La magie de l'auto-maintien)
    btn_start.release()
    solver.tick()
    assert km1.is_energized is True, "L'auto-maintien (13-14) doit garder KM1 alimenté !"

    # ÉTAPE D : On appuie sur STOP
    btn_stop.press()
    solver.tick()
    assert km1.is_energized is False, "Le STOP doit couper l'auto-maintien"

    # ÉTAPE E : On relâche STOP
    btn_stop.release()
    solver.tick()
    assert km1.is_energized is False, "Le contacteur doit RESTER coupé après le relâchement du STOP"
