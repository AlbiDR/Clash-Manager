-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


UPDATE drivers.members
   SET next_poll_at = NULL
 WHERE is_active = true
   AND player_tag NOT IN (
       SELECT DISTINCT player_tag FROM drivers.player_battles
   );
