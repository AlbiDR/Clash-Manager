import os

# Manual mappings for the specific files identified by grep
REPLACEMENTS = {
    "src/core/services/useShowcaseMode.ts": [
        ('import { useBlueprintMode, useSyntheticMode } from "@core";', 
         'import { useBlueprintMode } from "./useBlueprintMode";\nimport { useSyntheticMode } from "./useSyntheticMode";')
    ],
    "src/core/api/useApiState.ts": [
        ('import { getApiUrl, isConfigured, ping } from "@core";', 
         'import { getApiUrl, isConfigured, ping } from "./GasClient";')
    ],
    "src/core/services/useExternalLink.ts": [
        ('import { useToast } from "@core";', 
         'import { useToast } from "./useToast";')
    ],
    "src/core/services/useBatchQueue.ts": [
        ('import { useAppSettings, useExternalLink, useToast } from "@core";',
         'import { useAppSettings } from "./useAppSettings";\nimport { useExternalLink } from "./useExternalLink";\nimport { useToast } from "./useToast";')
    ],
    "src/core/services/useAppSettings.ts": [
        ('import { idb } from "@core";',
         'import { idb } from "./StorageService";')
    ],
    "src/core/services/useBenchmarking.ts": [
        ('import { useAppSettings, useClashData } from "@core";',
         'import { useAppSettings } from "./useAppSettings";\nimport { useClashData } from "./useClashData";')
    ],
    "src/core/services/useShareTarget.ts": [
        ('import { useToast } from "@core";',
         'import { useToast } from "./useToast";')
    ],
    "src/core/services/useBadge.ts": [
        ('import { useAppSettings, useBroadcastChannel } from "@core";',
         'import { useAppSettings } from "./useAppSettings";\nimport { useBroadcastChannel } from "./useBroadcastChannel";')
    ],
    "src/core/services/useConsoleController.ts": [
        ('import { useApiState, useBatchQueue, useBlueprintMode, useDeepLinkHandler, useShowcaseMode, useSyntheticMode } from "@core";',
         'import { useApiState } from "../api/useApiState";\nimport { useBatchQueue } from "./useBatchQueue";\nimport { useBlueprintMode } from "./useBlueprintMode";\nimport { useDeepLinkHandler } from "./useDeepLinkHandler";\nimport { useShowcaseMode } from "./useShowcaseMode";\nimport { useSyntheticMode } from "./useSyntheticMode";')
    ]
}

def apply_fixes():
    for filepath, changes in REPLACEMENTS.items():
        if not os.path.exists(filepath):
            print(f"Skipping {filepath} (not found)")
            continue
            
        with open(filepath, 'r') as f:
            content = f.read()
            
        new_content = content
        for old, new in changes:
            new_content = new_content.replace(old, new)
            
        if new_content != content:
            with open(filepath, 'w') as f:
                f.write(new_content)
            print(f"Fixed {filepath}")
        else:
            print(f"No changes for {filepath}")

if __name__ == "__main__":
    apply_fixes()
