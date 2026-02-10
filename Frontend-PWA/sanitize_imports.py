import os
import re

# Symbol to Alias Mappings
MAPPINGS = {
    # Shared Symbols
    "Icon": "@shared", "BaseCard": "@shared", "BaseCardSkeleton": "@shared",
    "StatusPill": "@shared", "MomentumPill": "@shared", "StatisticItem": "@shared",
    "ErrorState": "@shared", "EmptyState": "@shared", "ErrorBoundary": "@shared",
    "CardActions": "@shared", "Toast": "@shared", "ToastContainer": "@shared",
    "SelectionBar": "@shared", "vTactile": "@shared", "vTooltip": "@shared",
    "useHaptics": "@shared", "useWakeLock": "@shared", "useConnectionStatus": "@shared",
    "useUiCoordinator": "@shared", "useTheme": "@shared", "useNetworkInfo": "@shared",
    "useLongPress": "@shared", "useListFilter": "@shared", "useHeaderScroll": "@shared",
    "useProgressiveList": "@shared", "useCardMechanics": "@shared",
    
    # Core Symbols
    "useApiState": "@core", "useClashData": "@core", "useStoragePersistence": "@core",
    "useAppSettings": "@core", "warMath": "@core", "idb": "@core",
    "GasClient": "@core", "useBenchmarking": "@core", "useBatchQueue": "@core",
    "useBadge": "@core", "useConsoleController": "@core",
    "useBroadcastChannel": "@core", "useDeepLinkHandler": "@core",
    "useBackHandler": "@core", "useShareTarget": "@core", "useShowcaseMode": "@core",
    "useSyntheticMode": "@core", "useBlueprintMode": "@core", "useToast": "@core",
    "useShare": "@core", "useExternalLink": "@core",
    "dismissRecruits": "@core", "undismissRecruits": "@core", "fetchRemote": "@core",
    "ping": "@core", "NetworkError": "@core", "triggerBackendUpdate": "@core"
}

UTILS_MAPPINGS = {
    "formatters": "@core/utils/formatters",
    "mockData": "@core/utils/mockData",
    "bezier": "@core/utils/bezier",
    "sortOptions": "@core/utils/sortOptions"
}

def update_file(filepath):
    if "sanitize_imports.py" in filepath: return

    try:
        with open(filepath, 'r') as f:
            content = f.read()
    except Exception:
        return

    original_content = content

    # REPLACEMENT LOGIC FOR STATIC IMPORTS
    import_re = re.compile(r'import\s+({[^}]+})\s+from\s+["\']([^"\']+)["\'];?')

    def replace_imports(match):
        symbols_str = match.group(1).replace("{", "").replace("}", "")
        source = match.group(2)
        symbols = [s.strip() for s in symbols_str.split(",")]
        
        if source in ["@core", "@shared", "vue", "vue-router", "valibot", "@formkit/auto-animate/vue"]:
            return match.group(0)

        new_groups = {}
        remaining = []
        
        for s in symbols:
            clean_s = s.split(" as ")[0].strip()
            if clean_s in MAPPINGS:
                alias = MAPPINGS[clean_s]
                if alias not in new_groups: new_groups[alias] = []
                new_groups[alias].append(s)
            else:
                remaining.append(s)
        
        if not new_groups:
            return match.group(0)
            
        output_parts = []
        for alias, syms in new_groups.items():
            output_parts.append(f'import {{ {", ".join(syms)} }} from "{alias}";')
        
        if remaining:
            output_parts.append(f'import {{ {", ".join(remaining)} }} from "{source}";')
            
        return "\n".join(output_parts)

    content = import_re.sub(replace_imports, content)

    # REPLACEMENT LOGIC FOR DYNAMIC IMPORTS import("...")
    # More robust regex for dynamic imports
    content = re.sub(r'import\s*\(\s*["\']([^"\']+)["\']\s*\)', 
                     lambda m: 'import("@core")' if ("gasclient" in m.group(1).lower()) else m.group(0), 
                     content)

    # Simple Default Import Replacement
    for sym, alias in MAPPINGS.items():
        pattern = rf'import\s+{sym}\s+from\s+["\']([^"\']*/{sym}(?:\.vue|\.ts)?)["\']'
        content = re.sub(pattern, rf'import {{ {sym} }} from "{alias}"', content)

    for util, alias in UTILS_MAPPINGS.items():
        pattern = rf'from\s+["\']([^"\']*/{util})["\']'
        content = re.sub(pattern, rf'from "{alias}"', content)

    # DEDUPLICATE IMPORTS
    for alias in ["@core", "@shared"]:
        im_pattern = rf'import\s+{{\s*([^}}]+)\s*}}\s+from\s+["\']{alias}["\'];?\s*\n?'
        matches = re.findall(im_pattern, content)
        if matches:
            all_exports = []
            for m in matches:
                all_exports.extend([s.strip() for s in m.split(",") if s.strip()])
            
            cleaned_exports = ", ".join(sorted(list(set(all_exports))))
            content = re.sub(im_pattern, "", content)
            
            # Place at top of file but after comments
            first_content = 0
            lines = content.splitlines()
            for i, line in enumerate(lines):
                if line.strip() and not line.strip().startswith("//") and not line.strip().startswith("/*"):
                    first_content = content.find(line)
                    break
            
            content = content[:first_content] + f'import {{ {cleaned_exports} }} from "{alias}";\n' + content[first_content:]

    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Surgically Sanitized: {filepath}")

def main():
    for root, dirs, files in os.walk("src"):
        for name in files:
            if name.endswith((".vue", ".ts")):
                update_file(os.path.join(root, name))

if __name__ == "__main__":
    main()
