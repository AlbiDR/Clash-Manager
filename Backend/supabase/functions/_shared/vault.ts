// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as v from "npm:valibot@1.4.1";

/**
 * L1 Core: Vault Secret Broker
 * Fetches decrypted secrets from Supabase Vault via the substrate.get_vault_secret RPC.
 */
async function getVaultSecret(supabase: SupabaseClient, secretName: string): Promise<string> {
    // [THREAT:] Unvalidated RPC results could leak implementation details or cause runtime crashes
    // if the database schema drift causes the RPC to return unexpected types (e.g. object instead of string).
    // [DECISION LOG] Explicitly validating that secrets are strings before consumption at the core layer.
    const { data: rawSecret, error: vaultError } = await supabase.rpc('get_vault_secret', { p_name: secretName });
    
    if (vaultError) {
        console.warn(`[Vault] Failed to retrieve secret '${secretName}' from database vault: ${vaultError.message}`);
        return "";
    }

    // [THREAT:] PostgREST auto-parses text values that are valid JSON (e.g. a stored
    // JSON array for ROYALE_API_KEYS) into a JS object before the client receives them.
    // Strictly checking v.string() therefore fails with "received object".
    // [DECISION LOG] Coerce any non-null, non-string vault return to a JSON string
    // so downstream consumers (setKeys, loadConfig) receive a consistent string type.
    if (rawSecret === null || rawSecret === undefined) {
        console.warn(`[Vault] Secret '${secretName}' not found in vault.`);
        return "";
    }
    if (typeof rawSecret !== "string") {
        return JSON.stringify(rawSecret);
    }
    return rawSecret;

}

/**
 * L1 Core: Unified Configuration Loader
 * Attempts to load secrets from Vault first, falling back to Deno environment variables.
 */
export async function loadConfig(supabase: SupabaseClient, configKeys: string[]) {
    const config: Record<string, string> = {};
    
    await Promise.all(configKeys.map(async (configKey) => {
        // 1. Try Vault
        // [DECISION LOG] Vault secrets are prioritized over environment variables to ensure
        // that production secrets can be rotated in the DB without redeploying the Edge Function.
        const vaultValue = await getVaultSecret(supabase, configKey);
        if (vaultValue) {
            config[configKey] = vaultValue;
        } else {
            // 2. Fallback to Environment
            // [THREAT:] Relying on environment variables as a fallback can lead to configuration drift
            // if the environment is not synced with the Vault.
            config[configKey] = Deno.env.get(configKey) || "";
        }
    }));
    
    return config;
}
