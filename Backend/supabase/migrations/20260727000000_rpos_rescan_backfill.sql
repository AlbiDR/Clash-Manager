-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


UPDATE drivers.recruits
   SET last_scan = NOW() - INTERVAL '49 hours'
 WHERE status IN ('ACTIVE', 'BENCHED', 'QUEUE')
   AND win_rate = 0;
