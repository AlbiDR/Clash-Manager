-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
  Migration: 20260530195000_apply_manual_crowns_from_tsv.sql
  ------------------------------------------------------
  Purpose: Populate manual_crowns in drivers.clan_voyage_contributions
  using the TSV data provided by the user. This ensures manual overrides
  are applied correctly after the override semantics migration.
*/

DO $$
DECLARE
    v_id BIGINT;
BEGIN
    SELECT id INTO v_id FROM drivers.clan_voyage WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'No active voyage found';
    END IF;

    -- Upsert manual crowns for each player
    INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, manual_crowns, crowns)
    VALUES
        (v_id, '#YYPP2QJQ0', 255, 255),
        (v_id, '#9CQCP208V', 224, 224),
        (v_id, '#G0JJPY00', 218, 218),
        (v_id, '#UJL9990UC', 154, 154),
        (v_id, '#2PQPG2UQU', 145, 145),
        (v_id, '#PQ9QQP0QQ', 128, 128),
        (v_id, '#298GVRQJ2', 116, 116),
        (v_id, '#CVC80V899', 107, 107),
        (v_id, '#J902Q8LPP', 103, 103),
        (v_id, '#PC0J0JPJ0', 91, 91),
        (v_id, '#PP80QG99', 87, 87),
        (v_id, '#88CR2QJUP', 86, 86),
        (v_id, '#28Y2YCCPC', 81, 81),
        (v_id, '#J298P8L', 81, 81),
        (v_id, '#Y9PC9YCV', 77, 77),
        (v_id, '#2UC80YLG8', 74, 74),
        (v_id, '#P8028CCY', 71, 71),
        (v_id, '#PR8YCCRR', 70, 70),
        (v_id, '#2GUURY2JG', 66, 66),
        (v_id, '#VJ98VQGU2', 63, 63),
        (v_id, '#8GQ02CYRY', 61, 61),
        (v_id, '#CLRVLG2Y', 61, 61),
        (v_id, '#QJJ88QRR', 60, 60),
        (v_id, '#YGPQY8G9Y', 59, 59),
        (v_id, '#2LQUVVC9G', 47, 47),
        (v_id, '#VJ0CU089C', 43, 43),
        (v_id, '#GGJ2GUY8', 42, 42),
        (v_id, '#UG2YCQCG', 41, 41),
        (v_id, '#8UVQU0C2', 38, 38),
        (v_id, '#8YJ0UPC8Y', 35, 35),
        (v_id, '#8Y82P2QY', 28, 28),
        (v_id, '#2Y99C9YRV', 25, 25),
        (v_id, '#9RQL8PULG', 22, 22),
        (v_id, '#2P0CJVP', 10, 10)
    ON CONFLICT (voyage_id, player_tag) DO UPDATE
    SET manual_crowns = EXCLUDED.manual_crowns,
        crowns = EXCLUDED.crowns;
END $$;
