import os
import pytest
import cadquery as cq
from pipeline.converter import StepToGlbConverter

@pytest.fixture
def mock_contactor_step(tmp_path) -> str:
    """
    Fixture Pytest : Prépare l'environnement avant le test.
    Génère un faux modèle 3D (un cube avec un cylindre sur le dessus)
    qui simule un composant industriel basique.
    Utilise 'tmp_path' pour que le fichier soit détruit après le test.
    """
    # 1. Modélisation paramétrique avec CadQuery
    # On crée une base carrée (45x45mm) sur 50mm de haut.
    base = cq.Workplane("XY").box(45, 45, 50)
    
    # On ajoute un cylindre sur la face supérieure (Z positif) pour simuler un bouton/bornier
    contactor = base.faces(">Z").workplane().circle(10).extrude(5)
    
    # 2. Exportation en STEP dans un dossier temporaire
    file_path = str(tmp_path / "mock_contactor.step")
    cq.exporters.export(contactor, file_path)
    
    return file_path

def test_step_to_glb_conversion_success(mock_contactor_step, tmp_path):
    """
    Test d'intégration : Vérifie que le convertisseur traite bien un fichier STEP valide.
    """
    # Arrange (Préparation)
    converter = StepToGlbConverter()
    output_glb_path = str(tmp_path / "mock_contactor.glb")
    
    # Act (Exécution)
    result = converter.convert(mock_contactor_step, output_glb_path)
    
    # Assert (Vérification)
    assert result is True, "La méthode convert aurait dû retourner True"
    assert os.path.exists(output_glb_path), "Le fichier .glb n'a pas été généré"
    
    # Vérifier que le fichier généré n'est pas vide
    file_size = os.path.getsize(output_glb_path)
    assert file_size > 1000, f"Le fichier GLB semble trop petit ou vide ({file_size} octets)"

def test_step_to_glb_conversion_file_not_found(tmp_path):
    """
    Test unitaire : Vérifie le comportement face à un fichier inexistant.
    """
    converter = StepToGlbConverter()
    fake_input = str(tmp_path / "inexistant.step")
    output_glb = str(tmp_path / "output.glb")
    
    # On s'attend à ce qu'une erreur FileNotFoundError soit levée
    with pytest.raises(FileNotFoundError):
        converter.convert(fake_input, output_glb)