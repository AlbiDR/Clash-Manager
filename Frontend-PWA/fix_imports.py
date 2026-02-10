import os
import re

# Components moved to @shared/ui
UI_COMPONENTS = [
    "Icon", "BaseCard", "BaseCardSkeleton", "StatusPill", "MomentumPill",
    "StatisticItem", "ErrorState", "EmptyState", "ErrorBoundary",
    "CardActions", "Toast", "ToastContainer", "SelectionBar"
]

# Directives moved to @shared/directives
DIRECTIVES = ["vTactile", "vTooltip"]

# Composables moved to @shared/composables
COMPOSABLES = [
    "useHaptics", "useWakeLock", "useConnectionStatus",
    "useUiCoordinator", "useTheme"
]

def update_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content

    # 1. Update UI Component imports
    for comp in UI_COMPONENTS:
        # Match: import Comp from "..." where ... ends in /Comp.vue or is ./Comp.vue
        pattern = rf'import\s+{comp}\s+from\s+["\']([^"\']*/{comp}\.vue|(?:\./)?{comp}\.vue)["\']'
        content = re.sub(pattern, rf'import {{ {comp} }} from "@shared"', content)

    # 2. Update Directive imports
    for directive in DIRECTIVES:
        pattern = rf'import\s+{{\s*{directive}\s*}}\s+from\s+["\']([^"\']*/{directive}|(?:\./)?{directive})["\']'
        content = re.sub(pattern, rf'import {{ {directive} }} from "@shared"', content)

    # 3. Update Composable imports
    for comp in COMPOSABLES:
        pattern = rf'import\s+{{\s*{comp}\s*}}\s+from\s+["\']([^"\']*/{comp}|(?:\./)?{comp})["\']'
        content = re.sub(pattern, rf'import {{ {comp} }} from "@shared"', content)

    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated: {filepath}")

def main():
    base_dir = "src"
    for root, dirs, files in os.walk(base_dir):
        if "shared" in root: continue # Don't update shared folder itself (though pattern might not match)
        for name in files:
            if name.endswith((".vue", ".ts")):
                update_file(os.path.join(root, name))

if __name__ == "__main__":
    main()
