# create_battle_project_structure.py
import os

# base folder
base = "src"

# folder structure and files
structure = {
    "components": {
        "BattleField": ["BattleField.jsx", "ArmyDisplay.jsx", "UnitFormation.jsx", "CombatLog.jsx"],
        "ArmySetup": ["ArmyBuilder.jsx", "UnitSelector.jsx"],
        "Controls": ["StrategyPanel.jsx", "SpeedControl.jsx", "RoundControls.jsx"],
        "Stats": ["UnitStats.jsx", "ArmyStats.jsx", "TopWarriors.jsx"],
    },
    "hooks": ["useBattleEngine.js", "useBattleState.js", "useAnimation.js"],
    "services": ["battleEngine.js", "constants.js", "calculations.js"],
    "store": ["battleStore.js"],
    "styles": ["Battle.module.css"],
}

def create_structure(base_path, struct):
    for key, val in struct.items():
        folder_path = os.path.join(base_path, key)
        os.makedirs(folder_path, exist_ok=True)
        if isinstance(val, list):
            for f in val:
                open(os.path.join(folder_path, f), "w").close()
        elif isinstance(val, dict):
            create_structure(folder_path, val)

if __name__ == "__main__":
    os.makedirs(base, exist_ok=True)
    create_structure(base, structure)
    print(f"Folder structure and files created under '{base}/'")