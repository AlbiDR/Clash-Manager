// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./client.ts', () => ({ supabase: { rpc } }));
import { RecruitWriter } from './recruit-writer.ts';

beforeEach(() => rpc.mockReset().mockResolvedValue({ error: null }));
const leads = (count: number) => Array.from({ length: count }, (_, i) => ({ tag: `#P${String(i).padStart(5, '0')}`, name: `Player ${i}`, trophies: 0 }));

describe('incremental recruit checkpoint writes', () => {
    it('checkpoints 1001 leads in bounded pairs instead of one oversized whole-run payload', async () => {
        const writer = new RecruitWriter('SHADOW');
        const values = leads(1001);
        await writer.add(values);
        expect(writer.harvested).toBe(1000); // durable progress exists before the final flush
        await writer.add(values); // repeated discovery does not create another write
        await writer.finish();
        expect(writer.harvested).toBe(1001);
        expect(writer.duplicates).toBe(1001);
        const calls = rpc.mock.calls;
        expect(calls).toHaveLength(42);
        for (let i = 0; i < calls.length; i += 2) {
            expect(calls[i][0]).toBe('sync_players');
            expect(calls[i + 1][0]).toBe('sync_recruits');
            expect(calls[i][1].p_players.length).toBeLessThanOrEqual(50);
            expect(calls[i + 1][1].p_recruits.map((row: { player_tag: string }) => row.player_tag))
                .toEqual(calls[i][1].p_players.map((row: { player_tag: string }) => row.player_tag));
        }
    });
    it('preserves earlier commits and skips dependent recruit writes when a later registry chunk fails', async () => {
        rpc.mockImplementation(async (name: string, args: { p_players?: { player_tag: string }[] }) => ({
            error: name === 'sync_players' && args.p_players?.[0].player_tag === '#P00050' ? { message: 'registry unavailable' } : null,
        }));
        const writer = new RecruitWriter('TOURNAMENT_AUTO');
        await writer.add(leads(100)); await writer.finish();
        expect(writer.harvested).toBe(50);
        expect(writer.error).toContain('registry unavailable');
        expect(rpc.mock.calls.filter(([name]) => name === 'sync_recruits')).toHaveLength(1);
    });
    it('serializes concurrent producers and retains only unique accepted tags', async () => {
        const writer = new RecruitWriter('SHADOW');
        await Promise.all([writer.add(leads(70)), writer.add(leads(90))]); await writer.finish();
        expect(writer.harvested).toBe(90);
        const tags = rpc.mock.calls.filter(([name]) => name === 'sync_recruits')
            .flatMap(([, args]) => args.p_recruits.map((row: { player_tag: string }) => row.player_tag));
        expect(new Set(tags).size).toBe(tags.length);
    });
});
