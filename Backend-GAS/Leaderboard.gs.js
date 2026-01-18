name: Deploy GAS

on:
  push:
    branches: ["Stable", "Beta"]
    paths:
      - "Backend-GAS/**" # Only triggers if backend files change
  workflow_dispatch: # Allows you to click "Run workflow" manually

# ⚡ CONCURRENCY: If you push 3 backend changes in a row,
# it cancels the old ones and only pushes the latest code to Google.
concurrency:
  group: gas-sync-${{ github.ref }}
  cancel-in-progress: true

jobs:
  deploy-gas:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      # 🛡️ SECRET VALIDATION: Fail fast if secrets are missing
      - name: Validate Secrets
        run: |
          if [ -z "${{ secrets.SCRIPT_ID }}" ]; then
            echo "::error::❌ CRITICAL ERROR: SCRIPT_ID secret is missing."
            echo "Please add the 'SCRIPT_ID' secret to your GitHub Repository Settings."
            echo "Value should be the Script ID found in Apps Script > Project Settings."
            exit 1
          fi
          if [ -z "${{ secrets.CLASPRC_JSON }}" ]; then
            echo "::error::❌ CRITICAL ERROR: CLASPRC_JSON secret is missing."
            echo "Please add the 'CLASPRC_JSON' secret to your GitHub Repository Settings."
            echo "Run 'clasp login' locally and copy the content of ~/.clasprc.json."
            exit 1
          fi

      # Using --no-fund and --no-audit makes the Clasp installation faster
      - name: Install Clasp
        run: pnpm add -g @google/clasp

      - name: Create Clasp Auth File
        run: echo "$CLASPRC_JSON" > ~/.clasprc.json
        env:
          CLASPRC_JSON: ${{ secrets.CLASPRC_JSON }}

      - name: Create Clasp Project Settings
        run: |
          cd Backend-GAS
          echo '{"scriptId":"${{ secrets.SCRIPT_ID }}","rootDir":"."}' > .clasp.json

      - name: Push Code to Google Apps Script
        run: |
          cd Backend-GAS
          clasp push --force
