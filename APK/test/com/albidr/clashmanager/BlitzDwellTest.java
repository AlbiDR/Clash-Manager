// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import org.junit.Test;

/**
 * Pins the Blitz dwell domain in BlitzService: the logarithmic slider mapping,
 * the step grid, detent snapping, and the wording the overlay shows.
 *
 * The helpers are private statics. They are reached by reflection rather than
 * widened to package-private, so adding these tests does not change a single
 * byte of the shipped classes.dex.
 */
public class BlitzDwellTest {

    private static final double EPSILON = 1e-9;

    private static Object call(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = BlitzService.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        try {
            return method.invoke(null, args);
        } catch (InvocationTargetException e) {
            throw (Exception) e.getCause();
        }
    }

    private static double ratioForDwell(long dwellMs) throws Exception {
        return (Double) call("getRatioForDwell", new Class<?>[] { long.class }, dwellMs);
    }

    private static long dwellForRatio(double ratio) throws Exception {
        return (Long) call("getDwellForRatio", new Class<?>[] { double.class }, ratio);
    }

    private static long steppedDwell(long dwellMs) throws Exception {
        return (Long) call("getSteppedDwell", new Class<?>[] { long.class }, dwellMs);
    }

    private static long snappedDwell(double ratio, float travelPx, float snapRadiusPx) throws Exception {
        return (Long) call("getSnappedDwell", new Class<?>[] { double.class, float.class, float.class },
            ratio, travelPx, snapRadiusPx);
    }

    private static String compactDuration(long ms) throws Exception {
        return (String) call("formatCompactDuration", new Class<?>[] { long.class }, ms);
    }

    private static String dwellLabel(long ms) throws Exception {
        return (String) call("formatDwell", new Class<?>[] { long.class }, ms);
    }

    @Test
    public void detentsSpanTheDomainInOrderOnTheStepGrid() {
        long[] detents = BlitzService.DWELL_DETENTS_MS;
        assertEquals(BlitzService.DWELL_MIN_MS, detents[0]);
        assertEquals(BlitzService.DWELL_MAX_MS, detents[detents.length - 1]);
        for (int i = 1; i < detents.length; i++) {
            assertTrue("detents must ascend at index " + i, detents[i] > detents[i - 1]);
        }
        for (long detent : detents) {
            assertEquals("detent " + detent + " is off the step grid",
                0L, (detent - BlitzService.DWELL_MIN_MS) % BlitzService.DWELL_STEP_MS);
        }
        assertEquals(BlitzService.DWELL_MIN_MS, BlitzService.DEFAULT_PROFILE_LOAD_DELAY_MS);
    }

    @Test
    public void ratioMapsTheDomainEndsToTheTrackEnds() throws Exception {
        assertEquals(0.0, ratioForDwell(BlitzService.DWELL_MIN_MS), EPSILON);
        assertEquals(1.0, ratioForDwell(BlitzService.DWELL_MAX_MS), EPSILON);
    }

    @Test
    public void ratioClampsValuesOutsideTheDomain() throws Exception {
        assertEquals(0.0, ratioForDwell(0L), EPSILON);
        assertEquals(0.0, ratioForDwell(-5000L), EPSILON);
        assertEquals(1.0, ratioForDwell(60_000L), EPSILON);
    }

    @Test
    public void ratioIsLogarithmicSoEqualFactorsAreEqualDistances() throws Exception {
        // 1000 -> 2000 and 2500 -> 5000 are both a doubling, so both cover the same track distance.
        double first = ratioForDwell(2000L) - ratioForDwell(1000L);
        double second = ratioForDwell(5000L) - ratioForDwell(2500L);
        assertEquals(first, second, 1e-12);
    }

    @Test
    public void everyDetentSurvivesARoundTripThroughTheTrack() throws Exception {
        for (long detent : BlitzService.DWELL_DETENTS_MS) {
            assertEquals(detent, dwellForRatio(ratioForDwell(detent)));
        }
    }

    @Test
    public void steppedDwellRoundsOntoAGridAnchoredAtTheMinimum() throws Exception {
        assertEquals(850L, steppedDwell(850L));
        assertEquals(850L, steppedDwell(854L));
        assertEquals(860L, steppedDwell(855L));
        assertEquals(860L, steppedDwell(856L));
        assertEquals(2140L, steppedDwell(2143L));
    }

    @Test
    public void steppedDwellClampsToTheDomain() throws Exception {
        assertEquals(BlitzService.DWELL_MIN_MS, steppedDwell(0L));
        assertEquals(BlitzService.DWELL_MAX_MS, steppedDwell(9000L));
    }

    @Test
    public void dragWithinTheSnapRadiusLandsOnTheDetent() throws Exception {
        float travelPx = 1000f;
        float snapRadiusPx = 6f;
        double onDetent = ratioForDwell(1500L);
        assertEquals(1500L, snappedDwell(onDetent, travelPx, snapRadiusPx));
        // 4px away on a 1000px track is inside a 6px radius.
        assertEquals(1500L, snappedDwell(onDetent + 0.004, travelPx, snapRadiusPx));
        assertEquals(1500L, snappedDwell(onDetent - 0.004, travelPx, snapRadiusPx));
    }

    @Test
    public void dragOutsideTheSnapRadiusStaysOnTheStepGrid() throws Exception {
        float travelPx = 1000f;
        float snapRadiusPx = 6f;
        double ratio = ratioForDwell(1500L) + 0.02; // 20px away
        long dwell = snappedDwell(ratio, travelPx, snapRadiusPx);
        assertTrue("expected to leave the detent, got " + dwell, dwell != 1500L);
        assertEquals(0L, (dwell - BlitzService.DWELL_MIN_MS) % BlitzService.DWELL_STEP_MS);
        assertEquals(steppedDwell(dwellForRatio(ratio)), dwell);
    }

    @Test
    public void compactDurationReadsLikeASpokenDuration() throws Exception {
        assertEquals("0s", compactDuration(0L));
        assertEquals("1s", compactDuration(1499L));
        assertEquals("2s", compactDuration(1500L));
        assertEquals("59s", compactDuration(59_000L));
        assertEquals("1m", compactDuration(59_500L));
        assertEquals("1m 1s", compactDuration(61_000L));
        assertEquals("2m 5s", compactDuration(125_000L));
    }

    @Test
    public void dwellLabelUsesMillisecondsBelowOneSecondAndTenthsAbove() throws Exception {
        assertEquals("850ms", dwellLabel(850L));
        assertEquals("999ms", dwellLabel(999L));
        assertEquals("1s", dwellLabel(1000L));
        assertEquals("1.5s", dwellLabel(1500L));
        assertEquals("2.1s", dwellLabel(2140L));
        assertEquals("2.2s", dwellLabel(2150L));
        assertEquals("6s", dwellLabel(5960L));
    }
}
