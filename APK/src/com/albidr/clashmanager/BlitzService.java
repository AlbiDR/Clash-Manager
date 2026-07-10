// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import android.animation.ObjectAnimator;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.app.NotificationCompat;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;

public class BlitzService extends Service {

    private static final long AUTO_ADVANCE_DELAY_MS = 850L;
    private static final String CHANNEL_ID = "BlitzServiceChannel";

    // Constants for modify button styling
    private static final float MODIFY_BUTTON_SIZE_DP = 36.0f;
    private static final int MODIFY_BUTTON_PADDING_DP = 4;
    private static final String COLOR_ICON_LOCKED = "#ffb4ab";
    private static final String COLOR_ICON_UNLOCKED = "#0061a4";

    // Style constants for UI clean-up
    private static final float TEXT_SIZE_TITLE_SP = 14.0f;
    private static final float TEXT_SIZE_SUBTITLE_SP = 11.0f;
    private static final float TEXT_SIZE_BUTTON_SP = 13.0f;
    private static final float TEXT_SIZE_MARKER_LABEL_SP = 10.0f;
    
    private static final float PADDING_CONTAINER_H_DP = 16.0f;
    private static final float PADDING_CONTAINER_V_DP = 12.0f;
    private static final float PADDING_BUTTON_H_DP = 16.0f;
    private static final float PADDING_BUTTON_V_DP = 8.0f;
    private static final float PADDING_MARKER_LABEL_H_DP = 12.0f;
    private static final float PADDING_MARKER_LABEL_V_DP = 4.0f;
    private static final float MARGIN_MARKER_LABEL_B_DP = 4.0f;
    private static final float MARGIN_HEADER_B_DP = 10.0f;
    private static final float SPACER_WIDTH_DP = 12.0f;
    private static final float CONTAINER_CORNER_RADIUS_DP = 16.0f;
    private static final float BUTTON_CORNER_RADIUS_DP = 24.0f;
    private static final float MARKER_LABEL_CORNER_RADIUS_DP = 6.0f;
    private static final int BG_OPACITY_CONTAINER = 230;
    private static final int BG_OPACITY_LABEL = 200;
    private static final int STROKE_OPACITY_CONTAINER = 200;
    
    private static final String COLOR_BG_CONTAINER = "#12141c";
    private static final String COLOR_STROKE_CONTAINER = "#0061a4";
    private static final String COLOR_SUBTITLE = "#c4c6cf";
    private static final String COLOR_BUTTON_CANCEL = "#ffb4ab";
    private static final String COLOR_BUTTON_START = "#0061a4";
    private static final String COLOR_BG_LABEL = "#1b1f27";

    // Style constants for floating pill overlay
    private static final float TEXT_SIZE_FLOATING_STATUS_SP = 14.0f;
    private static final float TEXT_SIZE_FLOATING_COUNTDOWN_SP = 11.0f;
    private static final float TEXT_SIZE_FLOATING_SKIP_SP = 12.0f;
    private static final float TEXT_SIZE_FLOATING_CLOSE_SP = 14.0f;

    private static final float PADDING_FLOATING_H_DP = 16.0f;
    private static final float PADDING_FLOATING_V_DP = 8.0f;
    private static final float PADDING_FLOATING_STATUS_R_DP = 12.0f;
    private static final float PADDING_FLOATING_COUNTDOWN_R_DP = 12.0f;
    private static final float PADDING_FLOATING_SKIP_H_DP = 16.0f;
    private static final float PADDING_FLOATING_SKIP_V_DP = 6.0f;
    private static final float PADDING_FLOATING_CLOSE_L_DP = 12.0f;
    private static final float PADDING_FLOATING_CLOSE_R_DP = 8.0f;
    private static final float PADDING_FLOATING_CLOSE_V_DP = 6.0f;

    private static final float FLOATING_CORNER_RADIUS_DP = 100.0f;
    private static final float FLOATING_INITIAL_Y_DP = 120.0f;

    private static final long GESTURE_CLOSE_DELAY_MS = 1000L;
    private static final long GESTURE_LOAD_DELAY_MS = 950L;
    private static final long GESTURE_TOTAL_DELAY_MS = 1050L;
    private static final int NOTIFICATION_ID = 456;

    // Default calibration coordinates (normalized 0..1)
    private static final float DEFAULT_INVITE_X = 0.5083f;
    private static final float DEFAULT_INVITE_Y = 0.7214f;
    private static final float DEFAULT_CLOSE_X  = 0.9213f;
    private static final float DEFAULT_CLOSE_Y  = 0.2044f;

    private static final float DEFAULT_INVITE_Y_TAP = 0.7218f;
    private static final float DEFAULT_CLOSE_Y_TAP  = 0.204f;

    private static final String PREFS_BLITZ = "blitz_prefs";
    private static final String PREF_INVITE_X = "invite_x";
    private static final String PREF_INVITE_Y = "invite_y";
    private static final String PREF_CLOSE_X  = "close_x";
    private static final String PREF_CLOSE_Y  = "close_y";

    private View mInviteMarker;
    private View mCloseMarker;
    private TextView mStatusText;
    private TextView mCountdownText;
    private LinearLayout mFloatingView;
    private View mWaitingView;
    private WindowManager mWindowManager;

    private int mCapturedMarkerWidth  = 0;
    private int mCapturedMarkerHeight = 0;

    private List<String> mTagsList = new ArrayList<>();
    private final List<View> mTapIndicatorViews = new ArrayList<>();
    private int mCurrentIndex = 0;

    private boolean mIsCalibrationUnlocked = false;

    private final Handler mHandler = new Handler(Looper.getMainLooper());
    private final Runnable mCountdownRunnable = new Runnable() {
        @Override
        public void run() {
            mCurrentIndex++;
            openNextPlayerProfile();
        }
    };

    // -------------------------------------------------------------------------
    // Service lifecycle
    // -------------------------------------------------------------------------

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String tagsExtra = intent != null ? intent.getStringExtra("tags") : null;
        if (tagsExtra != null) {
            try {
                JSONArray jsonArray = new JSONArray(tagsExtra);
                mTagsList.clear();
                for (int i = 0; i < jsonArray.length(); i++) {
                    mTagsList.add(jsonArray.getString(i));
                }
                mCurrentIndex = 0;
            } catch (JSONException e) {
                e.printStackTrace();
                Toast.makeText(this, "Failed to parse player queue", Toast.LENGTH_SHORT).show();
                stopSelf();
                return START_STICKY;
            }
        }
        if (mTagsList.isEmpty()) {
            stopSelf();
            return START_STICKY;
        }

        int pendingFlags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        startForeground(NOTIFICATION_ID,
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Clash Manager - Blitz Mode")
                .setContentText("Opening " + mTagsList.size() + " player profiles automatically")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(PendingIntent.getActivity(this, 0,
                    new Intent(this, MainActivity.class), pendingFlags))
                .setOngoing(true)
                .build());

        mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        launchClashRoyaleOnly();
        setupWaitingOverlay();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        mHandler.removeCallbacksAndMessages(null);
        removeWaitingOverlay();
        if (mWindowManager != null && mFloatingView != null) {
            try {
                mWindowManager.removeView(mFloatingView);
            } catch (Exception e) {
                e.printStackTrace();
            }
            mFloatingView = null;
        }
        for (View view : mTapIndicatorViews) {
            try {
                if (mWindowManager != null) {
                    mWindowManager.removeView(view);
                }
            } catch (Exception ignored) {
            }
        }
        mTapIndicatorViews.clear();
    }

    // -------------------------------------------------------------------------
    // Launch helpers
    // -------------------------------------------------------------------------

    private void launchClashRoyaleOnly() {
        try {
            Intent launch = getPackageManager().getLaunchIntentForPackage("com.supercell.clashroyale");
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launch);
                return;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("clashroyale://"));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e2) {
            e2.printStackTrace();
            Toast.makeText(this, "Clash Royale does not appear to be installed", Toast.LENGTH_LONG).show();
        }
    }

    // -------------------------------------------------------------------------
    // Waiting overlay (calibration popup)
    // -------------------------------------------------------------------------

    private void updateWaitingOverlayTexts(TextView titleView, TextView subtitleView) {
        if (mIsCalibrationUnlocked) {
            titleView.setText("Blitz Calibration");
            subtitleView.setText("Drag markers, then press Start");
        } else {
            titleView.setText("Blitz in Progress");
            subtitleView.setText(mTagsList.size() + " players found");
        }
    }

    private void updateMarkerDraggability() {
        float alpha = mIsCalibrationUnlocked ? 1.0f : 0.4f;
        if (mInviteMarker instanceof LinearLayout) {
            mInviteMarker.setAlpha(alpha);
            updateMarkerLabelState((LinearLayout) mInviteMarker);
        }
        if (mCloseMarker instanceof LinearLayout) {
            mCloseMarker.setAlpha(alpha);
            updateMarkerLabelState((LinearLayout) mCloseMarker);
        }
    }

    private void updateMarkerLabelState(LinearLayout marker) {
        if (marker == null) {
            return;
        }
        View labelView = marker.getChildAt(0);
        if (labelView == null) {
            return;
        }

        int oldVisibility = labelView.getVisibility();
        int newVisibility = mIsCalibrationUnlocked ? View.VISIBLE : View.GONE;
        if (oldVisibility == newVisibility) {
            return;
        }

        WindowManager.LayoutParams lp = (WindowManager.LayoutParams) marker.getLayoutParams();

        // Calculate center using measured dimensions before visibility change
        int w = marker.getMeasuredWidth() > 0 ? marker.getMeasuredWidth() : mCapturedMarkerWidth;
        int h = marker.getMeasuredHeight() > 0 ? marker.getMeasuredHeight() : mCapturedMarkerHeight;
        float dp = getResources().getDisplayMetrics().density;
        int markerRadius = (int) (dp * 36.0f);
        float halfRadius = markerRadius / 2.0f;
        float cx = lp.x + (w / 2.0f);
        float cy = lp.y + (h - halfRadius);

        // Set the new visibility
        labelView.setVisibility(newVisibility);

        // Force-measure the layout to update sizes immediately
        int widthSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED);
        int heightSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED);
        marker.measure(widthSpec, heightSpec);

        int newW = marker.getMeasuredWidth();
        int newH = marker.getMeasuredHeight();

        // Update coordinates to anchor the crosshair center at (cx, cy)
        lp.x = (int) (cx - (newW / 2.0f));
        lp.y = (int) (cy - (newH - halfRadius));

        if (mWindowManager != null) {
            mWindowManager.updateViewLayout(marker, lp);
        }
    }

    private void setupWaitingOverlay() {
        if (mWindowManager == null) {
            return;
        }
        int overlayType = Build.VERSION.SDK_INT >= 26 ? 2038 : 2002;

        SharedPreferences prefs = getSharedPreferences(PREFS_BLITZ, MODE_PRIVATE);
        float inviteXNorm = prefs.getFloat(PREF_INVITE_X, DEFAULT_INVITE_X);
        float inviteYNorm = prefs.getFloat(PREF_INVITE_Y, DEFAULT_INVITE_Y);
        float closeXNorm  = prefs.getFloat(PREF_CLOSE_X,  DEFAULT_CLOSE_X);
        float closeYNorm  = prefs.getFloat(PREF_CLOSE_Y,  DEFAULT_CLOSE_Y);

        DisplayMetrics dm = getResources().getDisplayMetrics();
        float screenW = dm.widthPixels;
        float screenH = dm.heightPixels;
        float dp = dm.density;

        mInviteMarker = createDraggableMarker("Invite", Color.parseColor("#0061a4"),
            (int) (inviteXNorm * screenW), (int) (inviteYNorm * screenH));
        mCloseMarker  = createDraggableMarker("Close", Color.parseColor("#ba1a1a"),
            (int) (closeXNorm * screenW),  (int) (closeYNorm * screenH));
        updateMarkerDraggability();

        // -- Container --
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setGravity(android.view.Gravity.CENTER);
        int padH = (int) (PADDING_CONTAINER_H_DP * dp);
        int padV = (int) (PADDING_CONTAINER_V_DP * dp);
        container.setPadding(padH, padV, padH, padV);

        GradientDrawable containerBg = new GradientDrawable();
        containerBg.setCornerRadius(CONTAINER_CORNER_RADIUS_DP * dp);
        containerBg.setColor(Color.argb(BG_OPACITY_CONTAINER, 18, 20, 28)); // #12141c theme
        containerBg.setStroke((int) dp, Color.argb(STROKE_OPACITY_CONTAINER, 0, 97, 164));
        container.setBackground(containerBg);

        // Header Row (horizontal layout)
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(android.view.Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        headerParams.bottomMargin = (int) (MARGIN_HEADER_B_DP * dp);
        headerRow.setLayoutParams(headerParams);

        // Title & Subtitle container (vertical)
        LinearLayout textContainer = new LinearLayout(this);
        textContainer.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
            0,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            1.0f
        );
        textContainer.setLayoutParams(textParams);

        // Title
        final TextView titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TEXT_SIZE_TITLE_SP);
        titleView.setTypeface(null, android.graphics.Typeface.BOLD);
        textContainer.addView(titleView);

        // Subtitle
        final TextView subtitleView = new TextView(this);
        subtitleView.setTextColor(Color.parseColor(COLOR_SUBTITLE));
        subtitleView.setTextSize(TEXT_SIZE_SUBTITLE_SP);
        textContainer.addView(subtitleView);

        headerRow.addView(textContainer);

        // Modify / Lock toggle button (Pencil icon)
        final ImageButton modifyBtn = new ImageButton(this);
        modifyBtn.setImageResource(android.R.drawable.ic_menu_edit);
        
        // Translucent circular background
        GradientDrawable modifyBg = new GradientDrawable();
        modifyBg.setShape(GradientDrawable.OVAL);
        modifyBg.setColor(Color.argb(40, 255, 255, 255));
        modifyBtn.setBackground(modifyBg);
        
        int btnSize = (int) (MODIFY_BUTTON_SIZE_DP * dp);
        int btnPad = (int) (MODIFY_BUTTON_PADDING_DP * dp);
        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(btnSize, btnSize);
        modifyBtn.setLayoutParams(btnParams);
        modifyBtn.setPadding(btnPad, btnPad, btnPad, btnPad);
        modifyBtn.setScaleType(ImageView.ScaleType.FIT_CENTER);
        modifyBtn.setColorFilter(Color.parseColor(COLOR_ICON_LOCKED));

        modifyBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                mIsCalibrationUnlocked = !mIsCalibrationUnlocked;
                if (mIsCalibrationUnlocked) {
                    modifyBtn.setColorFilter(Color.parseColor(COLOR_ICON_UNLOCKED));
                } else {
                    modifyBtn.setColorFilter(Color.parseColor(COLOR_ICON_LOCKED));
                    saveCoordinates(true);
                }
                updateWaitingOverlayTexts(titleView, subtitleView);
                updateMarkerDraggability();
            }
        });
        headerRow.addView(modifyBtn);

        container.addView(headerRow);

        updateWaitingOverlayTexts(titleView, subtitleView);

        // -- Button row --
        LinearLayout btnRow = new LinearLayout(this);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);
        btnRow.setGravity(android.view.Gravity.CENTER);

        int btnPadH = (int) (PADDING_BUTTON_H_DP * dp);
        int btnPadV = (int) (PADDING_BUTTON_V_DP * dp);

        // Cancel button
        Button cancelBtn = new Button(this);
        cancelBtn.setText("Cancel");
        cancelBtn.setTextColor(Color.parseColor(COLOR_BUTTON_CANCEL));
        cancelBtn.setBackgroundColor(Color.TRANSPARENT);
        cancelBtn.setTextSize(TEXT_SIZE_BUTTON_SP);
        cancelBtn.setPadding(btnPadH, btnPadV, btnPadH, btnPadV);
        cancelBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopSelf();
            }
        });
        btnRow.addView(cancelBtn);

        // Spacer
        View spacer1 = new View(this);
        spacer1.setLayoutParams(new LinearLayout.LayoutParams((int) (SPACER_WIDTH_DP * dp), 1));
        btnRow.addView(spacer1);

        // Start button
        Button startBtn = new Button(this);
        startBtn.setText("Start");
        startBtn.setTextColor(Color.WHITE);
        startBtn.setTextSize(TEXT_SIZE_BUTTON_SP);
        startBtn.setTypeface(null, android.graphics.Typeface.BOLD);
        startBtn.setPadding(btnPadH, btnPadV, btnPadH, btnPadV);
        GradientDrawable startBg = new GradientDrawable();
        startBg.setCornerRadius(BUTTON_CORNER_RADIUS_DP * dp);
        startBg.setColor(Color.parseColor(COLOR_BUTTON_START));
        startBtn.setBackground(startBg);
        startBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                saveCoordinates(true);
                Toast.makeText(BlitzService.this, "Coordinates saved", Toast.LENGTH_SHORT).show();
                if (mWindowManager != null && mWaitingView != null) {
                    try {
                        mWindowManager.removeView(mWaitingView);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                    mWaitingView = null;
                }
                transitionMarkersToRunningState();
                setupFloatingView();
                openNextPlayerProfile();
            }
        });
        btnRow.addView(startBtn);

        container.addView(btnRow);

        // -- Window params --
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            android.graphics.PixelFormat.TRANSLUCENT);
        lp.gravity = android.view.Gravity.BOTTOM | android.view.Gravity.CENTER_HORIZONTAL;
        lp.x = 0;
        lp.y = (int) (dp * 40.0f);

        mWaitingView = container;
        try {
            mWindowManager.addView(mInviteMarker, mInviteMarker.getLayoutParams());
            mWindowManager.addView(mCloseMarker, mCloseMarker.getLayoutParams());
            mWindowManager.addView(mWaitingView, lp);
        } catch (Exception e) {
            e.printStackTrace();
            stopSelf();
        }
    }

    private void transitionMarkersToRunningState() {
        if (mWindowManager == null) {
            return;
        }
        try {
            if (mInviteMarker != null) {
                WindowManager.LayoutParams lp = (WindowManager.LayoutParams) mInviteMarker.getLayoutParams();
                lp.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
                mInviteMarker.setAlpha(0.45f);
                mWindowManager.updateViewLayout(mInviteMarker, lp);
            }
            if (mCloseMarker != null) {
                WindowManager.LayoutParams lp = (WindowManager.LayoutParams) mCloseMarker.getLayoutParams();
                lp.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
                mCloseMarker.setAlpha(0.45f);
                mWindowManager.updateViewLayout(mCloseMarker, lp);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private View createDraggableMarker(String label, int color, final int centerX, final int centerY) {
        final LinearLayout markerLayout = new LinearLayout(this);
        markerLayout.setOrientation(LinearLayout.VERTICAL);
        markerLayout.setGravity(android.view.Gravity.CENTER);

        DisplayMetrics dm = getResources().getDisplayMetrics();
        float dp = dm.density;
        final int markerSize = (int) (36.0f * dp);

        // Label text
        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(Color.WHITE);
        labelView.setTextSize(TEXT_SIZE_MARKER_LABEL_SP);
        labelView.setSingleLine(true);
        labelView.setMaxLines(1);
        labelView.setEllipsize(null);
        int labelPadH = (int) (PADDING_MARKER_LABEL_H_DP * dp);
        int labelPadV = (int) (PADDING_MARKER_LABEL_V_DP * dp);
        labelView.setPadding(labelPadH, labelPadV, labelPadH, labelPadV);
        labelView.setTypeface(null, android.graphics.Typeface.BOLD);
        labelView.setGravity(android.view.Gravity.CENTER);

        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        labelParams.bottomMargin = (int) (MARGIN_MARKER_LABEL_B_DP * dp);
        labelView.setLayoutParams(labelParams);

        GradientDrawable labelBg = new GradientDrawable();
        float labelRadius = MARKER_LABEL_CORNER_RADIUS_DP * dp;
        labelBg.setCornerRadius(labelRadius);
        labelBg.setColor(Color.argb(BG_OPACITY_LABEL, 27, 31, 39));
        int strokeW = (int) dp;
        labelBg.setStroke(strokeW, color);
        labelView.setBackground(labelBg);
        
        labelView.setVisibility(mIsCalibrationUnlocked ? View.VISIBLE : View.GONE);
        markerLayout.addView(labelView);

        // Crosshair frame
        FrameLayout crosshair = new FrameLayout(this);
        LinearLayout.LayoutParams crosshairLp = new LinearLayout.LayoutParams(markerSize, markerSize);
        crosshairLp.gravity = android.view.Gravity.CENTER_HORIZONTAL;
        crosshair.setLayoutParams(crosshairLp);

        // Outer pulsing ring
        View outerRing = new View(this);
        outerRing.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));
        GradientDrawable ringBg = new GradientDrawable();
        ringBg.setShape(GradientDrawable.OVAL);
        ringBg.setColor(Color.argb(30, Color.red(color), Color.green(color), Color.blue(color)));
        int strokeHalf = (int) (1.5f * dp);
        ringBg.setStroke(strokeHalf, Color.argb(120, Color.red(color), Color.green(color), Color.blue(color)));
        outerRing.setBackground(ringBg);
        crosshair.addView(outerRing);

        // Inner circle
        int innerSize = (int) (20.0f * dp);
        View innerCircle = new View(this);
        FrameLayout.LayoutParams innerLp = new FrameLayout.LayoutParams(innerSize, innerSize);
        innerLp.gravity = android.view.Gravity.CENTER;
        innerCircle.setLayoutParams(innerLp);
        GradientDrawable innerBg = new GradientDrawable();
        innerBg.setShape(GradientDrawable.OVAL);
        innerBg.setStroke(strokeHalf, color);
        innerCircle.setBackground(innerBg);
        crosshair.addView(innerCircle);

        // Horizontal bar
        View hBar = new View(this);
        FrameLayout.LayoutParams hBarLp = new FrameLayout.LayoutParams(innerSize, strokeW);
        hBarLp.gravity = android.view.Gravity.CENTER;
        hBar.setLayoutParams(hBarLp);
        hBar.setBackgroundColor(color);
        crosshair.addView(hBar);

        // Vertical bar
        View vBar = new View(this);
        FrameLayout.LayoutParams vBarLp = new FrameLayout.LayoutParams(strokeW, innerSize);
        vBarLp.gravity = android.view.Gravity.CENTER;
        vBar.setLayoutParams(vBarLp);
        vBar.setBackgroundColor(color);
        crosshair.addView(vBar);

        // Center dot
        int dotSize = (int) (6.0f * dp);
        View dot = new View(this);
        FrameLayout.LayoutParams dotLp = new FrameLayout.LayoutParams(dotSize, dotSize);
        dotLp.gravity = android.view.Gravity.CENTER;
        dot.setLayoutParams(dotLp);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setShape(GradientDrawable.OVAL);
        dotBg.setColor(color);
        dot.setBackground(dotBg);
        crosshair.addView(dot);

        markerLayout.addView(crosshair);

        // Pulsing animations on outer ring
        ObjectAnimator alphaAnim = ObjectAnimator.ofFloat(outerRing, "alpha", 1.0f, 0.1f);
        alphaAnim.setDuration(1200L);
        alphaAnim.setRepeatCount(ObjectAnimator.INFINITE);
        alphaAnim.setRepeatMode(ObjectAnimator.REVERSE);
        alphaAnim.setInterpolator(new DecelerateInterpolator());
        alphaAnim.start();

        ObjectAnimator scaleXAnim = ObjectAnimator.ofFloat(outerRing, "scaleX", 0.7f, 1.25f);
        scaleXAnim.setDuration(1200L);
        scaleXAnim.setRepeatCount(ObjectAnimator.INFINITE);
        scaleXAnim.setRepeatMode(ObjectAnimator.REVERSE);
        scaleXAnim.setInterpolator(new DecelerateInterpolator());
        scaleXAnim.start();

        ObjectAnimator scaleYAnim = ObjectAnimator.ofFloat(outerRing, "scaleY", 0.7f, 1.25f);
        scaleYAnim.setDuration(1200L);
        scaleYAnim.setRepeatCount(ObjectAnimator.INFINITE);
        scaleYAnim.setRepeatMode(ObjectAnimator.REVERSE);
        scaleYAnim.setInterpolator(new DecelerateInterpolator());
        scaleYAnim.start();

        // Window layout params
        int overlayType = Build.VERSION.SDK_INT >= 26 ? 2038 : 2002;
        final WindowManager.LayoutParams markerLp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            android.graphics.PixelFormat.TRANSLUCENT);
        markerLp.gravity = android.view.Gravity.TOP | android.view.Gravity.LEFT;
        int halfSize = markerSize / 2;
        markerLp.x = centerX - halfSize;
        markerLp.y = centerY - halfSize;
        markerLayout.setLayoutParams(markerLp);

        // Adjust position once measured
        markerLayout.getViewTreeObserver().addOnGlobalLayoutListener(
            new ViewTreeObserver.OnGlobalLayoutListener() {
                @Override
                public void onGlobalLayout() {
                    markerLayout.getViewTreeObserver().removeOnGlobalLayoutListener(this);
                    int w = markerLayout.getMeasuredWidth();
                    int h = markerLayout.getMeasuredHeight();
                    if (w > 0) {
                        mCapturedMarkerWidth  = w;
                        mCapturedMarkerHeight = h;
                        markerLp.x = centerX - (w / 2);
                        markerLp.y = centerY - (h - (markerSize / 2));
                        if (mWindowManager != null) {
                            mWindowManager.updateViewLayout(markerLayout, markerLp);
                        }
                    }
                }
            });

        // Drag touch listener (only active when calibration is unlocked)
        markerLayout.setOnTouchListener(new View.OnTouchListener() {
            private int startX;
            private int startY;
            private float touchX;
            private float touchY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                if (mWaitingView == null || !mIsCalibrationUnlocked) {
                    return false;
                }
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = markerLp.x;
                        startY = markerLp.y;
                        touchX = event.getRawX();
                        touchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        markerLp.x = startX + (int) (event.getRawX() - touchX);
                        markerLp.y = startY + (int) (event.getRawY() - touchY);
                        if (mWindowManager != null) {
                            mWindowManager.updateViewLayout(v, markerLp);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        return true;
                    default:
                        return false;
                }
            }
        });

        return markerLayout;
    }

    // -------------------------------------------------------------------------
    // Tap indicator
    // -------------------------------------------------------------------------

    private void showTapIndicator(final float x, final float y, int color) {
        if (mWindowManager == null) {
            return;
        }
        float dp = getResources().getDisplayMetrics().density;
        int size = (int) (56.0f * dp);
        int overlayType = Build.VERSION.SDK_INT >= 26 ? 2038 : 2002;

        final View indicator = new View(this);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.argb(100, Color.red(color), Color.green(color), Color.blue(color)));
        bg.setStroke((int) (dp * 3.0f), color);
        indicator.setBackground(bg);

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            size, size, overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            android.graphics.PixelFormat.TRANSLUCENT);
        lp.gravity = android.view.Gravity.TOP | android.view.Gravity.LEFT;
        float half = size / 2.0f;
        lp.x = (int) (x - half);
        lp.y = (int) (y - half);

        try {
            mWindowManager.addView(indicator, lp);
            mTapIndicatorViews.add(indicator);
            indicator.setAlpha(1.0f);
            indicator.setScaleX(0.4f);
            indicator.setScaleY(0.4f);
            indicator.animate()
                .alpha(0.0f)
                .scaleX(2.0f)
                .scaleY(2.0f)
                .setDuration(500L)
                .setInterpolator(new DecelerateInterpolator())
                .withEndAction(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            if (mWindowManager != null) {
                                mWindowManager.removeView(indicator);
                            }
                            mTapIndicatorViews.remove(indicator);
                        } catch (Exception ignored) {
                        }
                    }
                })
                .start();
        } catch (Exception ignored) {
        }
    }

    // -------------------------------------------------------------------------
    // Coordinate persistence
    // -------------------------------------------------------------------------

    private void saveCoordinates(boolean commit) {
        if (mInviteMarker == null || mCloseMarker == null) {
            return;
        }
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int screenW = dm.widthPixels;
        int screenH = dm.heightPixels;
        int markerRadius = (int) (dm.density * 36.0f);

        WindowManager.LayoutParams inviteLp = (WindowManager.LayoutParams) mInviteMarker.getLayoutParams();
        WindowManager.LayoutParams closeLp  = (WindowManager.LayoutParams) mCloseMarker.getLayoutParams();

        int inviteW = mInviteMarker.getMeasuredWidth()  > 0 ? mInviteMarker.getMeasuredWidth()  : mCapturedMarkerWidth;
        int inviteH = mInviteMarker.getMeasuredHeight() > 0 ? mInviteMarker.getMeasuredHeight() : mCapturedMarkerHeight;
        int closeW  = mCloseMarker.getMeasuredWidth()   > 0 ? mCloseMarker.getMeasuredWidth()   : mCapturedMarkerWidth;
        int closeH  = mCloseMarker.getMeasuredHeight()  > 0 ? mCloseMarker.getMeasuredHeight()  : mCapturedMarkerHeight;

        if (inviteW == 0) inviteW = markerRadius;
        if (inviteH == 0) inviteH = markerRadius;
        if (closeW  == 0) closeW  = markerRadius;
        if (closeH  == 0) closeH  = markerRadius;

        float halfRadius = markerRadius / 2.0f;
        float inviteCX = inviteLp.x + (inviteW / 2.0f);
        float inviteCY = inviteLp.y + (inviteH - halfRadius);
        float closeCX  = closeLp.x  + (closeW  / 2.0f);
        float closeCY  = closeLp.y  + (closeH  - halfRadius);

        float normIX = clamp(inviteCX / screenW, 0f, 1f, DEFAULT_INVITE_X);
        float normIY = clamp(inviteCY / screenH, 0f, 1f, DEFAULT_INVITE_Y);
        float normCX = clamp(closeCX  / screenW, 0f, 1f, DEFAULT_CLOSE_X);
        float normCY = clamp(closeCY  / screenH, 0f, 1f, DEFAULT_CLOSE_Y);

        SharedPreferences.Editor editor = getSharedPreferences(PREFS_BLITZ, MODE_PRIVATE)
            .edit()
            .putFloat(PREF_INVITE_X, normIX)
            .putFloat(PREF_INVITE_Y, normIY)
            .putFloat(PREF_CLOSE_X,  normCX)
            .putFloat(PREF_CLOSE_Y,  normCY);

        if (commit) {
            editor.commit();
        } else {
            editor.apply();
        }
    }

    private static float clamp(float value, float min, float max, float fallback) {
        if (value < min || value > max) return fallback;
        return value;
    }

    private void removeWaitingOverlay() {
        if (mWindowManager == null) {
            return;
        }
        try {
            if (mInviteMarker != null) {
                mWindowManager.removeView(mInviteMarker);
            }
            if (mCloseMarker != null) {
                mWindowManager.removeView(mCloseMarker);
            }
            if (mWaitingView != null) {
                mWindowManager.removeView(mWaitingView);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        mInviteMarker = null;
        mCloseMarker  = null;
        mWaitingView  = null;
    }

    // -------------------------------------------------------------------------
    // Blitz run-mode (floating pill + player cycling)
    // -------------------------------------------------------------------------

    private void openNextPlayerProfile() {
        mHandler.removeCallbacks(mCountdownRunnable);
        if (mCurrentIndex >= mTagsList.size()) {
            Toast.makeText(this, "Blitz complete", Toast.LENGTH_SHORT).show();
            stopSelf();
            return;
        }

        String tag = mTagsList.get(mCurrentIndex);
        if (tag.startsWith("#")) {
            tag = tag.substring(1);
        }
        try {
            Intent uri = Intent.parseUri(
                "intent://playerInfo?id=" + tag
                    + "#Intent;scheme=clashroyale;package=com.supercell.clashroyale;end", 1);
            uri.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(uri);
        } catch (Exception e) {
            e.printStackTrace();
            Toast.makeText(this, "Could not open Clash Royale - is it installed?",
                Toast.LENGTH_SHORT).show();
        }

        updateOverlayUi();

        if (ClashManagerAccessibilityService.isActive()) {
            SharedPreferences prefs = getSharedPreferences(PREFS_BLITZ, MODE_PRIVATE);
            DisplayMetrics dm = getResources().getDisplayMetrics();
            final float inviteX = prefs.getFloat(PREF_INVITE_X, DEFAULT_INVITE_X) * dm.widthPixels;
            final float inviteY = prefs.getFloat(PREF_INVITE_Y, DEFAULT_INVITE_Y_TAP) * dm.heightPixels;
            final float closeX  = prefs.getFloat(PREF_CLOSE_X,  DEFAULT_CLOSE_X)  * dm.widthPixels;
            final float closeY  = prefs.getFloat(PREF_CLOSE_Y,  DEFAULT_CLOSE_Y_TAP)  * dm.heightPixels;

            mHandler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    ClashManagerAccessibilityService.tapInvite();
                    showTapIndicator(inviteX, inviteY, Color.parseColor("#0061a4"));
                }
            }, GESTURE_LOAD_DELAY_MS);

            mHandler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    ClashManagerAccessibilityService.tapClose();
                    showTapIndicator(closeX, closeY, Color.parseColor("#ba1a1a"));
                }
            }, GESTURE_CLOSE_DELAY_MS);
        }

        int remaining = mTagsList.size() - 1;
        long delay = (ClashManagerAccessibilityService.isActive())
            ? GESTURE_TOTAL_DELAY_MS
            : AUTO_ADVANCE_DELAY_MS;

        if (mCurrentIndex < remaining) {
            mHandler.postDelayed(mCountdownRunnable, delay);
        } else {
            mHandler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(BlitzService.this, "Blitz complete", Toast.LENGTH_SHORT).show();
                    stopSelf();
                }
            }, delay);
        }
    }

    private void updateOverlayUi() {
        if (mStatusText == null) {
            return;
        }
        int displayed = mCurrentIndex + 1;
        int total = mTagsList.size();
        mStatusText.setText(displayed + " / " + total);
        if (mCountdownText != null) {
            mCountdownText.setText(mCurrentIndex < total - 1 ? "Auto-advancing" : "Last player");
        }
    }

    private void setupFloatingView() {
        if (mWindowManager == null) {
            mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        }

        DisplayMetrics dm = getResources().getDisplayMetrics();
        float dp = dm.density;

        LinearLayout pill = new LinearLayout(this);
        mFloatingView = pill;
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(android.view.Gravity.CENTER_VERTICAL);
        pill.setPadding(
            (int) (PADDING_FLOATING_H_DP * dp),
            (int) (PADDING_FLOATING_V_DP * dp),
            (int) (PADDING_FLOATING_H_DP * dp),
            (int) (PADDING_FLOATING_V_DP * dp)
        );

        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setCornerRadius(FLOATING_CORNER_RADIUS_DP * dp);
        pillBg.setColor(Color.argb(BG_OPACITY_CONTAINER, 18, 20, 28)); // #12141c theme
        pillBg.setStroke((int) dp, Color.argb(STROKE_OPACITY_CONTAINER, 0, 97, 164));
        pill.setBackground(pillBg);

        // Status "X / Y"
        TextView statusTv = new TextView(this);
        mStatusText = statusTv;
        statusTv.setTextColor(Color.WHITE);
        statusTv.setTextSize(TEXT_SIZE_FLOATING_STATUS_SP);
        statusTv.setTypeface(null, android.graphics.Typeface.BOLD);
        statusTv.setPadding(0, 0, (int) (PADDING_FLOATING_STATUS_R_DP * dp), 0);
        statusTv.setText("1 / " + mTagsList.size());
        pill.addView(statusTv);

        // Countdown label
        TextView countdownTv = new TextView(this);
        mCountdownText = countdownTv;
        countdownTv.setTextColor(Color.parseColor("#aac7ff"));
        countdownTv.setTextSize(TEXT_SIZE_FLOATING_COUNTDOWN_SP);
        countdownTv.setPadding(0, 0, (int) (PADDING_FLOATING_COUNTDOWN_R_DP * dp), 0);
        countdownTv.setText("Auto-advancing");
        pill.addView(countdownTv);

        // Skip button
        Button skipBtn = new Button(this);
        skipBtn.setText("Skip");
        skipBtn.setTextColor(Color.WHITE);
        skipBtn.setTextSize(TEXT_SIZE_FLOATING_SKIP_SP);
        skipBtn.setPadding(
            (int) (PADDING_FLOATING_SKIP_H_DP * dp),
            (int) (PADDING_FLOATING_SKIP_V_DP * dp),
            (int) (PADDING_FLOATING_SKIP_H_DP * dp),
            (int) (PADDING_FLOATING_SKIP_V_DP * dp)
        );
        GradientDrawable skipBg = new GradientDrawable();
        skipBg.setCornerRadius(BUTTON_CORNER_RADIUS_DP * dp);
        skipBg.setColor(Color.parseColor(COLOR_BUTTON_START));
        skipBtn.setBackground(skipBg);
        skipBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                mHandler.removeCallbacks(mCountdownRunnable);
                mCurrentIndex++;
                openNextPlayerProfile();
            }
        });
        pill.addView(skipBtn);

        // Close button
        Button closeBtn = new Button(this);
        closeBtn.setText("X");
        closeBtn.setTextColor(Color.parseColor(COLOR_BUTTON_CANCEL));
        closeBtn.setBackgroundColor(Color.TRANSPARENT);
        closeBtn.setTextSize(TEXT_SIZE_FLOATING_CLOSE_SP);
        closeBtn.setPadding(
            (int) (PADDING_FLOATING_CLOSE_L_DP * dp),
            (int) (PADDING_FLOATING_CLOSE_V_DP * dp),
            (int) (PADDING_FLOATING_CLOSE_R_DP * dp),
            (int) (PADDING_FLOATING_CLOSE_V_DP * dp)
        );
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopSelf();
            }
        });
        pill.addView(closeBtn);

        // Draggable pill
        final WindowManager.LayoutParams pillLp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            Build.VERSION.SDK_INT >= 26 ? 2038 : 2002,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            android.graphics.PixelFormat.TRANSLUCENT);
        pillLp.gravity = android.view.Gravity.TOP | android.view.Gravity.LEFT;
        pillLp.x = 0;
        pillLp.y = (int) (FLOATING_INITIAL_Y_DP * dp);

        pill.setOnTouchListener(new View.OnTouchListener() {
            private float initTouchX;
            private float initTouchY;
            private int   initX;
            private int   initY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initX = pillLp.x;
                        initY = pillLp.y;
                        initTouchX = event.getRawX();
                        initTouchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        pillLp.x = initX + (int) (event.getRawX() - initTouchX);
                        pillLp.y = initY + (int) (event.getRawY() - initTouchY);
                        if (mWindowManager != null && mFloatingView != null) {
                            mWindowManager.updateViewLayout(mFloatingView, pillLp);
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });

        try {
            mWindowManager.addView(mFloatingView, pillLp);
        } catch (Exception e) {
            e.printStackTrace();
            mFloatingView  = null;
            mStatusText    = null;
            mCountdownText = null;
        }
    }

    // -------------------------------------------------------------------------
    // Notification channel
    // -------------------------------------------------------------------------

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Blitz Mode Service", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Manages automated Blitz Mode player recruitment");
            NotificationManager nm = (NotificationManager) getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }
}
