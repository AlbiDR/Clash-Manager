// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import java.util.concurrent.atomic.AtomicBoolean;

public class ClashManagerAccessibilityService extends AccessibilityService {
    private static final String TAG = "ClashManagerAccessibility";
    private static final long TAP_DURATION_MS = 50L;
    // Small buffer between the invite tap completing and the close tap starting.
    // dispatchGesture() cancels any gesture still in flight when a new one is
    // requested, so chaining off GestureResultCallback.onCompleted (rather than a
    // fixed total delay) guarantees the close tap never races the invite tap
    // regardless of Handler/system scheduling jitter.
    private static final long INTER_TAP_BUFFER_MS = 80L;
    private static volatile ClashManagerAccessibilityService sInstance;
    private volatile boolean mConnected = false;
    private final Handler mHandler = new Handler(Looper.getMainLooper());

    /** Callback for {@link #runInviteCloseSequence}, fired only for an accepted gesture. */
    public interface TapSequenceCallback {
        /** Whether the caller still owns this sequence and can receive callbacks. */
        boolean isSequenceActive();
        void onInviteTapped(float xPercent, float yPercent);
        void onCloseTapped(float xPercent, float yPercent);
        void onSequenceComplete();
        /** A tap was rejected, cancelled, or lost its original accessibility service. */
        void onSequenceFailed();
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
        mConnected = true;
        sInstance = this;
    }

    @Override
    public void onDestroy() {
        disconnect(this);
        super.onDestroy();
    }

    @Override
    public boolean onUnbind(Intent intent) {
        disconnect(this);
        return super.onUnbind(intent);
    }

    public static boolean isActive() {
        return activeService() != null;
    }

    private static ClashManagerAccessibilityService activeService() {
        ClashManagerAccessibilityService service = sInstance;
        return isCurrentService(service) ? service : null;
    }

    private static boolean isCurrentService(ClashManagerAccessibilityService service) {
        return service != null && sInstance == service && service.mConnected;
    }

    /**
     * Clears only this instance. An older service can finish after Android has
     * already connected its replacement; clearing the static field blindly in
     * that case would make the new, healthy service disappear from Blitz.
     */
    private static void disconnect(ClashManagerAccessibilityService service) {
        service.mConnected = false;
        if (sInstance == service) {
            sInstance = null;
        }
    }

    /**
     * Runs the invite tap, then the close tap, chained off each gesture's actual
     * completion rather than a fixed total delay. Replaces the old pair of
     * independently-scheduled tapInvite()/tapClose() calls, whose fixed delays
     * left zero margin against Handler jitter and could have the close tap's
     * dispatchGesture() call cancel an invite tap still in flight. A rejected,
     * cancelled, or cross-service gesture reports failure instead of pretending
     * the profile is safe to advance past.
     */
    public static void runInviteCloseSequence(TapSequenceCallback callback) {
        if (!isCallbackActive(callback)) {
            return;
        }
        ClashManagerAccessibilityService service = activeService();
        if (service == null) {
            notifyFailure(callback);
            return;
        }
        var target = Calibration.load(service);

        service.performTap(target.inviteX(), target.inviteY(),
            () -> {
                if (canContinue(service, callback) && callback != null) {
                    callback.onInviteTapped(target.inviteX(), target.inviteY());
                }
            },
            () -> {
                if (!isCallbackActive(callback)) {
                    return;
                }
                // Never migrate the close tap to a replacement accessibility
                // service. The original service owns the gesture lifecycle.
                if (!isCurrentService(service)) {
                    notifyFailure(callback);
                    return;
                }
                service.mHandler.postDelayed(() -> {
                    if (!isCallbackActive(callback)) {
                        return;
                    }
                    if (!isCurrentService(service)) {
                        notifyFailure(callback);
                        return;
                    }
                    service.performTap(target.closeX(), target.closeY(),
                        () -> {
                            if (canContinue(service, callback) && callback != null) {
                                callback.onCloseTapped(target.closeX(), target.closeY());
                            }
                        },
                        () -> {
                            if (!isCallbackActive(callback)) {
                                return;
                            }
                            if (!isCurrentService(service)) {
                                notifyFailure(callback);
                                return;
                            }
                            if (callback != null) {
                                callback.onSequenceComplete();
                            }
                        },
                        () -> notifyFailure(callback));
                }, INTER_TAP_BUFFER_MS);
            },
            () -> notifyFailure(callback));
    }

    private static boolean isCallbackActive(TapSequenceCallback callback) {
        return callback == null || callback.isSequenceActive();
    }

    private static boolean canContinue(ClashManagerAccessibilityService service, TapSequenceCallback callback) {
        return isCurrentService(service) && isCallbackActive(callback);
    }

    private static void notifyFailure(TapSequenceCallback callback) {
        if (callback != null && callback.isSequenceActive()) {
            callback.onSequenceFailed();
        }
    }

    /**
     * Dispatches a single tap. `onDispatched` fires only after Android accepts
     * the gesture, so counters and visual feedback never claim a rejected
     * dispatch. `onCompleted` and `onFailed` are mutually exclusive, including
     * the false return from dispatchGesture(), which otherwise has no callback.
     */
    private void performTap(
        float xPercent,
        float yPercent,
        Runnable onDispatched,
        Runnable onCompleted,
        Runnable onFailed
    ) {
        AtomicBoolean terminal = new AtomicBoolean(false);
        if (Float.isNaN(xPercent) || Float.isInfinite(xPercent) || Float.isNaN(yPercent) || Float.isInfinite(yPercent)) {
            Log.e(TAG, "Cannot perform tap: coordinates are NaN or Infinite");
            finish(terminal, onFailed);
            return;
        }
        var dm = getResources().getDisplayMetrics();
        float xVal = Math.max(0.0f, Math.min(dm.widthPixels * xPercent, dm.widthPixels - 1.0f));
        float yVal = Math.max(0.0f, Math.min(dm.heightPixels * yPercent, dm.heightPixels - 1.0f));

        var gestureBuilder = new GestureDescription.Builder();
        var path = new Path();
        path.moveTo(xVal, yVal);
        gestureBuilder.addStroke(new GestureDescription.StrokeDescription(path, 0L, TAP_DURATION_MS));

        Log.d(TAG, "Dispatching tap gesture to coordinates: (" + xVal + ", " + yVal + ") [" + xPercent + "x" + yPercent + "]");
        boolean accepted;
        try {
            accepted = dispatchGesture(gestureBuilder.build(), new AccessibilityService.GestureResultCallback() {
            @Override
            public void onCompleted(GestureDescription gestureDescription) {
                super.onCompleted(gestureDescription);
                Log.d(ClashManagerAccessibilityService.TAG, "Tap gesture completed");
                finish(terminal, onCompleted);
            }

            @Override
            public void onCancelled(GestureDescription gestureDescription) {
                super.onCancelled(gestureDescription);
                Log.w(ClashManagerAccessibilityService.TAG, "Tap gesture was cancelled/blocked by system");
                finish(terminal, onFailed);
            }
            }, null);
        } catch (RuntimeException e) {
            Log.w(TAG, "Tap gesture dispatch threw", e);
            finish(terminal, onFailed);
            return;
        }
        if (!accepted) {
            Log.w(TAG, "Tap gesture dispatch was rejected");
            finish(terminal, onFailed);
            return;
        }
        if (onDispatched != null) {
            onDispatched.run();
        }
    }

    private static void finish(AtomicBoolean terminal, Runnable callback) {
        if (terminal.compareAndSet(false, true) && callback != null) {
            callback.run();
        }
    }
}
