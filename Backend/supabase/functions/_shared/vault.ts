// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as v from "npm:valibot";

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

    const secretValidation = v.safeParse(v.string(), rawSecret);
    if (!secretValidation.success) {
        console.error(`[Vault] Type mismatch for secret '${secretName}': expected string, received ${typeof rawSecret}`);
        return "";
    }
    
    return secretValidation.output;
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
