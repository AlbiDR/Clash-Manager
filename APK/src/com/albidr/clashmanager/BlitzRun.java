// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import android.content.Context;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the last Blitz run did, kept so the PWA can report it afterwards.
 *
 * A run happens inside Clash Royale, where nothing else can see it: the PWA is
 * in the background, and the game switches USB debugging off while it is open.
 * Without this record the app could only ever say that a run had been started.
 *
 * @param players   how many players were queued
 * @param opened    how many of their profiles were opened
 * @param invites   how many invite taps were dispatched (fewer than opened when
 *                  the accessibility service was not connected)
 * @param outcome   RUNNING, COMPLETED, STOPPED (the user pressed Stop) or FAILED
 */
record BlitzRun(long startedAt, long endedAt, int players, int opened, int invites, String outcome, boolean rehearsal) {

    static final String RUNNING = "running";
    static final String COMPLETED = "completed";
    static final String STOPPED = "stopped";
    static final String FAILED = "failed";

    private static final String PREFS = "blitz_runs";
    private static final String LAST = "last";

    void save(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(LAST, toJson()).apply();
    }

    /** The last run as JSON, or an empty string when Blitz has never run. */
    static String lastJson(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(LAST, "");
    }

    String toJson() {
        try {
            return new JSONObject()
                .put("startedAt", startedAt)
                .put("endedAt", endedAt)
                .put("players", players)
                .put("opened", opened)
                .put("invites", invites)
                .put("outcome", outcome)
                .put("rehearsal", rehearsal)
                .toString();
        } catch (JSONException e) {
            // JSONObject.put only throws for non-finite doubles, and every value here is an int, long, boolean or String.
            throw new IllegalStateException(e);
        }
    }
}
