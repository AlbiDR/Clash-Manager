// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

public class ClashManagerAccessibilityService extends AccessibilityService {
    // Single source of truth for the un-calibrated fallback coordinates. BlitzService's
    // DEFAULT_INVITE_*/DEFAULT_CLOSE_* constants must stay numerically identical to
    // these - they exist separately only because BlitzService cannot import this
    // service's constants without pulling in the accessibility framework - so the
    // rendered marker, the tap-ripple feedback, and the dispatched tap all agree
    // before the user has calibrated.
    static final float DEFAULT_INVITE_X = 0.5083f;
    static final float DEFAULT_INVITE_Y = 0.7218f;
    static final float DEFAULT_CLOSE_X = 0.9213f;
    static final float DEFAULT_CLOSE_Y = 0.204f;
    private static final String TAG = "ClashManagerAccessibility";
    private static final long TAP_DURATION_MS = 50L;
    // Small buffer between the invite tap completing and the close tap starting.
    // dispatchGesture() cancels any gesture still in flight when a new one is
    // requested, so chaining off GestureResultCallback.onCompleted (rather than a
    // fixed total delay) guarantees the close tap never races the invite tap
    // regardless of Handler/system scheduling jitter.
    private static final long INTER_TAP_BUFFER_MS = 80L;
    private static ClashManagerAccessibilityService sInstance;
    private final Handler mHandler = new Handler(Looper.getMainLooper());

    /** Callback for {@link #runInviteCloseSequence}, fired at each tap's actual dispatch time. */
    public interface TapSequenceCallback {
        void onInviteTapped(float xPercent, float yPercent);
        void onCloseTapped(float xPercent, float yPercent);
        void onSequenceComplete();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent accessibilityEvent) {
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        sInstance = this;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        sInstance = null;
    }

    @Override
    public boolean onUnbind(Intent intent) {
        sInstance = null;
        return super.onUnbind(intent);
    }

    public static boolean isActive() {
        return sInstance != null;
    }

    /**
     * Runs the invite tap, then the close tap, chained off each gesture's actual
     * completion (or cancellation) rather than a fixed total delay. Replaces the old
     * pair of independently-scheduled tapInvite()/tapClose() calls, whose fixed delays
     * left zero margin against Handler jitter and could have the close tap's
     * dispatchGesture() call cancel an invite tap still in flight.
     */
    public static void runInviteCloseSequence(final TapSequenceCallback callback) {
        final ClashManagerAccessibilityService service = sInstance;
        if (service == null) {
            if (callback != null) callback.onSequenceComplete();
            return;
        }
        final float inviteX = service.getSharedPreferences("blitz_prefs", 0).getFloat("invite_x", DEFAULT_INVITE_X);
        final float inviteY = service.getSharedPreferences("blitz_prefs", 0).getFloat("invite_y", DEFAULT_INVITE_Y);
        final float closeX = service.getSharedPreferences("blitz_prefs", 0).getFloat("close_x", DEFAULT_CLOSE_X);
        final float closeY = service.getSharedPreferences("blitz_prefs", 0).getFloat("close_y", DEFAULT_CLOSE_Y);

        service.performTap(inviteX, inviteY,
            new Runnable() {
                @Override
                public void run() {
                    if (callback != null) callback.onInviteTapped(inviteX, inviteY);
                }
            },
            new Runnable() {
                @Override
                public void run() {
                    final ClashManagerAccessibilityService svc = sInstance;
                    if (svc == null) {
                        if (callback != null) callback.onSequenceComplete();
                        return;
                    }
                    svc.mHandler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            final ClashManagerAccessibilityService svc2 = sInstance;
                            if (svc2 == null) {
                                if (callback != null) callback.onSequenceComplete();
                                return;
                            }
                            svc2.performTap(closeX, closeY,
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        if (callback != null) callback.onCloseTapped(closeX, closeY);
                                    }
                                },
                                new Runnable() {
                                    @Override
                                    public void run() {
                                        if (callback != null) callback.onSequenceComplete();
                                    }
                                });
                        }
                    }, INTER_TAP_BUFFER_MS);
                }
            });
    }

    /**
     * Dispatches a single tap. `onDispatched` fires synchronously right before the
     * gesture is sent (so UI feedback like a tap ripple lines up with the real tap
     * instant); `onDone` fires once the gesture completes OR is cancelled, so a caller
     * chaining a follow-up tap never stalls forever on a blocked gesture.
     */
    private void performTap(float xPercent, float yPercent, Runnable onDispatched, final Runnable onDone) {
        // minSdkVersion is 24 (Android N), which is dispatchGesture()'s own floor, so no
        // pre-24 fallback path is reachable here.
        if (Float.isNaN(xPercent) || Float.isInfinite(xPercent) || Float.isNaN(yPercent) || Float.isInfinite(yPercent)) {
            Log.e(TAG, "Cannot perform tap: coordinates are NaN or Infinite");
            if (onDone != null) onDone.run();
            return;
        }
        DisplayMetrics dm = getResources().getDisplayMetrics();
        float xVal = Math.max(0.0f, Math.min(dm.widthPixels * xPercent, dm.widthPixels - 1.0f));
        float yVal = Math.max(0.0f, Math.min(dm.heightPixels * yPercent, dm.heightPixels - 1.0f));

        GestureDescription.Builder gestureBuilder = new GestureDescription.Builder();
        Path path = new Path();
        path.moveTo(xVal, yVal);
        gestureBuilder.addStroke(new GestureDescription.StrokeDescription(path, 0L, TAP_DURATION_MS));

        Log.d(TAG, "Dispatching tap gesture to coordinates: (" + xVal + ", " + yVal + ") [" + xPercent + "x" + yPercent + "]");
        if (onDispatched != null) onDispatched.run();
        dispatchGesture(gestureBuilder.build(), new AccessibilityService.GestureResultCallback() {
            @Override
            public void onCompleted(GestureDescription gestureDescription) {
                super.onCompleted(gestureDescription);
                Log.d(ClashManagerAccessibilityService.TAG, "Tap gesture successfully dispatched");
                if (onDone != null) onDone.run();
            }

            @Override
            public void onCancelled(GestureDescription gestureDescription) {
                super.onCancelled(gestureDescription);
                Log.w(ClashManagerAccessibilityService.TAG, "Tap gesture was cancelled/blocked by system");
                if (onDone != null) onDone.run();
            }
        }, null);
    }
}
