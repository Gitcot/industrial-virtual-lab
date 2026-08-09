import os
import cadquery as cq
import trimesh


class StepToGlbConverter:
    """
    Moteur de conversion de l'Asset Factory.
    Pipeline en 2 étapes : STEP -> STL (CadQuery) -> GLB (Trimesh)
    """

    def __init__(self, linear_deflection: float = 0.1, angular_deflection: float = 0.1):
        self.linear_deflection = linear_deflection
        self.angular_deflection = angular_deflection

    def convert(self, step_file_path: str, glb_output_path: str) -> bool:
        if not os.path.exists(step_file_path):
            raise FileNotFoundError(
                f"Erreur : Le fichier source {step_file_path} est introuvable.")

        print(f"[*] Importation du modèle CAD : {step_file_path}")

        # Fichier temporaire STL pour faire le pont entre CadQuery et Trimesh
        temp_stl_path = step_file_path.replace(".step", "_temp.stl")

        try:
            # 1. Ingestion mathématique
            model = cq.importers.importStep(step_file_path)

            print("[*] Tessellation géométrique (STEP -> STL)...")
            # 2. Export en STL (Format de maillage parfaitement géré par CadQuery)
            cq.exporters.export(
                model,
                temp_stl_path,
                exportType='STL',
                tolerance=self.linear_deflection,
                angularTolerance=self.angular_deflection
            )

            print(
                f"[*] Optimisation et conversion Web (STL -> GLB) : {glb_output_path}")
            # 3. Chargement du maillage par Trimesh
            mesh = trimesh.load(temp_stl_path)

            # 4. Export natif en GLB
            mesh.export(glb_output_path)

            print(f"[+] Conversion réussie : {glb_output_path}")
            return True

        except Exception as e:
            print(
                f"[-] Erreur lors de la conversion de {step_file_path} : {str(e)}")
            return False

        finally:
            # Bonnes pratiques : on nettoie toujours ses fichiers temporaires
            if os.path.exists(temp_stl_path):
                os.remove(temp_stl_path)
