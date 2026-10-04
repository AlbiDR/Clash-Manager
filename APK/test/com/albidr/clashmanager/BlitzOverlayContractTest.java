// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

/**
 * Pins the pure presentation contract behind BlitzService's dynamic windows.
 * Android View/WindowInsets integration remains device-tested; copy, visibility,
 * touch geometry, stable ids and rotation arithmetic can be proven on the JVM.
 */
public class BlitzOverlayContractTest {

    private static Object callBlitz(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = BlitzService.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        try {
            return method.invoke(null, args);
        } catch (InvocationTargetException e) {
            throw (Exception) e.getCause();
        }
    }

    private static Object readBlitzField(String name) throws Exception {
        Field field = BlitzService.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(null);
    }

    private static float readBlitzFloat(String name) throws Exception {
        return ((Number) readBlitzField(name)).floatValue();
    }

    private static int readBlitzInt(String name) throws Exception {
        return ((Number) readBlitzField(name)).intValue();
    }

    @Test
    public void setupCopyAndVisibilityDescribeBothReviewStates() throws Exception {
        assertEquals("Ready for Blitz", callBlitz(
            "formatBlitzSetupTitle", new Class<?>[] { boolean.class }, false));
        assertEquals("Blitz setup", callBlitz(
            "formatBlitzSetupTitle", new Class<?>[] { boolean.class }, true));
        assertEquals("3 players \u00b7 850ms each \u00b7 about 3s", callBlitz(
            "formatBlitzSetupSubtitle",
            new Class<?>[] { boolean.class, int.class, long.class },
            false,
            3,
            850L));
        assertEquals("Drag targets, set profile dwell, then start", callBlitz(
            "formatBlitzSetupSubtitle",
            new Class<?>[] { boolean.class, int.class, long.class },
            true,
            3,
            850L));
        assertFalse((Boolean) callBlitz(
            "shouldShowBlitzSetupDetails", new Class<?>[] { boolean.class }, false));
        assertTrue((Boolean) callBlitz(
            "shouldShowBlitzSetupDetails", new Class<?>[] { boolean.class }, true));
    }

    @Test
    public void runningCopyReportsProgressPhaseAndMovementAlternative() throws Exception {
        assertEquals("Blitz \u00b7 2 of 3", callBlitz(
            "formatBlitzRunStatus", new Class<?>[] { int.class, int.class }, 2, 3));
        assertEquals("Running", callBlitz(
            "formatBlitzRunPhase", new Class<?>[] { int.class, int.class }, 2, 3));
        assertEquals("Finishing", callBlitz(
            "formatBlitzRunPhase", new Class<?>[] { int.class, int.class }, 3, 3));
        assertTrue(((String) callBlitz(
            "formatBlitzPillDescription", new Class<?>[] { int.class, int.class }, 2, 3))
            .contains("move actions"));
        assertTrue(((String) callBlitz(
            "formatBlitzMarkerDescription",
            new Class<?>[] { String.class, boolean.class },
            "Invite",
            true)).contains("Drag or use the move actions"));
    }

    @Test
    public void setupOffsetsCombineSafeInsetsWithNamedMargins() throws Exception {
        assertEquals(40, callBlitz(
            "calculateBlitzSetupHorizontalOffset",
            new Class<?>[] { boolean.class, int.class, int.class, int.class, int.class },
            true,
            24,
            24,
            0,
            16));
        assertEquals(10, callBlitz(
            "calculateBlitzSetupHorizontalOffset",
            new Class<?>[] { boolean.class, int.class, int.class, int.class, int.class },
            false,
            30,
            30,
            10,
            16));
        assertEquals(40, callBlitz(
            "calculateBlitzSetupBottomOffset",
            new Class<?>[] { int.class, int.class },
            24,
            16));
    }

    @Test
    public void rotationReflowPreservesNormalizedMarkerAndPillPositions() throws Exception {
        assertEquals(402.0f, (Float) callBlitz(
            "calculateBlitzMarkerCenter",
            new Class<?>[] { float.class, int.class },
            0.25f,
            1608),
            0.0f);
        assertEquals(-402, callBlitz(
            "calculateBlitzPillHorizontalOffset",
            new Class<?>[] { int.class, int.class, int.class },
            -180,
            720,
            1608));
        assertEquals(29, callBlitz(
            "calculateBlitzPillVerticalOffset",
            new Class<?>[] { int.class, int.class, int.class, int.class },
            100,
            56,
            1608,
            720));
        assertEquals(8, callBlitz(
            "clampBlitzOverlayOffset",
            new Class<?>[] { int.class, int.class, int.class },
            -20,
            8,
            100));
        assertEquals(100, callBlitz(
            "clampBlitzOverlayOffset",
            new Class<?>[] { int.class, int.class, int.class },
            120,
            8,
            100));
    }

    @Test
    public void touchTargetsAndAccessibilityNudgesStayOperable() throws Exception {
        assertTrue(readBlitzFloat("MIN_TOUCH_TARGET_DP") >= 48.0f);
        assertTrue(readBlitzFloat("MODIFY_BUTTON_SIZE_DP") >= 48.0f);
        assertTrue(readBlitzFloat("MARKER_ANCHOR_SIZE_DP") >= 48.0f);
        assertTrue(readBlitzFloat("FLOATING_PILL_MIN_HEIGHT_DP") >= 48.0f);
        assertTrue(readBlitzFloat("ACCESSIBILITY_MOVE_STEP_DP") > 0.0f);
    }

    @Test
    public void dynamicControlAndMovementIdsAreStableAndUnique() throws Exception {
        String[] idNames = {
            "VIEW_ID_BLITZ_SETUP_PANEL",
            "VIEW_ID_BLITZ_INVITE_MARKER",
            "VIEW_ID_BLITZ_CLOSE_MARKER",
            "VIEW_ID_BLITZ_EDIT_BUTTON",
            "VIEW_ID_BLITZ_CANCEL_BUTTON",
            "VIEW_ID_BLITZ_START_BUTTON",
            "VIEW_ID_BLITZ_DWELL_SLIDER",
            "VIEW_ID_BLITZ_RUNNING_PILL",
            "VIEW_ID_BLITZ_STOP_BUTTON",
            "ACTION_ID_BLITZ_MOVE_LEFT",
            "ACTION_ID_BLITZ_MOVE_RIGHT",
            "ACTION_ID_BLITZ_MOVE_UP",
            "ACTION_ID_BLITZ_MOVE_DOWN",
        };
        Set<Integer> ids = new HashSet<>();
        for (String name : idNames) {
            int id = readBlitzInt(name);
            assertTrue(name + " must be positive", id > 0);
            assertTrue(name + " must be unique", ids.add(id));
        }
    }

}
