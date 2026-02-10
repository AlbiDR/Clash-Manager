import os
import re

# Logic moved to @core
CORE_MAPPINGS = {
    "gasClient": "@core/api/GasClient",
    "warMath": "@core/utils/warMath",
    "idb": "@core/services/StorageService"
}

# Folder move
TYPE_MAPPING = r'from\s+["\']([^"\']*/types)["\']'

def update_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content

    # 1. Update Core Logic imports
    for old_name, new_path in CORE_MAPPINGS.items():
        # Match imports like: import { ... } from "@/api/gasClient" or "../api/gasClient" or "@/utils/idb"
        pattern = rf'from\s+["\']([^"\']*/{old_name})["\']'
        content = re.sub(pattern, rf'from "{new_path}"', content)
        
        # Match direct imports: import "@/utils/idb"
        direct_pattern = rf'import\s+["\']([^"\']*/{old_name})["\']'
        content = re.sub(direct_pattern, rf'import "{new_path}"', content)

    # 2. Update Type imports
    content = re.sub(TYPE_MAPPING, r'from "@core/types"', content)

    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated: {filepath}")

def main():
    base_dir = "src"
    for root, dirs, files in os.walk(base_dir):
        if "core" in root: continue
        for name in files:
            if name.endswith((".vue", ".ts")):
                update_file(os.path.join(root, name))

if __name__ == "__main__":
    main()
