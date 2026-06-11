import json
import os
import re

def get_package_json(path):
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    return None

def get_file_content(path):
    if os.path.exists(path):
        with open(path, 'r') as f:
            return f.read()
    return None

def main():
    root_dir = os.getcwd()
    print(f"--- Clash Manager: Python Version Integrity Audit ---")

    # 1. Gather Ground Truth
    package_jsons = [
        os.path.join(root_dir, 'package.json'),
        os.path.join(root_dir, 'Frontend-PWA', 'package.json')
    ]

    versions = []
    for path in package_jsons:
        pkg = get_package_json(path)
        if pkg and 'version' in pkg:
            versions.append(pkg['version'])

    if not versions:
        print("Error: No versions found in package.json files.")
        return

    ground_truth = sorted(versions, reverse=True)[0]
    major_version = ground_truth.split('.')[0]
    print(f"Ground Truth Version: {ground_truth}")

    drift_detected = False

    # 2. Check Package Versions
    for path in package_jsons:
        pkg = get_package_json(path)
        if pkg and pkg.get('version') != ground_truth:
            print(f"[DRIFT] {os.path.relpath(path, root_dir)} version is {pkg.get('version')}, expected {ground_truth}")
            drift_detected = True

    # 3. Check Protocol.ts
    protocol_path = os.path.join(root_dir, 'Backend', 'supabase', 'functions', '_shared', 'protocol.ts')
    protocol_content = get_file_content(protocol_path)
    if protocol_content:
        # Match version: '14.0.0'
        match = re.search(r"version:\s*'([^']+)'", protocol_content)
        if match:
            if match.group(1) != ground_truth:
                print(f"[DRIFT] protocol.ts version is {match.group(1)}, expected {ground_truth}")
                drift_detected = True
        else:
            print(f"[DRIFT] protocol.ts: version string not found.")
            drift_detected = True

    # 4. Check Manifest.json
    manifest_path = os.path.join(root_dir, 'Frontend-PWA', 'public', 'manifest.json')
    manifest_content = get_file_content(manifest_path)
    if manifest_content:
        try:
            manifest_pkg = json.loads(manifest_content)
            expected_id = f"clash-manager-v{major_version}"
            if manifest_pkg.get('id') != expected_id:
                print(f"[DRIFT] manifest.json id is {manifest_pkg.get('id')}, expected {expected_id}")
                drift_detected = True
        except:
            print(f"[DRIFT] manifest.json: failed to parse JSON.")
            drift_detected = True

    # 5. Check useProgressiveList.ts
    prog_list_path = os.path.join(root_dir, 'Frontend-PWA', 'src', 'core', 'services', 'useProgressiveList.ts')
    prog_list_content = get_file_content(prog_list_path)
    if prog_list_content:
        expected_comment = f"[PERF] Optimized for v{ground_truth}:"
        if expected_comment not in prog_list_content:
            print(f"[DRIFT] useProgressiveList.ts version comment mismatch. Expected: {expected_comment}")
            drift_detected = True

    # 6. Check Catalog usage
    workspace_path = os.path.join(root_dir, 'pnpm-workspace.yaml')
    workspace_content = get_file_content(workspace_path)
    if workspace_content:
        # Simple regex to find catalog dependencies
        # This is basic, but helps identify what should be "catalog:"
        catalog_section = re.search(r'catalogs:\s*default:(.*?)(?:\n\n|\Z)', workspace_content, re.DOTALL)
        if catalog_section:
            catalog_deps = re.findall(r'^\s+["\']?(@?[a-z0-9/-]+)["\']?:', catalog_section.group(1), re.MULTILINE)

            for path in package_jsons:
                pkg = get_package_json(path)
                if pkg:
                    all_deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
                    for dep in catalog_deps:
                        if dep in all_deps and all_deps[dep] != 'catalog:':
                            print(f"[CATALOG] {os.path.relpath(path, root_dir)}: dependency '{dep}' is '{all_deps[dep]}', should be 'catalog:'")
                            drift_detected = True

    # 7. Check README badges
    readme_paths = [
        os.path.join(root_dir, 'README.md'),
        os.path.join(root_dir, 'Frontend-PWA', 'README.md'),
        os.path.join(root_dir, 'Backend', 'README.md')
    ]
    for path in readme_paths:
        content = get_file_content(path)
        if content:
            # Match -v14.0.0- in shields.io badges
            badge_matches = re.findall(r'-(v\d+\.\d+\.\d+)-', content)
            for version in badge_matches:
                if version != f"v{ground_truth}":
                    print(f"[DOC-DRIFT] {os.path.relpath(path, root_dir)} badge version is {version}, expected v{ground_truth}")
                    drift_detected = True

            # Special check for Roadmap in Backend/README.md
            if 'Backend' in path:
                roadmap_match = re.search(r'Roadmap \(v(\d+\.\d+\.\d+)\)', content)
                if roadmap_match:
                    if roadmap_match.group(1) != ground_truth:
                        print(f"[DOC-DRIFT] Backend/README.md roadmap version is v{roadmap_match.group(1)}, expected v{ground_truth}")
                        drift_detected = True

    if not drift_detected:
        print("✅ Audit Passed: No version drift or catalog violations detected.")
    else:
        print("❌ Audit Failed: Inconsistencies found.")
        exit(1)

if __name__ == "__main__":
    main()
