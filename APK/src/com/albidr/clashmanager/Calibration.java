// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Where Blitz taps: the invite and close buttons, as fractions (0..1) of the
 * screen's width and height.
 *
 * The bridge (MainActivity), the calibration overlay (BlitzService) and the tap
 * dispatcher (ClashManagerAccessibilityService) all read and write this one
 * stored value. Each used to carry its own copy of the preference keys and of
 * the un-calibrated defaults, and those copies had already drifted apart once,
 * so the Settings markers showed a different spot from where the taps landed.
 * This record also normalizes every value at construction time: persisted or
 * bridge-supplied NaN, infinity, and off-screen coordinates must fall back to
 * the matching safe marker rather than becoming an edge-screen tap.
 */
record Calibration(float inviteX, float inviteY, float closeX, float closeY) {

    private static final float MIN_COORDINATE = 0.0f;
    private static final float MAX_COORDINATE = 1.0f;
    private static final float DEFAULT_INVITE_X = 0.5083f;
    private static final float DEFAULT_INVITE_Y = 0.7218f;
    private static final float DEFAULT_CLOSE_X = 0.9213f;
    private static final float DEFAULT_CLOSE_Y = 0.204f;

    /** Used until the user calibrates. */
    static final Calibration DEFAULT = new Calibration(
        DEFAULT_INVITE_X, DEFAULT_INVITE_Y, DEFAULT_CLOSE_X, DEFAULT_CLOSE_Y);

    private static final String PREFS = "blitz_prefs";
    private static final String INVITE_X = "invite_x";
    private static final String INVITE_Y = "invite_y";
    private static final String CLOSE_X = "close_x";
    private static final String CLOSE_Y = "close_y";

    Calibration {
        inviteX = normalizeCoordinate(inviteX, DEFAULT_INVITE_X);
        inviteY = normalizeCoordinate(inviteY, DEFAULT_INVITE_Y);
        closeX = normalizeCoordinate(closeX, DEFAULT_CLOSE_X);
        closeY = normalizeCoordinate(closeY, DEFAULT_CLOSE_Y);
    }

    private static float normalizeCoordinate(float coordinate, float fallback) {
        if (Float.isNaN(coordinate) || Float.isInfinite(coordinate)
            || coordinate < MIN_COORDINATE || coordinate > MAX_COORDINATE) {
            return fallback;
        }
        return coordinate;
    }

    static Calibration load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return new Calibration(
            prefs.getFloat(INVITE_X, DEFAULT.inviteX),
            prefs.getFloat(INVITE_Y, DEFAULT.inviteY),
            prefs.getFloat(CLOSE_X, DEFAULT.closeX),
            prefs.getFloat(CLOSE_Y, DEFAULT.closeY));
    }

    /**
     * @param synchronously write to disk before returning (commit) rather than in
     *     the background (apply); the overlay needs the former because the tap
     *     service reads the value back as soon as the run starts.
     */
    void save(Context context, boolean synchronously) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putFloat(INVITE_X, inviteX)
            .putFloat(INVITE_Y, inviteY)
            .putFloat(CLOSE_X, closeX)
            .putFloat(CLOSE_Y, closeY);
        if (synchronously) {
            editor.commit();
        } else {
            editor.apply();
        }
    }

    /** The JSON that useNativeBridge.loadCoordinates() in the PWA parses. */
    String toJson() {
        return "{\"inviteX\":" + inviteX + ",\"inviteY\":" + inviteY
            + ",\"closeX\":" + closeX + ",\"closeY\":" + closeY + "}";
    }
}
