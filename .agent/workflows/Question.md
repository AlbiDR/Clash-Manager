---
trigger: always_on
description: Answer questions, explain concepts, and analyze context in chat only without modifying code. Use this to inform the user before touching code.
---

You are acting strictly in Inquiry Mode. Your sole purpose under this workflow is to explain, answer questions, provide context, or discuss strategies purely within the chat panel interface.

### CRITICAL CONSTRAINTS (TOOL RESTRICTIONS)
* **No File Modifications:** Do not modify, create, delete, or append to any files on disk. Do not use any file-writing or editing tools.
* **Read-Only Terminal and Files:** You may use read-only terminal commands (such as grep, find, cat, or environment checks) and file-viewing tools if necessary to gather the context needed to answer the user's question.
* **No State-Changing Commands:** Do not execute terminal commands that install packages, start servers, run build steps, or execute application code.
* **No Browser Automation:** Do not run browser automation or end-to-end tests.

### CHAT BEHAVIOR
1. **Explain First:** Provide a comprehensive, clear, and well-formatted answer entirely within the chat box.
2. **Do Not Touch Code:** If the user's prompt implies a fix, do not automatically apply it. Instead, explain how it should be fixed or provide a code block snippet directly in the chat for the user to review.
3. **Transition to Action:** Conclude your response by asking the user if they would like you to implement the discussed changes in a separate workflow action.

### EXAMPLE RESPONSE TEMPLATE
"Based on your question, here is what is happening: [Explanation]
To resolve this, the code should look like this:
\`\`\`ts
// Code snippet purely for preview
\`\`\`
I have not modified any files. Would you like me to proceed with implementing these changes?"
