package com.albidr.clashmanager;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.os.Build;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

public class ClashManagerAccessibilityService extends AccessibilityService {
    // Must stay identical to BlitzService's DEFAULT_* constants so the rendered marker,
    // the tap-ripple feedback, and the dispatched tap all agree before calibration.
    private static final float DISMISS_X_PERCENT = 0.9213f;
    private static final float DISMISS_Y_PERCENT = 0.204f;
    private static final float INVITE_X_PERCENT = 0.5083f;
    private static final float INVITE_Y_PERCENT = 0.7218f;
    private static final String TAG = "ClashManagerAccessibility";
    private static final long TAP_DURATION_MS = 50L;
    private static ClashManagerAccessibilityService sInstance;

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

    public static void tapInvite() {
        ClashManagerAccessibilityService service = sInstance;
        if (service != null) {
            float x = service.getSharedPreferences("blitz_prefs", 0).getFloat("invite_x", INVITE_X_PERCENT);
            float y = service.getSharedPreferences("blitz_prefs", 0).getFloat("invite_y", INVITE_Y_PERCENT);
            service.performTap(x, y);
        }
    }

    public static void tapClose() {
        ClashManagerAccessibilityService service = sInstance;
        if (service != null) {
            float x = service.getSharedPreferences("blitz_prefs", 0).getFloat("close_x", DISMISS_X_PERCENT);
            float y = service.getSharedPreferences("blitz_prefs", 0).getFloat("close_y", DISMISS_Y_PERCENT);
            service.performTap(x, y);
        }
    }

    private void performTap(float xPercent, float yPercent) {
        if (Build.VERSION.SDK_INT >= 24) {
            if (Float.isNaN(xPercent) || Float.isInfinite(xPercent) || Float.isNaN(yPercent) || Float.isInfinite(yPercent)) {
                Log.e(TAG, "Cannot perform tap: coordinates are NaN or Infinite");
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
            dispatchGesture(gestureBuilder.build(), new AccessibilityService.GestureResultCallback() {
                @Override
                public void onCompleted(GestureDescription gestureDescription) {
                    super.onCompleted(gestureDescription);
                    Log.d(ClashManagerAccessibilityService.TAG, "Tap gesture successfully dispatched");
                }

                @Override
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
