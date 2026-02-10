import os
import re

MOCK_MAPPINGS = {
    # Core internal services that were moved or now use aliases
    'vi.mock("../useConnectionStatus"': 'vi.mock("@shared"',
    'vi.mock("../useWakeLock"': 'vi.mock("@shared"',
    'vi.mock("../useHaptics"': 'vi.mock("@shared"',
    'vi.mock("../useTheme"': 'vi.mock("@shared"',
    'vi.mock("../useUiCoordinator"': 'vi.mock("@shared"',
    
    # Core API / Utils
    'vi.mock("../../api/gasClient"': 'vi.mock("../../api/GasClient"',
    'vi.mock("../../utils/mockData"': 'vi.mock("../../utils/mockData"',
    
    # Feature dependencies
    'vi.mock("../useLaboratory"': 'vi.mock("../useLaboratory"', # Usually within the same feature silo now
}

def fix_test_mocks(filepath):
    try:
        with open(filepath, 'r') as f:
            content = f.read()
    except:
        return

    original_content = content
    
    # Basic path cleanup for imports in tests
    # Many tests were moved from src/composables/__tests__ (2 levels deep) to src/core/services/__tests__ (3 levels deep)
    # So ../useAppSettings should be ../../useAppSettings? 
    # Actually, they are now in src/core/services/__tests__/X.test.ts 
    # and the target is src/core/services/X.ts. So "../X" is correct.
    
    # However, if they were moved to src/features/X/composables/__tests__/Y.test.ts
    # they need to point to "../Y" which is src/features/X/composables/Y.ts. Correct.
    
    # The main issue is mocks of things that moved to @shared.
    for old, new in MOCK_MAPPINGS.items():
        content = content.replace(old, new)
        
    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed test mocks: {filepath}")

def main():
    for root, dirs, files in os.walk("src"):
        for name in files:
            if "__tests__" in root and name.endswith((".ts", ".spec.ts")):
                fix_test_mocks(os.path.join(root, name))

if __name__ == "__main__":
    main()
