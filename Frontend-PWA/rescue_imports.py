import os
import re

def fix_imports_in_comments(filepath):
    try:
        with open(filepath, 'r') as f:
            content = f.read()
    except Exception:
        return

    original_content = content

    # Regex to find imports inside block comments at the start of the file
    # Matches: /** ... import ... */
    # We want to extract the import and place it AFTER the comment block
    
    # This regex looks for a block comment at start, capturing content inside
    comment_block_re = re.compile(r'^\s*/\*\*(.*?)\*/', re.DOTALL)
    
    match = comment_block_re.search(content)
    if match:
        comment_content = match.group(1)
        # Find all import statements inside the comment content
        imports_in_comment = re.findall(r'(import\s+.*?;\s*)', comment_content, re.DOTALL)
        
        if imports_in_comment:
            # Remove imports from the comment content
            new_comment_content = comment_content
            for imp in imports_in_comment:
                new_comment_content = new_comment_content.replace(imp, "")
            
            # Reconstruct the file: 
            # 1. The cleaned comment block
            # 2. The extracted imports
            # 3. The rest of the file
            
            cleaned_comment_block = f"/**{new_comment_content}*/"
            extracted_imports_str = "\n".join([imp.strip() for imp in imports_in_comment])
            
            rest_of_file = content[match.end():]
            
            new_content = cleaned_comment_block + "\n" + extracted_imports_str + "\n" + rest_of_file
            
            with open(filepath, 'w') as f:
                f.write(new_content)
            print(f"Fixed comment-trapped imports: {filepath}")

def main():
    base_dir = "src"
    for root, dirs, files in os.walk(base_dir):
        for name in files:
            if name.endswith((".vue", ".ts")):
                fix_imports_in_comments(os.path.join(root, name))

if __name__ == "__main__":
    main()
