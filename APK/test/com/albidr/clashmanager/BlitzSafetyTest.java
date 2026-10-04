// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import org.junit.Test;

/**
 * Pins the pure native boundaries that sit between the WebView and a real
 * accessibility gesture. Android framework calls remain device-tested; these
 * tests exercise the malformed inputs that must be rejected before that point.
 */
public class BlitzSafetyTest {

    private static final float FLOAT_EPSILON = 0.0f;

    private static Object callBlitz(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = BlitzService.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        try {
            return method.invoke(null, args);
        } catch (InvocationTargetException e) {
            throw (Exception) e.getCause();
        }
    }

    private static String normalizePlayerTag(String tag) throws Exception {
        return (String) callBlitz("normalizePlayerTag", new Class<?>[] { String.class }, tag);
    }

    private static boolean supportsQueueSize(int queueSize) throws Exception {
        return (Boolean) callBlitz("isSupportedQueueSize", new Class<?>[] { int.class }, queueSize);
    }

    @SuppressWarnings("unchecked")
    private static List<String> normalizePlayerQueue(List<String> tags) throws Exception {
        return (List<String>) callBlitz("normalizePlayerQueue", new Class<?>[] { List.class }, tags);
    }

    private static int queueCapacity() throws Exception {
        Field field = BlitzService.class.getDeclaredField("MAX_QUEUE_PLAYERS");
        field.setAccessible(true);
        return field.getInt(null);
    }

    private static int maximumPlayerTagLength() throws Exception {
        Field field = BlitzService.class.getDeclaredField("MAX_PLAYER_TAG_LENGTH");
        field.setAccessible(true);
        return field.getInt(null);
    }

    private static boolean isBlitzRunStateActive(boolean stopped, String outcome) throws Exception {
        return (Boolean) callBlitz(
            "isBlitzRunStateActive",
            new Class<?>[] { boolean.class, String.class },
            stopped,
            outcome);
    }

    private static String repeat(char character, int count) {
        char[] chars = new char[count];
        for (int i = 0; i < count; i++) {
            chars[i] = character;
        }
        return new String(chars);
    }

    @Test
    public void playerTagsCanonicalizeOnlyTheSupportedClashRoyaleAlphabet() throws Exception {
        assertEquals("9PP900", normalizePlayerTag(" #9pp900 "));
        assertEquals("PQR", normalizePlayerTag("pqr"));
        assertNull(normalizePlayerTag("9PP?00"));
        assertNull(normalizePlayerTag("##9PP900"));
        assertNull(normalizePlayerTag("PP"));
        assertNull(normalizePlayerTag(null));
    }

    @Test
    public void playerTagsRejectValuesOutsideTheNativeLengthEnvelope() throws Exception {
        int maximumTagLength = maximumPlayerTagLength();
        assertEquals(repeat('P', maximumTagLength), normalizePlayerTag(repeat('P', maximumTagLength)));
        assertNull(normalizePlayerTag(repeat('P', maximumTagLength + 1)));
    }

    @Test
    public void queueCapacityRequiresOneBoundedReviewableRun() throws Exception {
        int capacity = queueCapacity();
        assertTrue(supportsQueueSize(1));
        assertTrue(supportsQueueSize(capacity));
        assertFalse(supportsQueueSize(0));
        assertFalse(supportsQueueSize(capacity + 1));
        assertFalse(supportsQueueSize(-1));
    }

    @Test
    public void playerQueueRejectsDuplicateMalformedAndOversizedPayloads() throws Exception {
        assertEquals(Arrays.asList("9PP900", "PQR"), normalizePlayerQueue(Arrays.asList("#9pp900", "pqr")));
        assertNull(normalizePlayerQueue(Arrays.asList("9PP900", "#9pp900")));
        assertNull(normalizePlayerQueue(Arrays.asList("PQR", "not-a-tag")));

        List<String> oversizedQueue = new ArrayList<>();
        int queueSizeBeyondCapacity = queueCapacity() + 1;
        for (int i = 0; i < queueSizeBeyondCapacity; i++) {
            oversizedQueue.add("PQR");
        }
        assertNull(normalizePlayerQueue(oversizedQueue));
    }

    @Test
    public void calibrationPreservesValidScreenEdges() {
        Calibration calibration = new Calibration(0.0f, 1.0f, 1.0f, 0.0f);
        assertEquals(0.0f, calibration.inviteX(), FLOAT_EPSILON);
        assertEquals(1.0f, calibration.inviteY(), FLOAT_EPSILON);
        assertEquals(1.0f, calibration.closeX(), FLOAT_EPSILON);
        assertEquals(0.0f, calibration.closeY(), FLOAT_EPSILON);
    }

    @Test
    public void calibrationFallsBackForNonFiniteAndOffScreenCoordinates() {
        Calibration calibration = new Calibration(
            Float.NaN,
            Float.NEGATIVE_INFINITY,
            -0.01f,
            1.01f);
        assertEquals(Calibration.DEFAULT.inviteX(), calibration.inviteX(), FLOAT_EPSILON);
        assertEquals(Calibration.DEFAULT.inviteY(), calibration.inviteY(), FLOAT_EPSILON);
        assertEquals(Calibration.DEFAULT.closeX(), calibration.closeX(), FLOAT_EPSILON);
        assertEquals(Calibration.DEFAULT.closeY(), calibration.closeY(), FLOAT_EPSILON);
    }

    @Test
    public void immediateStopSentinelMakesQueuedAccessibilityCallbacksInert() throws Exception {
        // Tap callbacks ask BlitzService whether the run is still active before
        // dispatching or advancing. User Stop must flip this predicate before
        // asynchronous service destruction has a chance to run.
        assertTrue(isBlitzRunStateActive(false, BlitzRun.RUNNING));
        assertFalse(isBlitzRunStateActive(true, BlitzRun.RUNNING));
        assertFalse(isBlitzRunStateActive(false, BlitzRun.STOPPED));
        assertFalse(isBlitzRunStateActive(false, BlitzRun.COMPLETED));
    }
}
