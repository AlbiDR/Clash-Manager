import os

def fix_file(filepath):
    try:
        with open(filepath, 'r') as f:
            content = f.read()
    except:
        return

    original_content = content
    
    # 1. Fix Composable Imports (Logic)
    # from '../logic/Laboratory/X' -> from '../logic/X'
    content = content.replace("'../logic/Laboratory/", "'../logic/")
    content = content.replace('"../logic/Laboratory/', '"../logic/')
    
    # NEW: Fix Component -> Logic imports (was ../../logic/Laboratory -> ../logic)
    content = content.replace("'../../logic/Laboratory/", "'../logic/")
    content = content.replace('"../../logic/Laboratory/', '"../logic/')
    
    # 2. Fix View Imports (Components)
    # from '../components/Laboratory/X.vue' -> from '../components/X.vue'
    content = content.replace("'../components/Laboratory/", "'../components/")
    content = content.replace('"../components/Laboratory/', '"../components/')
    
    # 3. Fix View Layout Import
    # from '../components/ConsoleLayout.vue' -> from '../../../components/ConsoleLayout.vue'
    content = content.replace("'../components/ConsoleLayout.vue'", "'../../../components/ConsoleLayout.vue'")
    content = content.replace('"../components/ConsoleLayout.vue"', '"../../../components/ConsoleLayout.vue"')
    
    # 4. Fix Component Imports (Icons, etc)
    # If components import from "../components/X.vue" (siblings), they might need adjustment if they used to be strict siblings.
    # But they were in src/components/Laboratory/* and moved to src/features/laboratory/components/*.
    # So sibling imports like "./OtherCard.vue" stay valid.
    # Imports up to shared/core should be absolute @core/@shared, so they are fine.
    
    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed feature imports: {filepath}")

def main():
    target_dir = "src/features/laboratory"
    for root, dirs, files in os.walk(target_dir):
        for name in files:
            if name.endswith((".ts", ".vue")):
                fix_file(os.path.join(root, name))

if __name__ == "__main__":
    main()
