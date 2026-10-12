// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { afterEach, describe, expect, it } from 'vitest';
import * as CONFIG from '../config.ts';

describe('shared Backend Config Kernel (config.ts)', () => {
    const originalDeno = (globalThis as any).Deno;

    afterEach(() => {
        if (originalDeno !== undefined) {
            (globalThis as any).Deno = originalDeno;
        } else {
            delete (globalThis as any).Deno;
        }
    });

    describe('getAllowedOrigins()', () => {
        it('returns empty array when Deno global is undefined', () => {
            delete (globalThis as any).Deno;
            expect(CONFIG.getAllowedOrigins()).toEqual([]);
        });

        it('returns empty array when ALLOWED_ORIGINS env var is missing', () => {
            (globalThis as any).Deno = {
                env: {
                    get: (key: string) => (key === 'ALLOWED_ORIGINS' ? undefined : null),
                },
            };
            expect(CONFIG.getAllowedOrigins()).toEqual([]);
        });

        it('returns empty array when ALLOWED_ORIGINS env var is empty string', () => {
            (globalThis as any).Deno = {
                env: {
                    get: (key: string) => (key === 'ALLOWED_ORIGINS' ? '' : null),
                },
            };
            expect(CONFIG.getAllowedOrigins()).toEqual([]);
        });

        it('parses, trims, and filters empty entries from comma-separated origins', () => {
            (globalThis as any).Deno = {
                env: {
                    get: (key: string) =>
                        key === 'ALLOWED_ORIGINS'
                            ? '  https://app.clashmanager.com , https://staging.clashmanager.com , ,   '
                            : null,
                },
            };
            expect(CONFIG.getAllowedOrigins()).toEqual([
                'https://app.clashmanager.com',
                'https://staging.clashmanager.com',
            ]);
        });
    });

    describe('Kernel Thresholds & Business Constants', () => {
        it('exports expected profiler, rescan, and shadow discovery limits', () => {
            expect(CONFIG.PROFILER_BATCH_CEILING).toBe(1000);
            expect(CONFIG.RECENT_SCAN_THRESHOLD_MS).toBe(30 * 60 * 1000);
            expect(CONFIG.RESCAN_BATCH_LIMIT).toBe(250);
            expect(CONFIG.SHADOW_DISCOVERY_LIMIT).toBe(75);
        });

        it('exports non-empty keyword list and positive concurrency limits', () => {
            expect(Array.isArray(CONFIG.DISCOVERY_KEYWORDS)).toBe(true);
            expect(CONFIG.DISCOVERY_KEYWORDS.length).toBeGreaterThan(0);
            expect(CONFIG.CONCURRENCY_PROFILER).toBeGreaterThan(0);
            expect(CONFIG.CONCURRENCY_RESCAN).toBeGreaterThan(0);
            expect(CONFIG.CONCURRENCY_DISCOVERY_KEYWORDS).toBeGreaterThan(0);
            expect(CONFIG.CONCURRENCY_DISCOVERY_TOURNAMENTS).toBeGreaterThan(0);
        });

        it('exports work budget limits with reserve safety margin', () => {
            expect(CONFIG.SCANNER_WORK_BUDGET_MS).toBe(120_000);
            expect(CONFIG.SCANNER_CHECKPOINT_RESERVE_MS).toBe(30_000);
            expect(CONFIG.SCANNER_WORK_BUDGET_MS).toBeGreaterThan(CONFIG.SCANNER_CHECKPOINT_RESERVE_MS);
        });

        it('exports rate limiting and fanout bounds', () => {
            expect(CONFIG.RATE_LIMIT_IP_MAX_REQUESTS).toBe(60);
            expect(CONFIG.RATE_LIMIT_IP_WINDOW_MS).toBe(60 * 1000);
            expect(CONFIG.RATE_LIMIT_IP_TARGET_MAX_REQUESTS).toBe(20);
            expect(CONFIG.RATE_LIMIT_IP_TARGET_WINDOW_MS).toBe(60 * 1000);
            expect(CONFIG.RATE_LIMIT_BUCKET_SWEEP_THRESHOLD).toBe(5000);
            expect(CONFIG.MAX_BATTLELOG_FANOUT_KEYS).toBe(5);
        });

        it('exports valid RPOS scoring coefficients', () => {
            expect(CONFIG.RPOS_TROPHY_WEIGHT).toBe(1.0);
            expect(CONFIG.RPOS_DONATION_WEIGHT).toBe(0.1);
            expect(CONFIG.RPOS_WIN_RATE_RATIO).toBe(0.35);
            expect(CONFIG.RPOS_THREE_CROWN_MULT).toBe(1.25);
            expect(CONFIG.RPOS_LEGACY_WAR_WEIGHT).toBe(10);
            expect(CONFIG.RPOS_CHALLENGE_CARD_WEIGHT).toBe(0.1);
            expect(CONFIG.RPOS_CHALLENGE_CARD_CAP).toBe(10000);
            expect(CONFIG.RPOS_GC_BONUS_RATIO).toBe(0.4);
            expect(CONFIG.GRAND_CHALLENGE_WIN_THRESHOLD).toBe(12);
        });

        it('exports expected location and fallback constants', () => {
            expect(CONFIG.GLOBAL_LOCATION).toBe('global');
            expect(CONFIG.GLOBAL_REGION_LABEL).toBe('Global');
            expect(CONFIG.LOCATION_ID_INTERNATIONAL).toBe(57000101);
            expect(CONFIG.DEFAULT_FALLBACK_COUNTRY).toBe('United States');
            expect(CONFIG.DEFAULT_FALLBACK_ID).toBe(57000120);
            expect(CONFIG.INITIAL_INDEX).toBe(0);
        });
    });
});
