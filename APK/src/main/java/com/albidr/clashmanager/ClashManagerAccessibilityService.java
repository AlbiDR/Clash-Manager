package com.albidr.clashmanager;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.os.Build;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

/* JADX INFO: loaded from: /Users/ADR/Documents/Github/Projects/clash-manager/APK/android/classes.dex */
public class ClashManagerAccessibilityService extends AccessibilityService {
    private static final float DISMISS_X_PERCENT = 0.9213f;
    private static final float DISMISS_Y_PERCENT = 0.204f;
    private static final long GESTURE_START_TIME_MS = 0;
    private static final float INVITE_X_PERCENT = 0.5083f;
    private static final float INVITE_Y_PERCENT = 0.7218f;
    private static final String TAG = "ClashManagerAccessibility";
    private static final long TAP_DURATION_MS = 50;
    private static ClashManagerAccessibilityService sInstance;

    @Override // android.accessibilityservice.AccessibilityService
    public void onAccessibilityEvent(AccessibilityEvent accessibilityEvent) {
    }

    @Override // android.accessibilityservice.AccessibilityService
    public void onInterrupt() {
    }

    @Override // android.accessibilityservice.AccessibilityService
    protected void onServiceConnected() {
        super.onServiceConnected();
        sInstance = this;
    }

    @Override // android.app.Service
    public void onDestroy() {
        super.onDestroy();
        sInstance = null;
    }

    @Override // android.app.Service
    public boolean onUnbind(Intent intent) {
        sInstance = null;
        return super.onUnbind(intent);
    }

    public static boolean isActive() {
        return sInstance != null;
    }

    public static void tapInvite() {
        ClashManagerAccessibilityService clashManagerAccessibilityService = sInstance;
        if (clashManagerAccessibilityService != null) {
            sInstance.performTap(clashManagerAccessibilityService.getSharedPreferences("blitz_prefs", 0).getFloat("invite_x", INVITE_X_PERCENT), sInstance.getSharedPreferences("blitz_prefs", 0).getFloat("invite_y", INVITE_Y_PERCENT));
        }
    }

    public static void tapClose() {
        ClashManagerAccessibilityService clashManagerAccessibilityService = sInstance;
        if (clashManagerAccessibilityService != null) {
            sInstance.performTap(clashManagerAccessibilityService.getSharedPreferences("blitz_prefs", 0).getFloat("close_x", DISMISS_X_PERCENT), sInstance.getSharedPreferences("blitz_prefs", 0).getFloat("close_y", DISMISS_Y_PERCENT));
        }
    }

    private void performTap(float f, float f2) {
        if (Build.VERSION.SDK_INT >= 24) {
            if (Float.isNaN(f) || Float.isInfinite(f) || Float.isNaN(f2) || Float.isInfinite(f2)) {
                Log.e(TAG, "Cannot perform tap: coordinates are NaN or Infinite");
                return;
            }
            DisplayMetrics displayMetrics = getResources().getDisplayMetrics();
            float fMax = Math.max(0.0f, Math.min(displayMetrics.widthPixels * f, displayMetrics.widthPixels - 1.0f));
            float fMax2 = Math.max(0.0f, Math.min(displayMetrics.heightPixels * f2, displayMetrics.heightPixels - 1.0f));
            GestureDescription.Builder builderM = BlitzService$$ExternalSyntheticApiModelOutline0.m();
            Path path = new Path();
            path.moveTo(fMax, fMax2);
            builderM.addStroke(BlitzService$$ExternalSyntheticApiModelOutline0.m(path, 0L, TAP_DURATION_MS));
            Log.d(TAG, "Dispatching tap gesture to coordinates: (" + fMax + ", " + fMax2 + ") [" + f + "x" + f2 + "]");
            dispatchGesture(builderM.build(), new AccessibilityService.GestureResultCallback() { // from class: com.albidr.clashmanager.ClashManagerAccessibilityService.1
                @Override // android.accessibilityservice.AccessibilityService.GestureResultCallback
                public void onCompleted(GestureDescription gestureDescription) {
                    super.onCompleted(gestureDescription);
                    Log.d(ClashManagerAccessibilityService.TAG, "Tap gesture successfully dispatched");
                }

                @Override // android.accessibilityservice.AccessibilityService.GestureResultCallback
                public void onCancelled(GestureDescription gestureDescription) {
                    super.onCancelled(gestureDescription);
                    Log.w(ClashManagerAccessibilityService.TAG, "Tap gesture was cancelled/blocked by system");
                }
            }, null);
            return;
        }
        Log.w(TAG, "Cannot perform tap: requires Android N (API 24)+");
    }
}
