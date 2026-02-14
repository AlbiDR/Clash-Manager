# Backend Architecture: The "Logical Core" Protocol

This document serves as the **Single Source of Truth** for the `Clash-Manager` backend architecture (Google Apps Script / TypeScript).

---

## 1. Principles of the Backend Tier

The backend must be a **Robust, State-Free Transaction Engine**.

- **Atomicity**: Every execution must be self-contained.
- **Validation**: Strict schema enforcement for all incoming and outgoing data.
- **Performance**: Minimize calls to external APIs (Clash API) and Google Sheets (DB).

## 2. Structural Layers (Draft)

- `handlers/`: Entry points for GET/POST requests.
- `logic/`: Pure business logic and calculation engines.
- `services/`: Wrappers for Google Apps Script services (SpreadsheetApp, UrlFetchApp).
- `schemas/`: Valibot definitions for data integrity.

---

*This document is currently under construction. Follow the philosophy established in the Frontend Bible for structure and naming conventions.*
