-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

SET LOCAL lock_timeout = '3s';

DO $migration$
DECLARE
    v_named_index oid := to_regclass('drivers.uq_player_battle');
    v_pair_index oid;
    v_pair_columns_not_null boolean;
BEGIN
    SELECT i.indexrelid
    INTO v_pair_index
    FROM pg_index i
    JOIN pg_class index_class ON index_class.oid = i.indexrelid
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    WHERE i.indrelid = 'drivers.player_battles'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indislive
      AND i.indimmediate
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 2
      AND i.indnatts = 2
      AND access_method.amname = 'btree'
      AND (
          SELECT array_agg(a.attname::text ORDER BY k.ordinality)
          FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, ordinality)
          JOIN pg_attribute a
            ON a.attrelid = i.indrelid
           AND a.attnum = k.attnum
      ) = ARRAY['player_tag', 'battle_time']::text[]
    ORDER BY (i.indexrelid = v_named_index) DESC
    LIMIT 1;

    SELECT count(*) = 2 AND bool_and(a.attnotnull)
    INTO v_pair_columns_not_null
    FROM pg_attribute a
    WHERE a.attrelid = 'drivers.player_battles'::regclass
      AND a.attname IN ('player_tag', 'battle_time')
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF v_pair_columns_not_null IS DISTINCT FROM true THEN
        RAISE EXCEPTION
            'drivers.player_battles must have non-null player_tag and battle_time columns before adding its unique arbiter';
    END IF;

    IF v_pair_index IS NOT NULL THEN
        IF v_pair_index = v_named_index THEN
            RETURN;
        ELSIF v_named_index IS NOT NULL THEN
            RAISE EXCEPTION
                'drivers.uq_player_battle exists but is not a valid full unique arbiter on (player_tag, battle_time)';
        ELSE
            RAISE EXCEPTION
                'equivalent pair unique index exists under another name; refusing to create a redundant arbiter';
        END IF;
    END IF;

    IF v_named_index IS NOT NULL THEN
        RAISE EXCEPTION
            'drivers.uq_player_battle exists but is not a valid full unique arbiter on (player_tag, battle_time)';
    END IF;

    EXECUTE 'CREATE UNIQUE INDEX uq_player_battle
        ON drivers.player_battles (player_tag, battle_time)';
END
$migration$;

COMMIT;
