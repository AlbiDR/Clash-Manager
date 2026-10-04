// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import android.animation.ObjectAnimator;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Insets;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.net.Uri;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.animation.DecelerateInterpolator;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.app.NotificationCompat;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;

public class BlitzService extends Service {

    private static final String TAG = "ClashManagerBlitz";

    /**
     * Rehearsal runs the whole of Blitz (panel, markers, Start, the Stop pill,
     * both taps, completion) without opening Clash Royale: the game switches USB
     * debugging off while it is open, so a real run can never be watched from a
     * development machine. The taps still go out, onto whatever is on screen.
     * Only a debuggable build (CM Dev) honours it; the release ignores the extra.
     */
    static final String EXTRA_REHEARSAL = "blitzRehearsal";

    /**
     * False when the run only opens profiles: no Invite or Close taps, and no
     * tap targets on screen. The Roster sends its own clan members, who cannot
     * be invited, so it opens profiles only. Absent means true, which is what
     * every caller before this extra existed expects.
     */
    static final String EXTRA_SEND_INVITES = "sendInvites";

    // Mirrors the defensive 3..15-character body envelope in RoyaleTagSchema:
    // a leading '#' is display syntax, not part of the deep-link player id.
    private static final int MIN_PLAYER_TAG_LENGTH = 3;
    private static final int MAX_PLAYER_TAG_LENGTH = 15;
    private static final Pattern PLAYER_TAG_BODY_PATTERN = Pattern.compile("[0289CGJLPQRUVY]+");

    static boolean isRehearsal(Context context, Intent intent) {
        return intent != null
            && intent.getBooleanExtra(EXTRA_REHEARSAL, false)
            && (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private boolean mRehearsal = false;
    private boolean mSendInvites = true;

    // The run as BlitzRun records it; mRunOutcome is null until Start is pressed.
    private String mRunOutcome = null;
    private long mRunStartedAt = 0L;
    private int mRunOpened = 0;
    private int mRunInvites = 0;

    /**
     * Profile dwell domain.
     *
     * These mirror BLITZ_DWELL_MIN / _MAX / _STEP / _DETENTS and
     * BLITZ_BATCH_SHIFT_DELAY in Frontend-PWA/src/core/config/index.ts, which is
     * the source of truth for this domain: the PWA publishes the chosen dwell
     * through the "delayMs" intent extra, and the slider here has to offer the
     * same range and the same stops or the two controls would disagree about
     * what a setting means. Neither side can import the other, so
     * APK/verify-dwell-parity.mjs reads both files and fails
     * the build if they ever drift apart.
     */
    static final long DWELL_MIN_MS = 850L;
    static final long DWELL_MAX_MS = 6000L;
    static final long DWELL_STEP_MS = 10L;
    static final long[] DWELL_DETENTS_MS = { 850L, 1500L, 2100L, 3000L, 4200L, 5100L, 6000L };

    /** Dwell applied when the PWA sends no explicit value. Java forbids a forward
     *  reference in an initialiser, so this sits after the domain it derives from. */
    static final long DEFAULT_PROFILE_LOAD_DELAY_MS = DWELL_MIN_MS;

    /**
     * Per-player allowance added to the dwell when estimating a run's length.
     * Covers the invite and close taps. Mirrors BLITZ_BATCH_SHIFT_DELAY so the
     * figure quoted here and the one beside the Settings slider agree.
     */
    static final long DWELL_ESTIMATE_OVERHEAD_MS = 150L;

    /** Resolution of the dwell SeekBar. Finer than the step, so the step governs. */
    private static final int DWELL_SEEK_RESOLUTION = 1000;
    /** Distance within which a drag is pulled onto a detent. Matches SLIDER_SNAP_RADIUS_PX. */
    private static final float DWELL_SNAP_RADIUS_DP = 6.0f;
    private static final float DWELL_TRACK_HEIGHT_DP = 4.0f;
    private static final float DWELL_THUMB_SIZE_DP = 14.0f;
    private static final float DWELL_TICK_WIDTH_DP = 1.0f;
    private static final float TEXT_SIZE_DWELL_VALUE_SP = 13.0f;
    private static final float TEXT_SIZE_DWELL_FOOT_SP = 9.0f;
    private static final float PADDING_DWELL_TOP_DP = 10.0f;
    private static final float MARGIN_DWELL_B_DP = 12.0f;
    private static final String CHANNEL_ID = "BlitzServiceChannel";

    // Dynamic overlay ids are stable so accessibility services and device checks
    // can address controls that do not exist in an XML resource tree.
    private static final int VIEW_ID_BLITZ_SETUP_PANEL = 0x434D0101;
    private static final int VIEW_ID_BLITZ_INVITE_MARKER = 0x434D0102;
    private static final int VIEW_ID_BLITZ_CLOSE_MARKER = 0x434D0103;
    private static final int VIEW_ID_BLITZ_EDIT_BUTTON = 0x434D0104;
    private static final int VIEW_ID_BLITZ_CANCEL_BUTTON = 0x434D0105;
    private static final int VIEW_ID_BLITZ_START_BUTTON = 0x434D0106;
    private static final int VIEW_ID_BLITZ_DWELL_SLIDER = 0x434D0107;
    private static final int VIEW_ID_BLITZ_RUNNING_PILL = 0x434D0108;
    private static final int VIEW_ID_BLITZ_STOP_BUTTON = 0x434D0109;

    private static final int ACTION_ID_BLITZ_MOVE_LEFT = 0x434D0201;
    private static final int ACTION_ID_BLITZ_MOVE_RIGHT = 0x434D0202;
    private static final int ACTION_ID_BLITZ_MOVE_UP = 0x434D0203;
    private static final int ACTION_ID_BLITZ_MOVE_DOWN = 0x434D0204;

    // Canonical dark-theme roles from Frontend-PWA/src/core/theme/tokens.ts.
    // The overlay is intentionally dark over the game in either system theme.
    private static final String COLOR_PRIMARY = "#a8c7fa";
    private static final String COLOR_ON_PRIMARY = "#00315b";
    private static final String COLOR_ERROR = "#ffb4ab";
    private static final String COLOR_ON_ERROR = "#690005";
    private static final String COLOR_SURFACE_CONTAINER_LOW = "#151920";
    private static final String COLOR_SURFACE_CONTAINER = "#1b1f27";
    private static final String COLOR_ON_SURFACE = "#e1e2e8";
    private static final String COLOR_ON_SURFACE_VARIANT = "#c4c7c5";
    private static final String COLOR_OUTLINE_VARIANT = "#44474f";

    // Constants for modify button styling
    private static final float MODIFY_BUTTON_SIZE_DP = 48.0f;
    private static final int MODIFY_BUTTON_PADDING_DP = 12;
    private static final float MODIFY_BUTTON_MARGIN_H_DP = 8.0f;
    private static final float MODIFY_BUTTON_MARGIN_V_DP = 6.0f;

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
    private static final float MIN_TOUCH_TARGET_DP = 48.0f;
    private static final float OVERLAY_ELEVATION_DP = 8.0f;
    private static final float BLITZ_SETUP_EDGE_MARGIN_DP = 16.0f;
    private static final float ACCESSIBILITY_MOVE_STEP_DP = 16.0f;
    private static final float LOCKED_MARKER_ALPHA = 0.4f;
    private static final float RUNNING_MARKER_ALPHA = 0.45f;
    private static final int BG_OPACITY_CONTAINER = 248;
    private static final int BG_OPACITY_LABEL = 200;
    private static final int STROKE_OPACITY_CONTAINER = 200;

    // Style constants for floating pill overlay
    private static final float TEXT_SIZE_FLOATING_STATUS_SP = 14.0f;
    private static final float TEXT_SIZE_FLOATING_COUNTDOWN_SP = 11.0f;
    private static final float TEXT_SIZE_FLOATING_CLOSE_SP = 13.0f;

    private static final float PADDING_FLOATING_H_DP = 16.0f;
    private static final float PADDING_FLOATING_V_DP = 8.0f;
    private static final float PADDING_FLOATING_STATUS_R_DP = 12.0f;
    private static final float PADDING_FLOATING_COUNTDOWN_R_DP = 12.0f;
    private static final float PADDING_FLOATING_CLOSE_H_DP = 18.0f;
    private static final float PADDING_FLOATING_CLOSE_V_DP = 6.0f;

    private static final float FLOATING_CORNER_RADIUS_DP = 100.0f;
    private static final float FLOATING_INITIAL_Y_DP = 120.0f;
    private static final float FLOATING_PILL_MIN_HEIGHT_DP = 56.0f;
    private static final float FLOATING_SAFE_EDGE_MARGIN_DP = 8.0f;
    private static final float TAP_INDICATOR_SIZE_DP = 56.0f;
    private static final float PADDING_DWELL_TRACK_V_DP = 8.0f;
    private static final float PADDING_DWELL_UNIT_START_DP = 3.0f;

    private static final float MARKER_INNER_SIZE_DP = 20.0f;
    private static final float MARKER_STROKE_WIDTH_DP = 1.0f;
    private static final float MARKER_INNER_STROKE_WIDTH_DP = 1.5f;
    private static final float MARKER_DOT_SIZE_DP = 6.0f;
    private static final int MARKER_GLOW_STRONG_ALPHA = 70;
    private static final int MARKER_GLOW_SOFT_ALPHA = 25;
    private static final int MARKER_INNER_STROKE_ALPHA = 160;
    private static final long MARKER_PULSE_DURATION_MS = 1200L;
    private static final float MARKER_PULSE_MIN_ALPHA = 0.1f;
    private static final float MARKER_PULSE_MIN_SCALE = 0.7f;
    private static final float MARKER_PULSE_MAX_SCALE = 1.25f;

    private static final float TAP_INDICATOR_WINDOW_SCALE = 2.2f;
    private static final float TAP_INDICATOR_STROKE_WIDTH_DP = 2.0f;
    private static final int TAP_INDICATOR_STRONG_ALPHA = 140;
    private static final int TAP_INDICATOR_SOFT_ALPHA = 60;
    private static final int TAP_INDICATOR_STROKE_ALPHA = 180;
    private static final float TAP_INDICATOR_INITIAL_SCALE = 0.4f;
    private static final float TAP_INDICATOR_FINAL_SCALE = 2.0f;
    private static final long TAP_INDICATOR_DURATION_MS = 500L;

    private static final int NOTIFICATION_ID = 456;

    // The crosshair's rest-state visual size. The pulsing ring animates its scale up to
    // 1.25x this value, so the surrounding anchor box (below) must be sized to fit that
    // peak, or the overlay window surface hard-clips it with a visible straight edge.
    private static final float MARKER_RING_SIZE_DP = 36.0f;
    private static final float MARKER_ANCHOR_SIZE_DP = 50.0f;

    private View mInviteMarker;
    private View mCloseMarker;
    private TextView mStatusText;
    private TextView mCountdownText;
    private LinearLayout mFloatingView;
    private View mWaitingView;
    private WindowManager.LayoutParams mWaitingLayoutParams;
    private WindowManager.LayoutParams mFloatingLayoutParams;
    private WindowManager mWindowManager;

    private int mCapturedMarkerWidth  = 0;
    private int mCapturedMarkerHeight = 0;
    private int mOverlayDisplayWidth = 0;
    private int mOverlayDisplayHeight = 0;

    private List<String> mTagsList = new ArrayList<>();
    private final List<View> mTapIndicatorViews = new ArrayList<>();
    private int mCurrentIndex = 0;
    private long mProfileLoadDelayMs = DEFAULT_PROFILE_LOAD_DELAY_MS;

    private boolean mIsCalibrationUnlocked = false;

    private View mDwellRow;
    private TextView mDwellValueText;
    private TextView mDwellFootText;
    private SeekBar mDwellSeek;

    // Set the instant Stop is pressed / the service is destroyed. Guards the
    // accessibility service's tap-sequence completion callback (onSequenceComplete,
    // fired from ClashManagerAccessibilityService's own independent Handler) from
    // re-entering openNextPlayerProfile()/scheduleAdvance() after the user stopped
    // Blitz - that callback fires on its own schedule regardless of whether this
    // service's Handler queue was cleared, since it lives in a different service.
    private volatile boolean mStopped = false;

    private final Handler mHandler = new Handler(Looper.getMainLooper());
    private final Runnable mCountdownRunnable = () -> {
        if (!isBlitzRunActive()) {
            return;
        }
        mCurrentIndex++;
        openNextPlayerProfile();
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
        // startForegroundService() obliges every start to reach startForeground()
        // within seconds, including starts that are then rejected below; a start
        // that stopped first used to be a crash waiting for a malformed queue.
        if (mWaitingView != null || mFloatingView != null) {
            promoteToForeground(queueText());
            Log.w(TAG, "start ignored: a run is already on screen");
            Toast.makeText(this, "Blitz is already running. Finish or cancel it first.", Toast.LENGTH_LONG).show();
            return START_NOT_STICKY;
        }
        promoteToForeground("Preparing Blitz Mode");
        String tagsExtra = intent != null ? intent.getStringExtra("tags") : null;
        List<String> playerQueue;
        try {
            playerQueue = parsePlayerQueue(tagsExtra);
        } catch (JSONException e) {
            Log.e(TAG, "could not parse the player queue", e);
            Toast.makeText(this, "Failed to parse player queue", Toast.LENGTH_SHORT).show();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (playerQueue == null) {
            Log.w(TAG, "start rejected: player queue is empty, malformed, or duplicated");
            Toast.makeText(this, "Player queue is invalid", Toast.LENGTH_SHORT).show();
            stopSelf();
            return START_NOT_STICKY;
        }

        mTagsList.clear();
        mTagsList.addAll(playerQueue);
        mCurrentIndex = 0;
        mStopped = false;
        mProfileLoadDelayMs = getSteppedDwell(intent.getLongExtra("delayMs", DEFAULT_PROFILE_LOAD_DELAY_MS));
        mRehearsal = isRehearsal(this, intent);
        mSendInvites = intent.getBooleanExtra(EXTRA_SEND_INVITES, true);
        Log.i(TAG, "start: " + mTagsList.size() + " player(s), dwell " + mProfileLoadDelayMs + "ms"
            + (mSendInvites ? "" : ", profiles only (no taps)")
            + (mRehearsal ? ", rehearsal (Clash Royale stays closed)" : ""));

        promoteToForeground(queueText());
        mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        launchClashRoyaleOnly();
        setupWaitingOverlay();
        // Not sticky: a run the system killed has lost its queue, so restarting
        // the service with a null intent could only show an empty panel.
        return START_NOT_STICKY;
    }

    private String queueText() {
        return "Opening " + mTagsList.size() + " player profiles automatically";
    }

    /**
     * Validates the bridge payload before it becomes an Android intent URI.
     *
     * The WebView normally supplies this JSON itself, but that is not a reason
     * to let a malformed value become a game deep link. Tags are normalized to
     * the player-id form expected by Clash Royale, and duplicates are rejected so
     * a bad payload cannot invite the same player repeatedly.
     *
     * The queue has no upper size. A leaderboard harvest queues every clanless
     * player it finds, and that number is set by the leaderboards, not by this
     * service. What keeps a long run reviewable is the setup panel, which shows
     * the player count and the run's estimated length before anything happens,
     * and the Stop pill, which ends the run at any point.
     *
     * @return a canonical, non-empty player queue, or {@code null} when the
     *     payload violates the native boundary
     */
    private static List<String> parsePlayerQueue(String tagsJson) throws JSONException {
        if (tagsJson == null) {
            return null;
        }
        JSONArray jsonArray = new JSONArray(tagsJson);
        if (!isSupportedQueueSize(jsonArray.length())) {
            return null;
        }

        List<String> rawTags = new ArrayList<>(jsonArray.length());
        for (int i = 0; i < jsonArray.length(); i++) {
            rawTags.add(jsonArray.getString(i));
        }
        return normalizePlayerQueue(rawTags);
    }

    /** Returns a canonical queue only when every bridge-supplied tag is safe. */
    private static List<String> normalizePlayerQueue(List<String> rawTags) {
        if (rawTags == null || !isSupportedQueueSize(rawTags.size())) {
            return null;
        }
        List<String> normalizedTags = new ArrayList<>(rawTags.size());
        Set<String> seenTags = new HashSet<>();
        for (String rawTag : rawTags) {
            String tag = normalizePlayerTag(rawTag);
            if (tag == null || !seenTags.add(tag)) {
                return null;
            }
            normalizedTags.add(tag);
        }
        return normalizedTags;
    }

    private static boolean isSupportedQueueSize(int queueSize) {
        return queueSize > 0;
    }

    /** Returns the canonical no-hash player id, or {@code null} for bad input. */
    private static String normalizePlayerTag(String rawTag) {
        if (rawTag == null) {
            return null;
        }
        String tag = rawTag.trim().toUpperCase(Locale.ROOT);
        if (tag.startsWith("#")) {
            tag = tag.substring(1);
        }
        if (tag.length() < MIN_PLAYER_TAG_LENGTH || tag.length() > MAX_PLAYER_TAG_LENGTH
            || !PLAYER_TAG_BODY_PATTERN.matcher(tag).matches()) {
            return null;
        }
        return tag;
    }

    private void promoteToForeground(String text) {
        startForeground(NOTIFICATION_ID,
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Clash Manager - Blitz Mode")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(PendingIntent.getActivity(this, 0,
                    new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE))
                .setOngoing(true)
                .build());
    }

    /** Saves the run so the PWA can report it once the user is back in the app. */
    private void recordRun(String outcome) {
        mRunOutcome = outcome;
        long endedAt = BlitzRun.RUNNING.equals(outcome) ? 0L : System.currentTimeMillis();
        new BlitzRun(mRunStartedAt, endedAt, mTagsList.size(), mRunOpened, mRunInvites, outcome, mRehearsal, mSendInvites)
            .save(this);
    }

    @Override
    public void onDestroy() {
        // Mark the run stopped before persisting or clearing local callbacks:
        // the accessibility service owns a separate Handler and can otherwise
        // report a late gesture while this service is tearing down.
        haltBlitzRun();
        super.onDestroy();
        if (BlitzRun.RUNNING.equals(mRunOutcome)) {
            Log.i(TAG, "stopped after " + mRunOpened + " of " + mTagsList.size() + " player(s)");
            recordRun(BlitzRun.STOPPED);
        }
        removeWaitingOverlay();
        if (mWindowManager != null && mFloatingView != null) {
            try {
                mWindowManager.removeView(mFloatingView);
            } catch (Exception e) {
                e.printStackTrace();
            }
            mFloatingView = null;
            mFloatingLayoutParams = null;
            mStatusText = null;
            mCountdownText = null;
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

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // The app can begin Blitz in landscape while Clash Royale then locks
        // itself to portrait. Reflow on the next main-loop turn, after Android
        // has published the new display metrics, so normalized tap targets stay
        // on-screen and aligned with the coordinates the accessibility service
        // will use.
        mHandler.post(this::reflowBlitzOverlays);
    }

    // -------------------------------------------------------------------------
    // Launch helpers
    // -------------------------------------------------------------------------

    private void launchClashRoyaleOnly() {
        if (mRehearsal) {
            Log.i(TAG, "rehearsal: not opening Clash Royale");
            return;
        }
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

    private static String formatBlitzSetupTitle(boolean calibrationUnlocked) {
        return calibrationUnlocked ? "Blitz setup" : "Ready for Blitz";
    }

    private static String formatBlitzSetupSubtitle(
        boolean calibrationUnlocked,
        boolean sendInvites,
        int playerCount,
        long dwellMs
    ) {
        if (calibrationUnlocked) {
            // A profiles-only run has no tap targets to drag.
            return sendInvites
                ? "Drag targets, set profile dwell, then start"
                : "Set profile dwell, then start";
        }
        return playerCount + " players \u00b7 " + formatDwell(dwellMs)
            + " each \u00b7 about " + formatBlitzRunEstimate(dwellMs, playerCount);
    }

    private static boolean shouldShowBlitzSetupDetails(boolean calibrationUnlocked) {
        return calibrationUnlocked;
    }

    private static String formatBlitzMarkerDescription(String label, boolean calibrationUnlocked) {
        return calibrationUnlocked
            ? label + " target. Drag or use the move actions to reposition."
            : label + " target. Locked. Use Edit Blitz setup to reposition.";
    }

    private void updateWaitingOverlayTexts(TextView titleView, TextView subtitleView) {
        titleView.setText(formatBlitzSetupTitle(mIsCalibrationUnlocked));
        // The count alone says nothing about what pressing Start costs. This is
        // the one figure worth having before committing to an automated run,
        // and it hints that the gear is worth a tap.
        subtitleView.setText(formatBlitzSetupSubtitle(
            mIsCalibrationUnlocked,
            mSendInvites,
            mTagsList.size(),
            mProfileLoadDelayMs));
    }

    private void updateMarkerDraggability() {
        float alpha = mIsCalibrationUnlocked ? 1.0f : LOCKED_MARKER_ALPHA;
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

        String label = labelView instanceof TextView
            ? ((TextView) labelView).getText().toString()
            : "Blitz";
        marker.setContentDescription(formatBlitzMarkerDescription(label, mIsCalibrationUnlocked));
        if (marker.isAttachedToWindow()) {
            marker.sendAccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED);
        }

        int oldVisibility = labelView.getVisibility();
        int newVisibility = shouldShowBlitzSetupDetails(mIsCalibrationUnlocked)
            ? View.VISIBLE
            : View.GONE;
        if (oldVisibility == newVisibility) {
            return;
        }

        WindowManager.LayoutParams lp = (WindowManager.LayoutParams) marker.getLayoutParams();

        // Calculate center using measured dimensions before visibility change
        int w = marker.getMeasuredWidth() > 0 ? marker.getMeasuredWidth() : mCapturedMarkerWidth;
        int h = marker.getMeasuredHeight() > 0 ? marker.getMeasuredHeight() : mCapturedMarkerHeight;
        float dp = getResources().getDisplayMetrics().density;
        int markerRadius = (int) (dp * MARKER_ANCHOR_SIZE_DP);
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
        int overlayType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;

        var saved = Calibration.load(this);
        float inviteXNorm = saved.inviteX();
        float inviteYNorm = saved.inviteY();
        float closeXNorm  = saved.closeX();
        float closeYNorm  = saved.closeY();

        DisplayMetrics dm = getResources().getDisplayMetrics();
        float dp = dm.density;
        mOverlayDisplayWidth = dm.widthPixels;
        mOverlayDisplayHeight = dm.heightPixels;

        // A profiles-only run sends no taps, so it shows no targets. Every
        // marker path below already treats a null marker as absent, and
        // saveCoordinates() leaves the stored calibration untouched.
        if (mSendInvites) {
            mInviteMarker = createDraggableMarker(
                VIEW_ID_BLITZ_INVITE_MARKER,
                "Invite",
                Color.parseColor(COLOR_PRIMARY),
                Math.round(calculateBlitzMarkerCenter(inviteXNorm, dm.widthPixels)),
                Math.round(calculateBlitzMarkerCenter(inviteYNorm, dm.heightPixels)));
            mCloseMarker = createDraggableMarker(
                VIEW_ID_BLITZ_CLOSE_MARKER,
                "Close",
                Color.parseColor(COLOR_ERROR),
                Math.round(calculateBlitzMarkerCenter(closeXNorm, dm.widthPixels)),
                Math.round(calculateBlitzMarkerCenter(closeYNorm, dm.heightPixels)));
            updateMarkerDraggability();
        }

        // -- Container --
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setGravity(android.view.Gravity.CENTER);
        int padH = (int) (PADDING_CONTAINER_H_DP * dp);
        int padV = (int) (PADDING_CONTAINER_V_DP * dp);
        container.setPadding(padH, padV, padH, padV);

        GradientDrawable containerBg = new GradientDrawable();
        containerBg.setCornerRadius(CONTAINER_CORNER_RADIUS_DP * dp);
        containerBg.setColor(applyColorAlpha(
            Color.parseColor(COLOR_SURFACE_CONTAINER_LOW),
            BG_OPACITY_CONTAINER));
        containerBg.setStroke((int) dp,
            applyColorAlpha(Color.parseColor(COLOR_PRIMARY), STROKE_OPACITY_CONTAINER));
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
        // The setup control is overlaid on this corner. Reserve its full touch
        // target so longer subtitles never sit underneath the icon.
        headerRow.setPadding(0, 0,
            (int) ((MODIFY_BUTTON_SIZE_DP + MODIFY_BUTTON_MARGIN_H_DP) * dp), 0);

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
        titleView.setTextColor(Color.parseColor(COLOR_ON_SURFACE));
        titleView.setTextSize(TEXT_SIZE_TITLE_SP);
        titleView.setTypeface(null, android.graphics.Typeface.BOLD);
        textContainer.addView(titleView);

        // Subtitle
        final TextView subtitleView = new TextView(this);
        subtitleView.setTextColor(Color.parseColor(COLOR_ON_SURFACE_VARIANT));
        subtitleView.setTextSize(TEXT_SIZE_SUBTITLE_SP);
        textContainer.addView(subtitleView);

        headerRow.addView(textContainer);
        container.addView(headerRow);

        updateWaitingOverlayTexts(titleView, subtitleView);

        // -- Profile dwell, revealed by the gear alongside the markers --
        mDwellRow = createDwellRow(dp);
        container.addView(mDwellRow);
        updateDwellRowVisibility();

        // -- Button row --
        LinearLayout btnRow = new LinearLayout(this);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);
        btnRow.setGravity(android.view.Gravity.CENTER);

        int btnPadH = (int) (PADDING_BUTTON_H_DP * dp);
        int btnPadV = (int) (PADDING_BUTTON_V_DP * dp);

        // Cancel button
        Button cancelBtn = new Button(this);
        cancelBtn.setId(VIEW_ID_BLITZ_CANCEL_BUTTON);
        cancelBtn.setText("Cancel");
        cancelBtn.setTextColor(Color.parseColor(COLOR_ERROR));
        cancelBtn.setBackgroundColor(Color.TRANSPARENT);
        cancelBtn.setTextSize(TEXT_SIZE_BUTTON_SP);
        cancelBtn.setPadding(btnPadH, btnPadV, btnPadH, btnPadV);
        cancelBtn.setMinHeight((int) (MIN_TOUCH_TARGET_DP * dp));
        cancelBtn.setContentDescription("Cancel Blitz");
        cancelBtn.setOnClickListener(v -> requestBlitzStop());
        btnRow.addView(cancelBtn);

        // Spacer
        View spacer1 = new View(this);
        spacer1.setLayoutParams(new LinearLayout.LayoutParams((int) (SPACER_WIDTH_DP * dp), 1));
        btnRow.addView(spacer1);

        // Start button
        Button startBtn = new Button(this);
        startBtn.setId(VIEW_ID_BLITZ_START_BUTTON);
        startBtn.setText("Start Blitz");
        startBtn.setTextColor(Color.parseColor(COLOR_ON_PRIMARY));
        startBtn.setTextSize(TEXT_SIZE_BUTTON_SP);
        startBtn.setTypeface(null, android.graphics.Typeface.BOLD);
        startBtn.setPadding(btnPadH, btnPadV, btnPadH, btnPadV);
        startBtn.setMinHeight((int) (MIN_TOUCH_TARGET_DP * dp));
        startBtn.setContentDescription("Start Blitz for " + mTagsList.size() + " players");
        GradientDrawable startBg = new GradientDrawable();
        startBg.setCornerRadius(BUTTON_CORNER_RADIUS_DP * dp);
        startBg.setColor(Color.parseColor(COLOR_PRIMARY));
        startBtn.setBackground(startBg);
        startBtn.setOnClickListener(v -> {
            saveCoordinates(true);
            if (mWindowManager != null && mWaitingView != null) {
                try {
                    mWindowManager.removeView(mWaitingView);
                } catch (Exception e) {
                    e.printStackTrace();
                }
                mWaitingView = null;
                mWaitingLayoutParams = null;
            }
            // Setup labels are editing affordances, not run status. Collapse
            // setup before the markers become read-only so they do not linger
            // over the game for the duration of the run.
            mIsCalibrationUnlocked = false;
            updateMarkerDraggability();
            updateDwellRowVisibility();
            transitionMarkersToRunningState();
            setupFloatingView();
            mRunStartedAt = System.currentTimeMillis();
            mRunOpened = 0;
            mRunInvites = 0;
            recordRun(BlitzRun.RUNNING);
            openNextPlayerProfile();
        });
        btnRow.addView(startBtn);

        container.addView(btnRow);

        // -- Gear (modify/lock) icon overlaid in the top-end corner of the container --
        final ImageButton modifyBtn = new ImageButton(this);
        modifyBtn.setId(VIEW_ID_BLITZ_EDIT_BUTTON);
        int gearResId = getResources().getIdentifier("ic_settings", "drawable", getPackageName());
        if (gearResId != 0) {
            modifyBtn.setImageResource(gearResId);
        } else {
            modifyBtn.setImageResource(android.R.drawable.ic_menu_manage);
        }
        modifyBtn.setBackground(null);
        int gearSize = (int) (MODIFY_BUTTON_SIZE_DP * dp);
        int gearPad  = (int) (MODIFY_BUTTON_PADDING_DP * dp);
        modifyBtn.setPadding(gearPad, gearPad, gearPad, gearPad);
        modifyBtn.setScaleType(ImageView.ScaleType.FIT_CENTER);
        modifyBtn.setColorFilter(Color.parseColor(COLOR_ON_SURFACE_VARIANT));
        modifyBtn.setContentDescription("Edit Blitz setup");

        modifyBtn.setOnClickListener(v -> {
            mIsCalibrationUnlocked = !mIsCalibrationUnlocked;
            if (mIsCalibrationUnlocked) {
                modifyBtn.setColorFilter(Color.parseColor(COLOR_PRIMARY));
                modifyBtn.setContentDescription("Finish editing Blitz setup");
            } else {
                modifyBtn.setColorFilter(Color.parseColor(COLOR_ON_SURFACE_VARIANT));
                modifyBtn.setContentDescription("Edit Blitz setup");
                saveCoordinates(true);
            }
            updateWaitingOverlayTexts(titleView, subtitleView);
            updateMarkerDraggability();
            updateDwellRowVisibility();
        });

        // Wrap container + gear in a FrameLayout so the gear floats over the top-end corner
        FrameLayout wrapper = new FrameLayout(this);
        wrapper.setId(VIEW_ID_BLITZ_SETUP_PANEL);
        wrapper.addView(container);
        wrapper.setElevation(OVERLAY_ELEVATION_DP * dp);
        FrameLayout.LayoutParams gearParams = new FrameLayout.LayoutParams(gearSize, gearSize);
        gearParams.gravity = android.view.Gravity.TOP | android.view.Gravity.END;
        gearParams.topMargin  = (int) (MODIFY_BUTTON_MARGIN_V_DP * dp);
        gearParams.rightMargin = (int) (MODIFY_BUTTON_MARGIN_H_DP * dp);
        wrapper.addView(modifyBtn, gearParams);

        // -- Window params --
        // FLAG_LAYOUT_IN_SCREEN | FLAG_LAYOUT_NO_LIMITS: same reasoning as the marker and
        // tap-ripple windows above. Without these, this BOTTOM-gravity popup is positioned
        // relative to whatever content area Clash Royale's immersive/system-bar state
        // currently exposes, which can shift once the game takes over the screen, pushing
        // the Start/Cancel calibration popup somewhere the user can't see or tap, so Blitz
        // silently never advances past the calibration step.
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            android.graphics.PixelFormat.TRANSLUCENT);
        positionBlitzSetupPanel(lp, dm);

        mWaitingView = wrapper;
        mWaitingLayoutParams = lp;
        try {
            if (mInviteMarker != null && mCloseMarker != null) {
                mWindowManager.addView(mInviteMarker, mInviteMarker.getLayoutParams());
                mWindowManager.addView(mCloseMarker, mCloseMarker.getLayoutParams());
            }
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
                mInviteMarker.setAlpha(RUNNING_MARKER_ALPHA);
                mInviteMarker.setImportantForAccessibility(
                    View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
                mWindowManager.updateViewLayout(mInviteMarker, lp);
            }
            if (mCloseMarker != null) {
                WindowManager.LayoutParams lp = (WindowManager.LayoutParams) mCloseMarker.getLayoutParams();
                lp.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
                mCloseMarker.setAlpha(RUNNING_MARKER_ALPHA);
                mCloseMarker.setImportantForAccessibility(
                    View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
                mWindowManager.updateViewLayout(mCloseMarker, lp);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private View createDraggableMarker(
        int viewId,
        String label,
        int color,
        final int centerX,
        final int centerY
    ) {
        final LinearLayout markerLayout = new LinearLayout(this);
        markerLayout.setId(viewId);
        markerLayout.setOrientation(LinearLayout.VERTICAL);
        markerLayout.setGravity(android.view.Gravity.CENTER);
        markerLayout.setFocusable(true);
        markerLayout.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        markerLayout.setContentDescription(formatBlitzMarkerDescription(label, mIsCalibrationUnlocked));

        DisplayMetrics dm = getResources().getDisplayMetrics();
        float dp = dm.density;
        final int markerSize = (int) (MARKER_ANCHOR_SIZE_DP * dp);
        final int ringSize = (int) (MARKER_RING_SIZE_DP * dp);

        // Label text
        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(Color.parseColor(COLOR_ON_SURFACE));
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
        labelBg.setColor(applyColorAlpha(
            Color.parseColor(COLOR_SURFACE_CONTAINER),
            BG_OPACITY_LABEL));
        int strokeW = (int) (MARKER_STROKE_WIDTH_DP * dp);
        labelBg.setStroke(strokeW, color);
        labelView.setBackground(labelBg);
        
        labelView.setVisibility(mIsCalibrationUnlocked ? View.VISIBLE : View.GONE);
        markerLayout.addView(labelView);

        // Crosshair frame
        FrameLayout crosshair = new FrameLayout(this);
        LinearLayout.LayoutParams crosshairLp = new LinearLayout.LayoutParams(markerSize, markerSize);
        crosshairLp.gravity = android.view.Gravity.CENTER_HORIZONTAL;
        crosshair.setLayoutParams(crosshairLp);

        // Outer pulsing ring - fixed to its own rest size (not MATCH_PARENT) and centered
        // within the larger `crosshair` anchor box, so scaling it up for the pulse animation
        // has room to bleed into instead of getting clipped by the window surface edge.
        // A soft radial fade (rather than a flat fill + hard stroke) also reads less
        // "placeholder UI" and more like a real glow.
        View outerRing = new View(this);
        FrameLayout.LayoutParams outerRingLp = new FrameLayout.LayoutParams(ringSize, ringSize);
        outerRingLp.gravity = android.view.Gravity.CENTER;
        outerRing.setLayoutParams(outerRingLp);
        GradientDrawable ringBg = new GradientDrawable();
        ringBg.setShape(GradientDrawable.OVAL);
        ringBg.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        ringBg.setGradientRadius(ringSize / 2.0f);
        ringBg.setColors(new int[]{
            Color.argb(MARKER_GLOW_STRONG_ALPHA, Color.red(color), Color.green(color), Color.blue(color)),
            Color.argb(MARKER_GLOW_SOFT_ALPHA, Color.red(color), Color.green(color), Color.blue(color)),
            Color.TRANSPARENT
        });
        outerRing.setBackground(ringBg);
        crosshair.addView(outerRing);

        // Inner circle - filled radial gradient (light center fading to the base hue) for a
        // "glossy bead" look instead of a flat stroke-only ring.
        int innerSize = (int) (MARKER_INNER_SIZE_DP * dp);
        int strokeHalf = (int) (MARKER_INNER_STROKE_WIDTH_DP * dp);
        View innerCircle = new View(this);
        FrameLayout.LayoutParams innerLp = new FrameLayout.LayoutParams(innerSize, innerSize);
        innerLp.gravity = android.view.Gravity.CENTER;
        innerCircle.setLayoutParams(innerLp);
        GradientDrawable innerBg = new GradientDrawable();
        innerBg.setShape(GradientDrawable.OVAL);
        innerBg.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        innerBg.setGradientRadius(innerSize * 0.75f);
        innerBg.setColors(new int[]{
            lighten(color, 0.55f),
            color
        });
        innerBg.setStroke(strokeHalf, Color.argb(
            MARKER_INNER_STROKE_ALPHA,
            Color.red(color),
            Color.green(color),
            Color.blue(color)));
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

        // Center dot with a small specular highlight for a glossy, less-flat finish
        int dotSize = (int) (MARKER_DOT_SIZE_DP * dp);
        View dot = new View(this);
        FrameLayout.LayoutParams dotLp = new FrameLayout.LayoutParams(dotSize, dotSize);
        dotLp.gravity = android.view.Gravity.CENTER;
        dot.setLayoutParams(dotLp);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setShape(GradientDrawable.OVAL);
        dotBg.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        dotBg.setGradientRadius(dotSize * 0.8f);
        dotBg.setColors(new int[]{lighten(color, 0.65f), color});
        dot.setBackground(dotBg);
        crosshair.addView(dot);

        markerLayout.addView(crosshair);

        // Pulsing animations on outer ring
        ObjectAnimator alphaAnim = ObjectAnimator.ofFloat(outerRing, "alpha", 1.0f, MARKER_PULSE_MIN_ALPHA);
        alphaAnim.setDuration(MARKER_PULSE_DURATION_MS);
        alphaAnim.setRepeatCount(ObjectAnimator.INFINITE);
        alphaAnim.setRepeatMode(ObjectAnimator.REVERSE);
        alphaAnim.setInterpolator(new DecelerateInterpolator());
        alphaAnim.start();

        ObjectAnimator scaleXAnim = ObjectAnimator.ofFloat(
            outerRing,
            "scaleX",
            MARKER_PULSE_MIN_SCALE,
            MARKER_PULSE_MAX_SCALE);
        scaleXAnim.setDuration(MARKER_PULSE_DURATION_MS);
        scaleXAnim.setRepeatCount(ObjectAnimator.INFINITE);
        scaleXAnim.setRepeatMode(ObjectAnimator.REVERSE);
        scaleXAnim.setInterpolator(new DecelerateInterpolator());
        scaleXAnim.start();

        ObjectAnimator scaleYAnim = ObjectAnimator.ofFloat(
            outerRing,
            "scaleY",
            MARKER_PULSE_MIN_SCALE,
            MARKER_PULSE_MAX_SCALE);
        scaleYAnim.setDuration(MARKER_PULSE_DURATION_MS);
        scaleYAnim.setRepeatCount(ObjectAnimator.INFINITE);
        scaleYAnim.setRepeatMode(ObjectAnimator.REVERSE);
        scaleYAnim.setInterpolator(new DecelerateInterpolator());
        scaleYAnim.start();

        // Window layout params
        // FLAG_LAYOUT_IN_SCREEN | FLAG_LAYOUT_NO_LIMITS: without these, a TOP|LEFT window
        // with explicit x/y is positioned relative to the content area *below* the status
        // bar (and inside other system-bar insets), not the true screen origin. The
        // accessibility service's dispatched taps always use true full-screen coordinates
        // (dm.widthPixels/heightPixels * percent), so without these flags the rendered
        // marker drifts down (and, depending on device insets, sideways) from the point
        // that actually gets tapped.
        int overlayType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        final WindowManager.LayoutParams markerLp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
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
                return switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN -> {
                        startX = markerLp.x;
                        startY = markerLp.y;
                        touchX = event.getRawX();
                        touchY = event.getRawY();
                        yield true;
                    }
                    case MotionEvent.ACTION_MOVE -> {
                        markerLp.x = startX + (int) (event.getRawX() - touchX);
                        markerLp.y = startY + (int) (event.getRawY() - touchY);
                        if (mWindowManager != null) {
                            mWindowManager.updateViewLayout(v, markerLp);
                        }
                        yield true;
                    }
                    case MotionEvent.ACTION_UP -> true;
                    default -> false;
                };
            }
        });

        installBlitzMovementActions(markerLayout, true);

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
        int size = (int) (TAP_INDICATOR_SIZE_DP * dp);
        // The ripple scales up to 2.0x its rest size, so the window it lives in must be at
        // least that big (plus a small margin for the stroke) or the OS surface hard-clips
        // the animation right where it should be fading out.
        int windowSize = (int) (size * TAP_INDICATOR_WINDOW_SCALE);
        int overlayType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;

        FrameLayout indicatorContainer = new FrameLayout(this);
        final View indicator = new View(this);
        FrameLayout.LayoutParams indicatorLp = new FrameLayout.LayoutParams(size, size);
        indicatorLp.gravity = android.view.Gravity.CENTER;
        indicator.setLayoutParams(indicatorLp);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        bg.setGradientRadius(size / 2.0f);
        bg.setColors(new int[]{
            Color.argb(TAP_INDICATOR_STRONG_ALPHA, Color.red(color), Color.green(color), Color.blue(color)),
            Color.argb(TAP_INDICATOR_SOFT_ALPHA, Color.red(color), Color.green(color), Color.blue(color)),
            Color.TRANSPARENT
        });
        bg.setStroke(
            (int) (dp * TAP_INDICATOR_STROKE_WIDTH_DP),
            Color.argb(
                TAP_INDICATOR_STROKE_ALPHA,
                Color.red(color),
                Color.green(color),
                Color.blue(color)));
        indicator.setBackground(bg);
        indicatorContainer.addView(indicator);

        // Same FLAG_LAYOUT_IN_SCREEN | FLAG_LAYOUT_NO_LIMITS reasoning as the marker window
        // in createDraggableMarker(); the ripple must line up with the true full-screen
        // coordinates the accessibility service just tapped, not the below-status-bar
        // content area a plain TOP|LEFT window would otherwise be positioned against.
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            windowSize, windowSize, overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            android.graphics.PixelFormat.TRANSLUCENT);
        lp.gravity = android.view.Gravity.TOP | android.view.Gravity.LEFT;
        float half = windowSize / 2.0f;
        lp.x = (int) (x - half);
        lp.y = (int) (y - half);

        try {
            mWindowManager.addView(indicatorContainer, lp);
            mTapIndicatorViews.add(indicatorContainer);
            indicator.setAlpha(1.0f);
            indicator.setScaleX(TAP_INDICATOR_INITIAL_SCALE);
            indicator.setScaleY(TAP_INDICATOR_INITIAL_SCALE);
            indicator.animate()
                .alpha(0.0f)
                .scaleX(TAP_INDICATOR_FINAL_SCALE)
                .scaleY(TAP_INDICATOR_FINAL_SCALE)
                .setDuration(TAP_INDICATOR_DURATION_MS)
                .setInterpolator(new DecelerateInterpolator())
                .withEndAction(() -> {
                    try {
                        if (mWindowManager != null) {
                            mWindowManager.removeView(indicatorContainer);
                        }
                        mTapIndicatorViews.remove(indicatorContainer);
                    } catch (Exception ignored) {
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
        deriveMarkerCalibration(dm.widthPixels, dm.heightPixels).save(this, commit);
    }

    /** Returns the marker centres as normalized full-screen coordinates. */
    private Calibration deriveMarkerCalibration(int screenW, int screenH) {
        if (mInviteMarker == null || mCloseMarker == null || screenW <= 0 || screenH <= 0) {
            return Calibration.load(this);
        }
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int markerRadius = (int) (dm.density * MARKER_ANCHOR_SIZE_DP);

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

        // Calibration owns the normalized-coordinate boundary for both this
        // overlay and MainActivity's JS bridge. Keeping the fallback there
        // prevents the two save paths from drifting into different tap points.
        return new Calibration(
            inviteCX / screenW,
            inviteCY / screenH,
            closeCX  / screenW,
            closeCY  / screenH
        );
    }

    /** Keeps every active overlay aligned when the host app or game rotates. */
    private void reflowBlitzOverlays() {
        if (mWindowManager == null) {
            return;
        }
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int newWidth = dm.widthPixels;
        int newHeight = dm.heightPixels;
        if (newWidth <= 0 || newHeight <= 0) {
            return;
        }

        int previousWidth = mOverlayDisplayWidth;
        int previousHeight = mOverlayDisplayHeight;
        boolean displayChanged = previousWidth > 0 && previousHeight > 0
            && (newWidth != previousWidth || newHeight != previousHeight);

        if (displayChanged && mInviteMarker != null && mCloseMarker != null) {
            Calibration current = deriveMarkerCalibration(previousWidth, previousHeight);
            positionBlitzMarker(
                mInviteMarker,
                calculateBlitzMarkerCenter(current.inviteX(), newWidth),
                calculateBlitzMarkerCenter(current.inviteY(), newHeight),
                dm.density);
            positionBlitzMarker(
                mCloseMarker,
                calculateBlitzMarkerCenter(current.closeX(), newWidth),
                calculateBlitzMarkerCenter(current.closeY(), newHeight),
                dm.density);
        }

        // Insets can change without a width/height change (immersive mode,
        // cutout visibility), so panel placement and pill clamping always run.
        if (mWaitingView != null && mWaitingLayoutParams != null) {
            positionBlitzSetupPanel(mWaitingLayoutParams, dm);
            try {
                mWindowManager.updateViewLayout(mWaitingView, mWaitingLayoutParams);
            } catch (Exception e) {
                Log.w(TAG, "could not reposition Blitz setup panel after rotation", e);
            }
        }
        if (mFloatingView != null && mFloatingLayoutParams != null) {
            reflowBlitzRunningPill(
                previousWidth,
                previousHeight,
                newWidth,
                newHeight,
                displayChanged);
        }
        mOverlayDisplayWidth = newWidth;
        mOverlayDisplayHeight = newHeight;
    }

    private static float calculateBlitzMarkerCenter(float normalizedCoordinate, int displaySize) {
        return normalizedCoordinate * displaySize;
    }

    private static int calculateBlitzSetupHorizontalOffset(
        boolean landscape,
        int startInset,
        int leftInset,
        int rightInset,
        int edgeMargin
    ) {
        return landscape ? Math.max(0, startInset) + edgeMargin : (leftInset - rightInset) / 2;
    }

    private static int calculateBlitzSetupBottomOffset(int bottomInset, int edgeMargin) {
        return Math.max(0, bottomInset) + edgeMargin;
    }

    private void positionBlitzSetupPanel(WindowManager.LayoutParams lp, DisplayMetrics dm) {
        boolean landscape = dm.widthPixels > dm.heightPixels;
        Insets insets = getBlitzOverlayInsets();
        boolean rightToLeft = getResources().getConfiguration().getLayoutDirection()
            == View.LAYOUT_DIRECTION_RTL;
        int startInset = rightToLeft ? insets.right : insets.left;
        int edgeMargin = Math.round(dm.density * BLITZ_SETUP_EDGE_MARGIN_DP);
        lp.gravity = android.view.Gravity.BOTTOM
            | (landscape
                ? android.view.Gravity.START
                : android.view.Gravity.CENTER_HORIZONTAL);
        lp.x = calculateBlitzSetupHorizontalOffset(
            landscape,
            startInset,
            insets.left,
            insets.right,
            edgeMargin);
        lp.y = calculateBlitzSetupBottomOffset(insets.bottom, edgeMargin);
    }

    private Insets getBlitzOverlayInsets() {
        if (mWindowManager == null) {
            return Insets.NONE;
        }
        try {
            WindowInsets windowInsets = mWindowManager.getCurrentWindowMetrics().getWindowInsets();
            return windowInsets.getInsetsIgnoringVisibility(
                WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        } catch (RuntimeException e) {
            Log.w(TAG, "could not read Blitz overlay insets", e);
            return Insets.NONE;
        }
    }

    private void installBlitzMovementActions(View overlayView, boolean requiresCalibration) {
        overlayView.setFocusable(true);
        overlayView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        overlayView.setAccessibilityDelegate(new View.AccessibilityDelegate() {
            @Override
            public void onInitializeAccessibilityNodeInfo(View host, AccessibilityNodeInfo info) {
                super.onInitializeAccessibilityNodeInfo(host, info);
                if (requiresCalibration && !mIsCalibrationUnlocked) {
                    return;
                }
                info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                    ACTION_ID_BLITZ_MOVE_LEFT, "Move left"));
                info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                    ACTION_ID_BLITZ_MOVE_RIGHT, "Move right"));
                info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                    ACTION_ID_BLITZ_MOVE_UP, "Move up"));
                info.addAction(new AccessibilityNodeInfo.AccessibilityAction(
                    ACTION_ID_BLITZ_MOVE_DOWN, "Move down"));
            }

            @Override
            public boolean performAccessibilityAction(View host, int action, Bundle arguments) {
                if (requiresCalibration && !mIsCalibrationUnlocked) {
                    return super.performAccessibilityAction(host, action, arguments);
                }
                int step = Math.round(getResources().getDisplayMetrics().density
                    * ACCESSIBILITY_MOVE_STEP_DP);
                return switch (action) {
                    case ACTION_ID_BLITZ_MOVE_LEFT -> moveBlitzOverlay(host, -step, 0);
                    case ACTION_ID_BLITZ_MOVE_RIGHT -> moveBlitzOverlay(host, step, 0);
                    case ACTION_ID_BLITZ_MOVE_UP -> moveBlitzOverlay(host, 0, -step);
                    case ACTION_ID_BLITZ_MOVE_DOWN -> moveBlitzOverlay(host, 0, step);
                    default -> super.performAccessibilityAction(host, action, arguments);
                };
            }
        });
    }

    private boolean moveBlitzOverlay(View overlayView, int deltaX, int deltaY) {
        if (mWindowManager == null
            || !(overlayView.getLayoutParams() instanceof WindowManager.LayoutParams)) {
            return false;
        }
        WindowManager.LayoutParams lp = (WindowManager.LayoutParams) overlayView.getLayoutParams();
        lp.x += deltaX;
        lp.y += deltaY;
        if (overlayView == mFloatingView) {
            constrainBlitzRunningPill(lp);
        }
        try {
            mWindowManager.updateViewLayout(overlayView, lp);
            overlayView.sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_SCROLLED);
            return true;
        } catch (RuntimeException e) {
            Log.w(TAG, "could not move Blitz overlay", e);
            return false;
        }
    }

    private static int clampBlitzOverlayOffset(int value, int minimum, int maximum) {
        if (maximum < minimum) {
            return minimum;
        }
        return Math.max(minimum, Math.min(maximum, value));
    }

    private static int calculateBlitzPillHorizontalOffset(
        int currentOffset,
        int previousWidth,
        int newWidth
    ) {
        if (previousWidth <= 0 || newWidth <= 0) {
            return currentOffset;
        }
        float normalizedCenter = (previousWidth / 2.0f + currentOffset) / previousWidth;
        return Math.round(normalizedCenter * newWidth - newWidth / 2.0f);
    }

    private static int calculateBlitzPillVerticalOffset(
        int currentTop,
        int pillHeight,
        int previousHeight,
        int newHeight
    ) {
        if (previousHeight <= 0 || newHeight <= 0) {
            return currentTop;
        }
        float normalizedCenter = (currentTop + pillHeight / 2.0f) / previousHeight;
        return Math.round(normalizedCenter * newHeight - pillHeight / 2.0f);
    }

    private void reflowBlitzRunningPill(
        int previousWidth,
        int previousHeight,
        int newWidth,
        int newHeight,
        boolean displayChanged
    ) {
        if (mFloatingView == null || mFloatingLayoutParams == null || mWindowManager == null) {
            return;
        }
        if (displayChanged) {
            int pillHeight = Math.max(0, mFloatingView.getMeasuredHeight());
            mFloatingLayoutParams.x = calculateBlitzPillHorizontalOffset(
                mFloatingLayoutParams.x,
                previousWidth,
                newWidth);
            mFloatingLayoutParams.y = calculateBlitzPillVerticalOffset(
                mFloatingLayoutParams.y,
                pillHeight,
                previousHeight,
                newHeight);
        }
        constrainBlitzRunningPill(mFloatingLayoutParams);
        try {
            mWindowManager.updateViewLayout(mFloatingView, mFloatingLayoutParams);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not reposition Blitz controls after rotation", e);
        }
    }

    private void constrainBlitzRunningPill(WindowManager.LayoutParams lp) {
        if (mWindowManager == null || mFloatingView == null) {
            return;
        }
        Rect bounds = mWindowManager.getCurrentWindowMetrics().getBounds();
        Insets insets = getBlitzOverlayInsets();
        int edgeMargin = Math.round(getResources().getDisplayMetrics().density
            * FLOATING_SAFE_EDGE_MARGIN_DP);
        int pillWidth = Math.max(0, mFloatingView.getMeasuredWidth());
        int pillHeight = Math.max(0, mFloatingView.getMeasuredHeight());

        if (pillWidth > 0) {
            int minimumCenterX = insets.left + edgeMargin + pillWidth / 2;
            int maximumCenterX = bounds.width() - insets.right - edgeMargin - pillWidth / 2;
            int currentCenterX = bounds.width() / 2 + lp.x;
            int safeCenterX = clampBlitzOverlayOffset(
                currentCenterX,
                minimumCenterX,
                maximumCenterX);
            lp.x = safeCenterX - bounds.width() / 2;
        }
        if (pillHeight > 0) {
            int minimumTop = insets.top + edgeMargin;
            int maximumTop = bounds.height() - insets.bottom - edgeMargin - pillHeight;
            lp.y = clampBlitzOverlayOffset(lp.y, minimumTop, maximumTop);
        }
    }

    private void positionBlitzMarker(View marker, float centerX, float centerY, float density) {
        WindowManager.LayoutParams lp = (WindowManager.LayoutParams) marker.getLayoutParams();
        int markerRadius = (int) (density * MARKER_ANCHOR_SIZE_DP);
        int width = marker.getMeasuredWidth() > 0 ? marker.getMeasuredWidth() : mCapturedMarkerWidth;
        int height = marker.getMeasuredHeight() > 0 ? marker.getMeasuredHeight() : mCapturedMarkerHeight;
        if (width <= 0) width = markerRadius;
        if (height <= 0) height = markerRadius;

        lp.x = Math.round(centerX - (width / 2.0f));
        lp.y = Math.round(centerY - (height - markerRadius / 2.0f));
        try {
            mWindowManager.updateViewLayout(marker, lp);
        } catch (Exception e) {
            Log.w(TAG, "could not reposition Blitz marker after rotation", e);
        }
    }

    /** Blends a color toward white by the given fraction (0..1), for gradient highlights. */
    private static int lighten(int color, float fraction) {
        int r = (int) (Color.red(color)   + (255 - Color.red(color))   * fraction);
        int g = (int) (Color.green(color) + (255 - Color.green(color)) * fraction);
        int b = (int) (Color.blue(color)  + (255 - Color.blue(color))  * fraction);
        return Color.rgb(r, g, b);
    }

    /** Applies a shared overlay opacity without duplicating a theme color's RGB channels. */
    private static int applyColorAlpha(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
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
        mWaitingLayoutParams = null;
        mOverlayDisplayWidth = 0;
        mOverlayDisplayHeight = 0;
    }

    // -------------------------------------------------------------------------
    // Blitz run-mode (floating pill + player cycling)
    // -------------------------------------------------------------------------

    private void openNextPlayerProfile() {
        if (!isBlitzRunActive()) {
            return;
        }
        mHandler.removeCallbacks(mCountdownRunnable);
        if (mCurrentIndex >= mTagsList.size()) {
            Log.i(TAG, "complete: queue already finished");
            recordRun(BlitzRun.COMPLETED);
            Toast.makeText(this, "Blitz complete", Toast.LENGTH_SHORT).show();
            stopSelf();
            return;
        }

        String tag = mTagsList.get(mCurrentIndex);
        if (tag.startsWith("#")) {
            tag = tag.substring(1);
        }
        Log.i(TAG, "player " + (mCurrentIndex + 1) + "/" + mTagsList.size() + ": #" + tag
            + (mRehearsal ? " (rehearsal: profile not opened)" : ""));
        if (!mRehearsal) {
            try {
                var profile = Intent.parseUri(
                    "intent://playerInfo?id=" + tag
                        + "#Intent;scheme=clashroyale;package=com.supercell.clashroyale;end", Intent.URI_INTENT_SCHEME);
                profile.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(profile);
            } catch (Exception e) {
                // Without the profile on screen the taps would land on whatever is
                // showing instead, so the run ends here rather than tapping blind.
                Log.e(TAG, "could not open the profile of #" + tag + "; run stopped", e);
                recordRun(BlitzRun.FAILED);
                Toast.makeText(this, "Could not open Clash Royale - Blitz stopped", Toast.LENGTH_LONG).show();
                stopSelf();
                return;
            }
        }
        mRunOpened++;
        recordRun(BlitzRun.RUNNING);

        updateOverlayUi();

        if (!mSendInvites) {
            // Profiles only: each profile stays up for the dwell, then the next
            // deep link replaces it. No gesture is dispatched.
            scheduleAdvance(mProfileLoadDelayMs);
        } else if (ClashManagerAccessibilityService.isActive()) {
            var dm = getResources().getDisplayMetrics();
            // Wait for Clash Royale's profile screen to render, then run the invite/close
            // taps chained off each gesture's own completion (see
            // ClashManagerAccessibilityService#runInviteCloseSequence) instead of two
            // independently fixed-delay dispatches - the old GESTURE_CLOSE_DELAY_MS /
            // GESTURE_TOTAL_DELAY_MS schedule left no margin against Handler jitter and
            // could have the close tap's dispatchGesture() cancel an invite tap still in
            // flight.
            mHandler.postDelayed(() -> ClashManagerAccessibilityService.runInviteCloseSequence(
                new ClashManagerAccessibilityService.TapSequenceCallback() {
                    @Override
                    public boolean isSequenceActive() {
                        return isBlitzRunActive();
                    }

                    @Override
                    public void onInviteTapped(float xPercent, float yPercent) {
                        if (!isBlitzRunActive()) {
                            return;
                        }
                        mRunInvites++;
                        recordRun(BlitzRun.RUNNING);
                        Log.i(TAG, "invite tap at " + xPercent + ", " + yPercent);
                        showTapIndicator(
                            xPercent * dm.widthPixels,
                            yPercent * dm.heightPixels,
                            Color.parseColor(COLOR_PRIMARY));
                    }

                    @Override
                    public void onCloseTapped(float xPercent, float yPercent) {
                        if (!isBlitzRunActive()) {
                            return;
                        }
                        Log.i(TAG, "close tap at " + xPercent + ", " + yPercent);
                        showTapIndicator(
                            xPercent * dm.widthPixels,
                            yPercent * dm.heightPixels,
                            Color.parseColor(COLOR_ERROR));
                    }

                    @Override
                    public void onSequenceComplete() {
                        // The tap sequence runs on ClashManagerAccessibilityService's own
                        // Handler, independent of this service's. Do not let a late
                        // callback advance a stopped or superseded run.
                        if (!isBlitzRunActive()) {
                            return;
                        }
                        scheduleAdvance(0L);
                    }

                    @Override
                    public void onSequenceFailed() {
                        if (!isBlitzRunActive()) {
                            return;
                        }
                        // A rejected or interrupted gesture leaves the game in an
                        // unknown state. Stopping is safer than opening another
                        // profile and tapping blind.
                        Log.w(TAG, "tap sequence did not complete; Blitz stopped");
                        haltBlitzRun();
                        recordRun(BlitzRun.STOPPED);
                        Toast.makeText(BlitzService.this, "Blitz tap was blocked - Blitz stopped", Toast.LENGTH_LONG).show();
                        stopSelf();
                    }
                }), mProfileLoadDelayMs);
        } else {
            Log.w(TAG, "accessibility service is not connected: no taps sent");
            scheduleAdvance(mProfileLoadDelayMs);
        }
    }

    /**
     * Latches the stop state synchronously, before Android later destroys the
     * service. Gesture callbacks run from the accessibility service's separate
     * Handler, so waiting for onDestroy() would leave a window for one final
     * close tap or queue advance after the user pressed Stop.
     */
    private void haltBlitzRun() {
        mStopped = true;
        mHandler.removeCallbacksAndMessages(null);
    }

    /** Stops the service only after its tap/advance callbacks have been made inert. */
    private void requestBlitzStop() {
        haltBlitzRun();
        stopSelf();
    }

    /**
     * Pure form of the callback gate, kept separate so the stop race stays
     * regression-testable without an Android Service instance.
     */
    static boolean isBlitzRunStateActive(boolean stopped, String runOutcome) {
        return !stopped && BlitzRun.RUNNING.equals(runOutcome);
    }

    /** True only while this service still owns the currently running Blitz. */
    private boolean isBlitzRunActive() {
        return isBlitzRunStateActive(mStopped, mRunOutcome);
    }

    /** Advances to the next queued profile (or finishes the queue) after `delay`. */
    private void scheduleAdvance(long delay) {
        if (!isBlitzRunActive()) {
            return;
        }
        int remaining = mTagsList.size() - 1;
        if (mCurrentIndex < remaining) {
            mHandler.postDelayed(mCountdownRunnable, delay);
        } else {
            mHandler.postDelayed(() -> {
                if (!isBlitzRunActive()) {
                    return;
                }
                Log.i(TAG, "complete: " + mTagsList.size() + " player(s)");
                recordRun(BlitzRun.COMPLETED);
                Toast.makeText(this, "Blitz complete", Toast.LENGTH_SHORT).show();
                stopSelf();
            }, delay);
        }
    }

    private static String formatBlitzRunStatus(int displayed, int total) {
        return "Blitz \u00b7 " + displayed + " of " + total;
    }

    private static String formatBlitzRunPhase(int displayed, int total) {
        return displayed < total ? "Running" : "Finishing";
    }

    private static String formatBlitzPillDescription(int displayed, int total) {
        return "Blitz is running. Player " + displayed + " of " + total
            + ". Drag or use the move actions to reposition.";
    }

    private void updateOverlayUi() {
        if (mStatusText == null) {
            return;
        }
        int displayed = mCurrentIndex + 1;
        int total = mTagsList.size();
        mStatusText.setText(formatBlitzRunStatus(displayed, total));
        mStatusText.setContentDescription("Blitz player " + displayed + " of " + total);
        if (mCountdownText != null) {
            mCountdownText.setText(formatBlitzRunPhase(displayed, total));
        }
        if (mFloatingView != null) {
            mFloatingView.setContentDescription(formatBlitzPillDescription(displayed, total));
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
        pill.setId(VIEW_ID_BLITZ_RUNNING_PILL);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(android.view.Gravity.CENTER_VERTICAL);
        pill.setPadding(
            (int) (PADDING_FLOATING_H_DP * dp),
            (int) (PADDING_FLOATING_V_DP * dp),
            (int) (PADDING_FLOATING_H_DP * dp),
            (int) (PADDING_FLOATING_V_DP * dp)
        );
        pill.setMinimumHeight((int) (FLOATING_PILL_MIN_HEIGHT_DP * dp));
        pill.setElevation(OVERLAY_ELEVATION_DP * dp);

        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setCornerRadius(FLOATING_CORNER_RADIUS_DP * dp);
        pillBg.setColor(applyColorAlpha(
            Color.parseColor(COLOR_SURFACE_CONTAINER_LOW),
            BG_OPACITY_CONTAINER));
        pillBg.setStroke((int) dp,
            applyColorAlpha(Color.parseColor(COLOR_PRIMARY), STROKE_OPACITY_CONTAINER));
        pill.setBackground(pillBg);

        // Status "X / Y"
        TextView statusTv = new TextView(this);
        mStatusText = statusTv;
        statusTv.setTextColor(Color.parseColor(COLOR_ON_SURFACE));
        statusTv.setTextSize(TEXT_SIZE_FLOATING_STATUS_SP);
        statusTv.setTypeface(null, android.graphics.Typeface.BOLD);
        statusTv.setPadding(0, 0, (int) (PADDING_FLOATING_STATUS_R_DP * dp), 0);
        statusTv.setText(formatBlitzRunStatus(1, mTagsList.size()));
        statusTv.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        pill.addView(statusTv);

        // Countdown label
        TextView countdownTv = new TextView(this);
        mCountdownText = countdownTv;
        countdownTv.setTextColor(Color.parseColor(COLOR_PRIMARY));
        countdownTv.setTextSize(TEXT_SIZE_FLOATING_COUNTDOWN_SP);
        countdownTv.setPadding(0, 0, (int) (PADDING_FLOATING_COUNTDOWN_R_DP * dp), 0);
        countdownTv.setText("Running");
        countdownTv.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        pill.addView(countdownTv);

        // Stop / close button
        Button closeBtn = new Button(this);
        closeBtn.setId(VIEW_ID_BLITZ_STOP_BUTTON);
        closeBtn.setText("Stop");
        closeBtn.setTextColor(Color.parseColor(COLOR_ON_ERROR));
        closeBtn.setTypeface(null, android.graphics.Typeface.BOLD);
        closeBtn.setTextSize(TEXT_SIZE_FLOATING_CLOSE_SP);
        closeBtn.setPadding(
            (int) (PADDING_FLOATING_CLOSE_H_DP * dp),
            (int) (PADDING_FLOATING_CLOSE_V_DP * dp),
            (int) (PADDING_FLOATING_CLOSE_H_DP * dp),
            (int) (PADDING_FLOATING_CLOSE_V_DP * dp)
        );
        closeBtn.setMinHeight((int) (MIN_TOUCH_TARGET_DP * dp));
        closeBtn.setContentDescription("Stop Blitz");
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setCornerRadius(BUTTON_CORNER_RADIUS_DP * dp);
        closeBg.setColor(Color.parseColor(COLOR_ERROR));
        closeBtn.setBackground(closeBg);
        closeBtn.setOnClickListener(v -> requestBlitzStop());
        pill.addView(closeBtn);

        // Draggable pill
        // Same FLAG_LAYOUT_IN_SCREEN | FLAG_LAYOUT_NO_LIMITS reasoning as setupWaitingOverlay()
        // and createDraggableMarker(); this pill (with its "Stop" button) is visible while
        // Blitz is actively running over Clash Royale, so it must stay positioned relative to
        // the true screen, not whatever content area the game's immersive mode exposes.
        final WindowManager.LayoutParams pillLp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            android.graphics.PixelFormat.TRANSLUCENT);
        pillLp.gravity = android.view.Gravity.TOP | android.view.Gravity.CENTER_HORIZONTAL;
        pillLp.x = 0;
        pillLp.y = getBlitzOverlayInsets().top + (int) (FLOATING_INITIAL_Y_DP * dp);
        mFloatingLayoutParams = pillLp;

        pill.setOnTouchListener(new View.OnTouchListener() {
            private float initTouchX;
            private float initTouchY;
            private int   initX;
            private int   initY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                return switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN -> {
                        initX = pillLp.x;
                        initY = pillLp.y;
                        initTouchX = event.getRawX();
                        initTouchY = event.getRawY();
                        yield true;
                    }
                    case MotionEvent.ACTION_MOVE -> {
                        pillLp.x = initX + (int) (event.getRawX() - initTouchX);
                        pillLp.y = initY + (int) (event.getRawY() - initTouchY);
                        constrainBlitzRunningPill(pillLp);
                        if (mWindowManager != null && mFloatingView != null) {
                            mWindowManager.updateViewLayout(mFloatingView, pillLp);
                        }
                        yield true;
                    }
                    case MotionEvent.ACTION_UP -> true;
                    default -> false;
                };
            }
        });

        installBlitzMovementActions(pill, false);
        pill.setContentDescription(formatBlitzPillDescription(1, mTagsList.size()));
        pill.getViewTreeObserver().addOnGlobalLayoutListener(
            new ViewTreeObserver.OnGlobalLayoutListener() {
                @Override
                public void onGlobalLayout() {
                    pill.getViewTreeObserver().removeOnGlobalLayoutListener(this);
                    constrainBlitzRunningPill(pillLp);
                    if (mWindowManager != null && mFloatingView != null) {
                        mWindowManager.updateViewLayout(mFloatingView, pillLp);
                    }
                }
            });

        try {
            mWindowManager.addView(mFloatingView, pillLp);
        } catch (Exception e) {
            e.printStackTrace();
            mFloatingView  = null;
            mFloatingLayoutParams = null;
            mStatusText    = null;
            mCountdownText = null;
        }
    }

    // -------------------------------------------------------------------------
    // Notification channel
    // -------------------------------------------------------------------------

    /**
     * Builds the dwell row revealed by the gear.
     *
     * Sits between the header and the buttons, and is GONE unless calibration is
     * unlocked, so the overlay keeps the two-line footprint it has today on the
     * common path. The gear already means "adjust things"; it now reveals the
     * speed as well as the markers, which is the whole of the addition.
     */
    private View createDwellRow(final float dp) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        rowParams.bottomMargin = (int) (MARGIN_DWELL_B_DP * dp);
        row.setLayoutParams(rowParams);
        row.setPadding(0, (int) (PADDING_DWELL_TOP_DP * dp), 0, 0);

        // -- Head: label on the left, value hard against the right --
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(android.view.Gravity.CENTER_VERTICAL);

        TextView label = new TextView(this);
        label.setText("Profile dwell");
        label.setTextSize(TEXT_SIZE_SUBTITLE_SP);
        label.setTextColor(Color.parseColor(COLOR_ON_SURFACE_VARIANT));
        label.setLayoutParams(new LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));
        head.addView(label);

        // Monospace at a fixed four characters: 850 and 6000 occupy the same width,
        // so dragging never nudges the label beside it.
        TextView value = new TextView(this);
        mDwellValueText = value;
        value.setTextSize(TEXT_SIZE_DWELL_VALUE_SP);
        value.setTextColor(Color.parseColor(COLOR_ON_SURFACE));
        value.setTypeface(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD);
        value.setMinEms(4);
        value.setGravity(android.view.Gravity.END);
        head.addView(value);

        TextView unit = new TextView(this);
        unit.setText("MS");
        unit.setTextSize(TEXT_SIZE_DWELL_FOOT_SP);
        unit.setTextColor(Color.parseColor(COLOR_ON_SURFACE_VARIANT));
        unit.setPadding((int) (PADDING_DWELL_UNIT_START_DP * dp), 0, 0, 0);
        head.addView(unit);

        row.addView(head);

        // -- Track --
        List<Float> interiorTicks = new ArrayList<>();
        for (long detent : DWELL_DETENTS_MS) {
            if (detent <= DWELL_MIN_MS || detent >= DWELL_MAX_MS) {
                continue;
            }
            interiorTicks.add((float) getRatioForDwell(detent));
        }
        float[] tickRatios = new float[interiorTicks.size()];
        for (int i = 0; i < interiorTicks.size(); i++) {
            tickRatios[i] = interiorTicks.get(i);
        }

        final SeekBar seek = new SeekBar(this);
        mDwellSeek = seek;
        seek.setId(VIEW_ID_BLITZ_DWELL_SLIDER);
        seek.setMax(DWELL_SEEK_RESOLUTION);
        seek.setProgressDrawable(new DwellTrackDrawable(tickRatios, dp));

        GradientDrawable thumb = new GradientDrawable();
        thumb.setShape(GradientDrawable.OVAL);
        thumb.setColor(Color.parseColor(COLOR_PRIMARY));
        int thumbPx = (int) (DWELL_THUMB_SIZE_DP * dp);
        thumb.setSize(thumbPx, thumbPx);
        seek.setThumb(thumb);
        seek.setThumbOffset(0);
        // Without this the platform punches a gap in the track under the thumb,
        // which reads as a break in the scale rather than a handle on it.
        seek.setSplitTrack(false);
        // Half a thumb at each end, so the handle centre travels the width the
        // ratio maths assumes and never overhangs the track.
        int dwellTrackVerticalPadding = (int) (PADDING_DWELL_TRACK_V_DP * dp);
        seek.setPadding(thumbPx / 2, dwellTrackVerticalPadding, thumbPx / 2, dwellTrackVerticalPadding);

        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                if (!fromUser) {
                    return;
                }
                float travelPx = bar.getWidth() - bar.getPaddingLeft() - bar.getPaddingRight();
                if (travelPx <= 0.0f) {
                    return;
                }
                double ratio = progress / (double) DWELL_SEEK_RESOLUTION;
                long snapped = getSnappedDwell(ratio, travelPx, DWELL_SNAP_RADIUS_DP * dp);

                // The field the sequencer reads on every advance. Writing it here is
                // the whole override: nothing is persisted, so the next Blitz starts
                // from the saved default again.
                mProfileLoadDelayMs = snapped;
                updateDwellTexts();

                int settled = (int) Math.round(getRatioForDwell(snapped) * DWELL_SEEK_RESOLUTION);
                if (settled != progress) {
                    bar.setProgress(settled);
                }
            }

            @Override
            public void onStartTrackingTouch(SeekBar bar) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar bar) {
            }
        });
        seek.setProgress((int) Math.round(getRatioForDwell(mProfileLoadDelayMs) * DWELL_SEEK_RESOLUTION));
        row.addView(seek);

        // -- Foot: the bounds, and what this run will cost --
        LinearLayout foot = new LinearLayout(this);
        foot.setOrientation(LinearLayout.HORIZONTAL);
        foot.setGravity(android.view.Gravity.CENTER_VERTICAL);

        TextView minText = new TextView(this);
        minText.setText(String.valueOf(DWELL_MIN_MS));
        minText.setTextSize(TEXT_SIZE_DWELL_FOOT_SP);
        minText.setTextColor(Color.parseColor(COLOR_ON_SURFACE_VARIANT));
        minText.setTypeface(android.graphics.Typeface.MONOSPACE);
        foot.addView(minText);

        TextView note = new TextView(this);
        mDwellFootText = note;
        note.setTextSize(TEXT_SIZE_DWELL_FOOT_SP);
        note.setTextColor(Color.parseColor(COLOR_ON_SURFACE_VARIANT));
        note.setGravity(android.view.Gravity.CENTER);
        note.setLayoutParams(new LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));
        foot.addView(note);

        TextView maxText = new TextView(this);
        maxText.setText(String.valueOf(DWELL_MAX_MS));
        maxText.setTextSize(TEXT_SIZE_DWELL_FOOT_SP);
        maxText.setTextColor(Color.parseColor(COLOR_ON_SURFACE_VARIANT));
        maxText.setTypeface(android.graphics.Typeface.MONOSPACE);
        foot.addView(maxText);

        row.addView(foot);

        updateDwellTexts();
        return row;
    }

    private void updateDwellRowVisibility() {
        if (mDwellRow != null) {
            mDwellRow.setVisibility(shouldShowBlitzSetupDetails(mIsCalibrationUnlocked)
                ? View.VISIBLE
                : View.GONE);
        }
    }

    // -------------------------------------------------------------------------
    // Profile dwell: mapping, formatting and the drawn track
    // -------------------------------------------------------------------------

    /**
     * Maps a dwell time onto its 0..1 position along the track.
     *
     * Logarithmic, because tolerance for latency is felt multiplicatively: 850ms
     * to 1700ms is the same subjective step as 3000ms to 6000ms. A linear track
     * would compress everything below 2100ms into its first quarter, which is
     * exactly where the fine control is wanted.
     */
    private static double getRatioForDwell(long dwellMs) {
        double lower = Math.log((double) DWELL_MIN_MS);
        double upper = Math.log((double) DWELL_MAX_MS);
        double clamped = Math.max((double) DWELL_MIN_MS, Math.min((double) DWELL_MAX_MS, (double) dwellMs));
        return (Math.log(clamped) - lower) / (upper - lower);
    }

    /** Maps a 0..1 track position back onto a dwell time. */
    private static long getDwellForRatio(double ratio) {
        double lower = Math.log((double) DWELL_MIN_MS);
        double upper = Math.log((double) DWELL_MAX_MS);
        return Math.round(Math.exp(lower + ratio * (upper - lower)));
    }

    /** Rounds onto the step grid, anchored to the minimum rather than to zero. */
    private static long getSteppedDwell(long dwellMs) {
        // Check the bounds before subtracting the minimum. A bridge value such
        // as Long.MIN_VALUE would otherwise overflow the subtraction and could
        // wrap into a valid-looking, unsafe delay.
        if (dwellMs <= DWELL_MIN_MS) {
            return DWELL_MIN_MS;
        }
        if (dwellMs >= DWELL_MAX_MS) {
            return DWELL_MAX_MS;
        }
        long stepped = DWELL_MIN_MS
            + Math.round((dwellMs - DWELL_MIN_MS) / (double) DWELL_STEP_MS) * DWELL_STEP_MS;
        return Math.max(DWELL_MIN_MS, Math.min(DWELL_MAX_MS, stepped));
    }

    /**
     * Resolves a drag position to a dwell time, pulling onto a detent when one is
     * within the snap radius. Proximity is measured in rendered pixels, so the
     * pull feels the same at both ends of a logarithmic track. Every value the
     * step allows stays reachable; the detents only assist aim.
     */
    private static long getSnappedDwell(double ratio, float travelPx, float snapRadiusPx) {
        long closest = -1L;
        double closestPx = Double.MAX_VALUE;
        for (long detent : DWELL_DETENTS_MS) {
            double distance = Math.abs(getRatioForDwell(detent) - ratio) * travelPx;
            if (distance < closestPx) {
                closestPx = distance;
                closest = detent;
            }
        }
        if (closest >= 0L && closestPx <= snapRadiusPx) {
            return closest;
        }
        return getSteppedDwell(getDwellForRatio(ratio));
    }

    /**
     * Shortest label that still reads precisely. Mirrors formatCompactDuration in
     * Frontend-PWA/src/core/utils/time.ts so both estimates are worded alike.
     */
    private static String formatCompactDuration(long ms) {
        long totalSeconds = Math.round(ms / 1000.0);
        long minutes = totalSeconds / 60L;
        long seconds = totalSeconds % 60L;
        if (minutes > 0L) {
            return seconds > 0L ? minutes + "m " + seconds + "s" : minutes + "m";
        }
        return seconds + "s";
    }

    /** Per-player dwell, as a reader would say it. */
    private static String formatDwell(long ms) {
        if (ms < 1000L) {
            return ms + "ms";
        }
        long tenths = Math.round(ms / 100.0);
        long whole = tenths / 10L;
        long fraction = tenths % 10L;
        return fraction == 0L ? whole + "s" : whole + "." + fraction + "s";
    }

    /** How long the whole selection will take at the supplied dwell. */
    private static String formatBlitzRunEstimate(long dwellMs, int playerCount) {
        long perPlayer = dwellMs + DWELL_ESTIMATE_OVERHEAD_MS;
        return formatCompactDuration(perPlayer * (long) playerCount);
    }

    private void updateDwellTexts() {
        if (mDwellValueText != null) {
            mDwellValueText.setText(String.valueOf(mProfileLoadDelayMs));
        }
        if (mDwellFootText != null) {
            mDwellFootText.setText("this run only \u00b7 about " + formatBlitzRunEstimate(
                mProfileLoadDelayMs,
                mTagsList.size()));
        }
        if (mDwellSeek != null) {
            mDwellSeek.setContentDescription(
                "Profile dwell, " + mProfileLoadDelayMs + " milliseconds per player");
        }
    }

    /**
     * The dwell track, painted rather than assembled.
     *
     * A stock SeekBar draws its progress from a LayerDrawable and has no notion of
     * tick marks at arbitrary positions. The detents here sit at logarithmic
     * intervals, so no repeating or evenly divided drawable can place them. This
     * paints the track, the fill and the ticks in one pass, taking the fill extent
     * from the level ProgressBar sets on it.
     */
    private static final class DwellTrackDrawable extends Drawable {
        private final Paint mTrackPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint mFillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint mTickPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final float[] mTickRatios;
        private final float mTrackHeightPx;
        private final float mRadiusPx;
        private final float mTickHalfWidthPx;

        DwellTrackDrawable(float[] tickRatios, float density) {
            mTickRatios = tickRatios;
            mTrackHeightPx = DWELL_TRACK_HEIGHT_DP * density;
            mRadiusPx = mTrackHeightPx / 2.0f;
            mTickHalfWidthPx = Math.max(1.0f, DWELL_TICK_WIDTH_DP * density) / 2.0f;
            mTrackPaint.setColor(Color.parseColor(COLOR_OUTLINE_VARIANT));
            mFillPaint.setColor(Color.parseColor(COLOR_PRIMARY));
            // The ticks are cut in the container's own colour, so they read as
            // notches through the fill rather than as marks tinted over it.
            mTickPaint.setColor(Color.parseColor(COLOR_SURFACE_CONTAINER_LOW));
        }

        @Override
        public void draw(Canvas canvas) {
            Rect bounds = getBounds();
            float centreY = bounds.exactCenterY();
            float top = centreY - mTrackHeightPx / 2.0f;
            float bottom = centreY + mTrackHeightPx / 2.0f;

            canvas.drawRoundRect(bounds.left, top, bounds.right, bottom, mRadiusPx, mRadiusPx, mTrackPaint);

            float ratio = getLevel() / 10000.0f;
            float fillRight = bounds.left + ratio * bounds.width();
            if (fillRight > bounds.left) {
                canvas.drawRoundRect(bounds.left, top, fillRight, bottom, mRadiusPx, mRadiusPx, mFillPaint);
            }

            for (float tickRatio : mTickRatios) {
                float x = bounds.left + tickRatio * bounds.width();
                canvas.drawRect(x - mTickHalfWidthPx, top, x + mTickHalfWidthPx, bottom, mTickPaint);
            }
        }

        @Override
        protected boolean onLevelChange(int level) {
            invalidateSelf();
            return true;
        }

        @Override
        public int getIntrinsicHeight() {
            return (int) Math.ceil(mTrackHeightPx);
        }

        @Override
        public void setAlpha(int alpha) {
            mTrackPaint.setAlpha(alpha);
            mFillPaint.setAlpha(alpha);
            mTickPaint.setAlpha(alpha);
        }

        @Override
        public void setColorFilter(ColorFilter colorFilter) {
            mTrackPaint.setColorFilter(colorFilter);
            mFillPaint.setColorFilter(colorFilter);
            mTickPaint.setColorFilter(colorFilter);
        }

        @Override
        @SuppressWarnings("deprecation") // Drawable still declares this abstract API through Android 16.
        public int getOpacity() {
            return PixelFormat.TRANSLUCENT;
        }
    }

    private void createNotificationChannel() {
        var channel = new NotificationChannel(CHANNEL_ID, "Blitz Mode Service", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Manages automated Blitz Mode player recruitment");
        var nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.createNotificationChannel(channel);
        }
    }
}
