import os
import re

# Internal resolution map for Core (relative to src/core/)
CORE_MAP = {
    "useApiState": "./api/useApiState",
    "GasClient": "./api/GasClient",
    "gasRequest": "./api/GasClient",
    "fetchRemote": "./api/GasClient",
    "StorageService": "./services/StorageService",
    "idb": "./services/StorageService",
    "useClashData": "./services/useClashData",
    "useStoragePersistence": "./services/useStoragePersistence",
    "useAppSettings": "./services/useAppSettings",
    "useBenchmarking": "./services/useBenchmarking",
    "useBatchQueue": "./services/useBatchQueue",
    "useBadge": "./services/useBadge",
    "useConsoleController": "./services/useConsoleController",
    "useBroadcastChannel": "./services/useBroadcastChannel",
    "useDeepLinkHandler": "./services/useDeepLinkHandler",
    "useBackHandler": "./services/useBackHandler",
    "useShareTarget": "./services/useShareTarget",
    "useShowcaseMode": "./services/useShowcaseMode",
    "useSyntheticMode": "./services/useSyntheticMode",
    "useBlueprintMode": "./services/useBlueprintMode",
    "useToast": "./services/useToast",
    "useShare": "./services/useShare",
    "useExternalLink": "./services/useExternalLink",
    "warMath": "./utils/warMath",
    "formatters": "./utils/formatters",
    "mockData": "./utils/mockData",
    "sortOptions": "./utils/sortOptions",
    "bezier": "./utils/bezier"
}

# Internal resolution map for Shared (relative to src/shared/)
SHARED_MAP = {
    "useConnectionStatus": "./composables/useConnectionStatus",
    "useHaptics": "./composables/useHaptics",
    "useWakeLock": "./composables/useWakeLock",
    "useUiCoordinator": "./composables/useUiCoordinator",
    "useTheme": "./composables/useTheme",
    "useNetworkInfo": "./composables/useNetworkInfo",
    "useLongPress": "./composables/useLongPress",
    "useListFilter": "./composables/useListFilter",
    "useHeaderScroll": "./composables/useHeaderScroll",
    "useProgressiveList": "./composables/useProgressiveList",
    "useCardMechanics": "./composables/useCardMechanics",
    "vTactile": "./directives/vTactile",
    "vTooltip": "./directives/vTooltip",
    "Icon": "./ui/Icon.vue",
    "BaseCard": "./ui/BaseCard.vue",
    "BaseCardSkeleton": "./ui/BaseCardSkeleton.vue",
    "StatusPill": "./ui/StatusPill.vue",
    "MomentumPill": "./ui/MomentumPill.vue",
    "StatisticItem": "./ui/StatisticItem.vue",
    "ErrorState": "./ui/ErrorState.vue",
    "EmptyState": "./ui/EmptyState.vue",
    "ErrorBoundary": "./ui/ErrorBoundary.vue",
    "CardActions": "./ui/CardActions.vue",
    "Toast": "./ui/Toast.vue",
    "ToastContainer": "./ui/ToastContainer.vue",
    "SelectionBar": "./ui/SelectionBar.vue"
}

def get_rel_path(current_file_abs, target_rel_from_root):
    # current_file_abs: /abs/path/to/src/core/services/useClashData.ts
    # target_rel_from_root: ./services/useSyntheticMode
    
    # Identify if we are in core or shared
    if "/src/core/" in current_file_abs:
        root_seg = "/src/core/"
    elif "/src/shared/" in current_file_abs:
        root_seg = "/src/shared/"
    else:
        return None

    # strict split to find base
    base_parts = current_file_abs.split(root_seg)
    base_dir = base_parts[0] + root_seg # /abs/path/to/src/core/
    
    # Absolute path of the target file
    # Remove ./ from start
    clean_target = target_rel_from_root.replace("./", "")
    target_abs = os.path.join(base_dir, clean_target)
    
    # Directory of current file
    current_dir = os.path.dirname(current_file_abs)
    
    # Calc relative path
    rel = os.path.relpath(target_abs, current_dir)
    
    if not rel.startswith("."):
        rel = "./" + rel
        
    return rel

def fix_imports(filepath):
    # Skip barrels
    if filepath.endswith("index.ts"): return

    with open(filepath, 'r') as f:
        content = f.read()
    
    original_content = content
    
    is_core = "/src/core/" in filepath
    is_shared = "/src/shared/" in filepath
    
    if not is_core and not is_shared: return

    mapping = CORE_MAP if is_core else SHARED_MAP
    alias = "@core" if is_core else "@shared"
    
    # Regex for named imports: import { A, B } from "@core"
    # We want to replace this whole block with potentially multiple lines
    
    def replacer(match):
        imports_str = match.group(1)
        # remove newlines and extra spaces
        imports = [i.strip() for i in imports_str.replace("\n", "").split(",") if i.strip()]
        
        lines = []
        remaining_imports = []
        
        for imp in imports:
            # Handle "useClashData as useData"
            parts = imp.split(" as ")
            name = parts[0].strip()
            
            if name in mapping:
                target_rel = mapping[name]
                rel_path = get_rel_path(os.path.abspath(filepath), target_rel)
                if rel_path:
                    # preserve 'as' alias if present
                    import_statement = f'import {{ {imp} }} from "{rel_path}";'
                    lines.append(import_statement)
                else:
                    remaining_imports.append(imp)
            else:
                remaining_imports.append(imp)
        
        if remaining_imports:
            lines.append(f'import {{ {", ".join(remaining_imports)} }} from "{alias}";')
            
        return "\n".join(lines)

    # find usage of alias
    # import { ... } from "@core"
    pattern = re.compile(rf'import\s+{{([^}}]+)}}\s+from\s+["\']{alias}["\'];?')
    content = pattern.sub(replacer, content)
    
    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Decoupled internal imports: {filepath}")

def main():
    for root, dirs, files in os.walk("src"):
        for name in files:
            if name.endswith((".ts", ".vue")):
                fix_imports(os.path.join(root, name))

if __name__ == "__main__":
    main()
