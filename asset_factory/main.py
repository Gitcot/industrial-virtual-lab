# asset_factory/main.py
import os
import json
import cadquery as cq
import trimesh
from pipeline.converter import StepToGlbConverter
from pipeline.generators import AssetGenerator


def extract_metadata(glb_path: str) -> dict:
    mesh = trimesh.load(glb_path, force='mesh')
    return {
        "polycount": len(mesh.faces),
        "vertices": len(mesh.vertices),
        "dimensions": (mesh.bounds[1] - mesh.bounds[0]).tolist() if mesh.bounds is not None else []
    }


def process_catalog():
    """Traite tout le catalogue d'assets de la V0.2"""

    # Définition du catalogue
    catalog = [
        {"id": "BTN_START", "type": "BUTTON_NO",
            "name": "Bouton Poussoir Vert (START)", "cad": AssetGenerator.generate_button(is_stop=False)},
        {"id": "BTN_STOP", "type": "BUTTON_NC",
            "name": "Bouton Coup de Poing (STOP)", "cad": AssetGenerator.generate_button(is_stop=True)},
        {"id": "BREAKER", "type": "CIRCUIT_BREAKER", "name": "Disjoncteur Moteur",
            "cad": AssetGenerator.generate_circuit_breaker()},
        {"id": "RELAY", "type": "THERMAL_RELAY", "name": "Relais Thermique",
            "cad": AssetGenerator.generate_thermal_relay()},
        {"id": "MOTOR_STATOR", "type": "MOTOR_PART", "name": "Stator Moteur",
            "cad": AssetGenerator.generate_motor_stator()},
        {"id": "MOTOR_ROTOR", "type": "MOTOR_PART", "name": "Rotor Moteur",
            "cad": AssetGenerator.generate_motor_rotor()},
    ]

    converter = StepToGlbConverter(linear_deflection=0.5)
    catalog_db = []

    print("=== DÉMARRAGE DE LA PRODUCTION DES ASSETS (V0.2) ===")

    for item in catalog:
        step_file = f"assets_raw/{item['id']}.step"
        glb_file = f"assets_out/{item['id']}.glb"

        print(f"\n[*] Traitement de : {item['name']}")

        # 1. Export STEP
        cq.exporters.export(item["cad"], step_file)

        # 2. Conversion
        if converter.convert(step_file, glb_file):
            # 3. Métadonnées
            meta = extract_metadata(glb_file)

            record = {
                "asset_id": item["id"],
                "name": item["name"],
                "type": item["type"],
                "glb_path": f"/assets/{item['id']}.glb",
                "polycount": meta["polycount"],
                "dimensions": meta["dimensions"]
            }
            catalog_db.append(record)
            print(f"[+] Prêt ! ({meta['polycount']} polygones)")

    # Sauvegarde de la "base de données" finale
    with open("assets_out/database_seed.json", "w", encoding='utf-8') as f:
        json.dump(catalog_db, f, indent=4, ensure_ascii=False)

    print("\n=== LOT TERMINÉ ===")
    print("Fichier de seed de base de données généré : assets_out/database_seed.json")


if __name__ == "__main__":
    process_catalog()
