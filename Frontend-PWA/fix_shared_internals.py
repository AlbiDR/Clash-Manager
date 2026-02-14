import os
import re

shared_dir = "/Users/ADR/.gemini/antigravity/clash-manager/Frontend-PWA/src/shared"

ui_components = {
    "Icon", "BaseCard", "BaseCardSkeleton", "StatusPill", "MomentumPill", 
    "StatisticItem", "ErrorState", "EmptyState", "ErrorBoundary", 
    "CardActions", "Toast", "ToastContainer", "SelectionBar", 
    "ConsoleHeader", "ConsoleLayout", "FloatingDock", "HeaderInfoOverlay"
}

composables = {
    "useHaptics", "useWakeLock", "useConnectionStatus", "useUiCoordinator", 
    "useTheme", "useNetworkInfo", "useLongPress", "useListFilter", 
    "useHeaderScroll", "useProgressiveList", "useCardMechanics"
}

directives = {
    "vTactile", "vTooltip"
}

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find all imports from "@shared"
    # Pattern: import { ... } from "@shared";
    pattern = r'import\s+\{(.*?)\}\s+from\s+"@shared";?'
    
    def replace_match(match):
        imports_str = match.group(1)
        imports = [i.strip() for i in imports_str.split(',')]
        
        new_imports = []
        
        # Determine current file depth
        rel_path = os.path.relpath(filepath, shared_dir)
        parts = rel_path.split(os.sep)
        
        # Current directory is parts[0]
        curr_dir = parts[0]
        
        for imp in imports:
            if not imp: continue
            
            # Map the import to its relative path
            target_path = ""
            if imp in ui_components:
                if curr_dir == "ui":
                    target_path = f"./{imp}.vue"
                else:
                    target_path = f"../ui/{imp}.vue"
            elif imp in composables:
                if curr_dir == "composables":
                    target_path = f"./{imp}"
                else:
                    target_path = f"../composables/{imp}"
            elif imp in directives:
                if curr_dir == "directives":
                    target_path = f"./{imp}"
                else:
                    target_path = f"../directives/{imp}"
            
            if target_path:
                # Vue components might need ".vue" extension removed for default imports if not named
                # But here we are using named exports in index.ts, however standard is default export in the file.
                # Let's check if the files have default exports.
                # Yes, index.ts says: export { default as Icon } from "./ui/Icon.vue";
                
                if imp in ui_components:
                    new_imports.append(f'import {imp} from "{target_path}";')
                else:
                    new_imports.append(f'import {{ {imp} }} from "{target_path}";')
            else:
                # If we don't know where it's from, keep it (though it shouldn't happen)
                print(f"Warning: Unknown import {imp} in {filepath}")
                new_imports.append(f'import {{ {imp} }} from "@shared";')

        return "\n".join(new_imports)

    new_content = re.sub(pattern, replace_match, content)
    
    # Special case: handle combined imports and multiple lines
    # Also handle Vue template script blocks
    # Actually re.sub with my match function handles most of it.
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        return True
    return False

for root, dirs, files in os.walk(shared_dir):
    for file in files:
        if file.endswith(('.vue', '.ts')):
            if fix_file(os.path.join(root, file)):
                print(f"Fixed {file}")
