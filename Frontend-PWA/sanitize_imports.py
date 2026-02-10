import os
import re

# Components/Logic that can be aliased
MAPPINGS = {
    # Shared
    "Icon": "@shared", "BaseCard": "@shared", "BaseCardSkeleton": "@shared",
    "StatusPill": "@shared", "MomentumPill": "@shared", "StatisticItem": "@shared",
    "ErrorState": "@shared", "EmptyState": "@shared", "ErrorBoundary": "@shared",
    "CardActions": "@shared", "Toast": "@shared", "ToastContainer": "@shared",
    "SelectionBar": "@shared", "vTactile": "@shared", "vTooltip": "@shared",
    "useHaptics": "@shared", "useWakeLock": "@shared", "useConnectionStatus": "@shared",
    "useUiCoordinator": "@shared", "useTheme": "@shared", "useNetworkInfo": "@shared",
    "useLongPress": "@shared", "useListFilter": "@shared", "useHeaderScroll": "@shared",
    "useProgressiveList": "@shared", "useCardMechanics": "@shared",
    # Core
    "useApiState": "@core", "useClashData": "@core", "useStoragePersistence": "@core",
    "useAppSettings": "@core", "warMath": "@core", "idb": "@core",
    "GasClient": "@core", "useBenchmarking": "@core", "useBatchQueue": "@core",
    "useBadge": "@core", "useConsoleController": "@core",
    "useBroadcastChannel": "@core", "useDeepLinkHandler": "@core",
    "useBackHandler": "@core", "useShareTarget": "@core", "useShowcaseMode": "@core",
    "useSyntheticMode": "@core", "useBlueprintMode": "@core", "useToast": "@core",
    "useShare": "@core", "useExternalLink": "@core"
}

def update_file(filepath):
    if "sanitize_imports.py" in filepath or "fix_imports.py" in filepath:
        return

    try:
        with open(filepath, 'r') as f:
            content = f.read()
    except Exception:
        return

    original_content = content

    # Replace relative imports that point to things we've moved
    for name, alias in MAPPINGS.items():
        # Match named imports: from "./useApiState"
        pattern = rf'from\s+["\']([^"\']*/{name})(?:\.ts|\.vue)?["\']'
        content = re.sub(pattern, rf'from "{alias}"', content)
        
        # Match default imports (like Icon or GasClient)
        default_pattern = rf'import\s+{name}\s+from\s+["\']([^"\']*/{name})(?:\.ts|\.vue)?["\']'
        content = re.sub(default_pattern, rf'import {{ {name} }} from "{alias}"', content)

    # Cleanup multiple @core/@shared imports (common after regex replacement)
    # import { a } from "@core"; import { b } from "@core" -> import { a, b } from "@core"
    for alias in ["@core", "@shared"]:
        im_pattern = rf'import\s+{{\s*([^}}]+)\s*}}\s+from\s+["\']{alias}["\'];?\s*'
        matches = re.findall(im_pattern, content)
        if len(matches) > 1:
            all_exports = ", ".join([m.strip() for m in matches])
            # Remove redundant commas and spaces
            cleaned_exports = ", ".join(sorted(list(set([e.strip() for e in all_exports.split(",") if e.strip()]))))
            
            # Replace first occurrence and remove others
            content = re.sub(im_pattern, "", content, count=len(matches))
            content = f'import {{ {cleaned_exports} }} from "{alias}";\n' + content

    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Sanitized: {filepath}")

def main():
    base_dir = "src"
    for root, dirs, files in os.walk(base_dir):
        # We also sanitize core/shared internally if they use relative paths for what we moved
        for name in files:
            if name.endswith((".vue", ".ts")):
                update_file(os.path.join(root, name))

if __name__ == "__main__":
    main()
