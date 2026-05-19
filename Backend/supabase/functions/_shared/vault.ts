// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * L1 Core: Vault Secret Broker
 * Fetches decrypted secrets from Supabase Vault via the substrate.get_vault_secret RPC.
 */
async function getVaultSecret(supabase: SupabaseClient, name: string): Promise<string> {
    const { data, error } = await supabase.rpc('get_vault_secret', { p_name: name });
    
    if (error) {
        console.warn(`[Vault] Failed to retrieve secret '${name}' from database vault: ${error.message}`);
        return "";
    }
    
    return data || "";
}

/**
 * L1 Core: Unified Configuration Loader
 * Attempts to load secrets from Vault first, falling back to Deno environment variables.
 */
export async function loadConfig(supabase: SupabaseClient, keys: string[]) {
    const config: Record<string, string> = {};
    
    await Promise.all(keys.map(async (key) => {
        // 1. Try Vault
        const vaultValue = await getVaultSecret(supabase, key);
        if (vaultValue) {
            config[key] = vaultValue;
        } else {
            // 2. Fallback to Environment
            config[key] = Deno.env.get(key) || "";
        }
    }));
    
    return config;
}
