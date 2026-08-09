# asset_factory/pipeline/generators.py
import cadquery as cq


class AssetGenerator:
    """
    Générateur paramétrique de composants électriques (Mocks pour l'MVP).
    """

    @staticmethod
    def generate_button(is_stop=False) -> cq.Workplane:
        """Génère un bouton poussoir (Encastrable sur porte)."""
        base = cq.Workplane("XY").cylinder(height=10, radius=15)
        # Bouton (légèrement plus grand pour le STOP "Coup de poing")
        btn_radius = 12 if is_stop else 10
        btn_height = 8 if is_stop else 5
        button = cq.Workplane("XY").workplane(offset=5).cylinder(
            height=btn_height, radius=btn_radius)
        return base.union(button)

    @staticmethod
    def generate_circuit_breaker() -> cq.Workplane:
        """Génère un Disjoncteur Magnéto-Thermique (Format modulaire)."""
        body = cq.Workplane("XY").box(35, 85, 70)
        # Manette de réarmement
        switch = cq.Workplane("XY").workplane(offset=35).box(10, 15, 15)
        return body.union(switch)

    @staticmethod
    def generate_thermal_relay() -> cq.Workplane:
        """Génère un Relais Thermique (Se fixe sous le contacteur)."""
        body = cq.Workplane("XY").box(45, 60, 75)
        # Broches de connexion supérieures (vers le contacteur)
        pins = (
            cq.Workplane("XY")
            .workplane(offset=75/2)
            .pushPoints([(10, 20), (0, 20), (-10, 20)])
            .cylinder(height=10, radius=2)
        )
        return body.union(pins)

    @staticmethod
    def generate_motor_stator() -> cq.Workplane:
        """Partie fixe du moteur : corps cylindrique + boîte à bornes."""
        body = cq.Workplane("YZ").cylinder(height=120, radius=40)
        terminal_box = cq.Workplane("XY").workplane(offset=40).box(30, 30, 20)
        return body.union(terminal_box)

    @staticmethod
    def generate_motor_rotor() -> cq.Workplane:
        """Partie mobile : arbre de transmission."""
        # On ajoute une petite méplat ou rainure pour mieux visualiser la rotation
        shaft = cq.Workplane("YZ").workplane(
            offset=60).cylinder(height=35, radius=8)
        notch = cq.Workplane("YZ").workplane(offset=70).box(10, 4, 18)
        return shaft.cut(notch)
