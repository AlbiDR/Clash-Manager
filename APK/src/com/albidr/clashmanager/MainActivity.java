// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.os.PowerManager;
import android.os.ParcelFileDescriptor;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.io.FileInputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int MAX_APK_FILENAME_LENGTH = 96;
    private static final int MAX_APK_DOWNLOAD_URL_LENGTH = 2048;
    private static final int HTTPS_PORT = 443;
    // These are the two URLs the PWA resolver can hand to the native updater:
    // its deployed, same-origin release directory and GitHub's direct raw
    // release directory. Keep the paths exact: accepting an arbitrary HTTPS
    // URL here would turn a compromised page into an APK installer launcher.
    private static final String APK_RELEASE_RAW_HOST = "raw.githubusercontent.com";
    private static final String APK_RELEASE_RAW_PATH = "/AlbiDR/Clash-Manager/Beta/APK/release/";
    private static final String APK_RELEASE_SAME_ORIGIN_PATH = "/Clash-Manager/apk/release/";
    // Longest route a launch may ask for; a real one is a page name plus a short query.
    private static final int MAX_LAUNCH_ROUTE_LENGTH = 2048;

    // Exact origin the bridge is allowed to talk to. It is parsed from launchUrl
    // rather than treating a matching host as enough: http://, a non-default
    // port, and a similarly named host are all different web security origins.
    // CM Dev may use an exact http localhost origin only because its manifest is
    // explicitly debuggable; a production build always requires HTTPS.
    private String mTrustedScheme;
    private String mTrustedHost;
    private int mTrustedPort = -1;
    private WebView mWebView;
    private AndroidBridge mBridge;
    private boolean mBridgeAttached = false;
    private BroadcastReceiver mApkDownloadReceiver = null;
    private BroadcastReceiver mPowerSaveReceiver = null;
    private boolean mHapticFeedbackEnabled = true;
    private String mPendingTagsJson = null;
    private long mPendingDelayMs = BlitzService.DEFAULT_PROFILE_LOAD_DELAY_MS;
    private boolean mPendingSendInvites = true;
    private boolean mAwaitingOverlayPermission = false;
    // Set when CM Dev is launched with BlitzService.EXTRA_REHEARSAL (APK/apk-dev.mjs start --rehearsal).
    private boolean mBlitzRehearsal = false;
    private FrameLayout mRootLayout;
    // What the PWA last said it is showing; null until it reports (see setThemeColors).
    private Boolean mPageDark = null;
    // Where the status bar, display cutout and navigation bar cover the page, in
    // pixels; read by the bridge's binder thread, so volatile.
    private volatile Insets mSafeArea = Insets.NONE;
    // Steps the page back; registered only while it can (see updateBackHandling).
    private final OnBackInvokedCallback mPageBack = () -> {
        if (mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
        }
    };
    private boolean mPageBackRegistered = false;

    private void registerApkDownloadReceiver(final long downloadId, final String filename, final String expectedSha256) {
        if (this.mApkDownloadReceiver != null) {
            try {
                unregisterReceiver(this.mApkDownloadReceiver);
            } catch (Exception ignored) {
            }
            this.mApkDownloadReceiver = null;
        }

        this.mApkDownloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;

                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (completedId != downloadId) return;

                try {
                    MainActivity.this.unregisterReceiver(this);
                } catch (Exception ignored) {
                }
                MainActivity.this.mApkDownloadReceiver = null;
                MainActivity.this.openDownloadedApkInstaller(downloadId, filename, expectedSha256);
            }
        };

        // DownloadManager runs in another process, so its broadcast needs an exported receiver.
        registerReceiver(this.mApkDownloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED);
    }

    private String sha256ForDownload(DownloadManager dm, long downloadId) throws Exception {
        var digest = MessageDigest.getInstance("SHA-256");
        try (ParcelFileDescriptor descriptor = dm.openDownloadedFile(downloadId);
             FileInputStream inputStream = new FileInputStream(descriptor.getFileDescriptor())) {
            var buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                digest.update(buffer, 0, bytesRead);
            }
        }
        byte[] hash = digest.digest();
        var hex = new StringBuilder(hash.length * 2);
        for (byte value : hash) {
            // Formatter follows the device locale. Hex digests must not: their
            // serialized representation is part of the release contract.
            hex.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        }
        return hex.toString();
    }

    private void openDownloadedApkInstaller(long downloadId, String filename, String expectedSha256) {
        // The receiver is deliberately defensive even though downloadApkFile()
        // already rejects these values before enqueueing. A stale receiver or a
        // future caller must never turn an unchecked file into an installer UI.
        if (!isValidApkFilename(filename) || !isValidSha256(expectedSha256)) {
            android.util.Log.w("ClashManagerMain", "APK installer blocked: missing or invalid release metadata");
            Toast.makeText(this, "APK verification failed -- download blocked", Toast.LENGTH_LONG).show();
            return;
        }

        var dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            Toast.makeText(this, "Download finished, but installer could not open", Toast.LENGTH_LONG).show();
            return;
        }

        var query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = dm.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                Toast.makeText(this, "Download finished, but installer could not open", Toast.LENGTH_LONG).show();
                return;
            }

            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int status = statusIndex >= 0 ? cursor.getInt(statusIndex) : DownloadManager.STATUS_FAILED;
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                Toast.makeText(this, "APK download did not complete", Toast.LENGTH_LONG).show();
                return;
            }
        } catch (Exception e) {
            android.util.Log.w("ClashManagerMain", "Could not verify APK download status", e);
            Toast.makeText(this, "Download finished, but installer could not open", Toast.LENGTH_LONG).show();
            return;
        }

        Uri apkUri = dm.getUriForDownloadedFile(downloadId);
        if (apkUri == null) {
            Toast.makeText(this, "Download finished, but installer could not open", Toast.LENGTH_LONG).show();
            return;
        }

        try {
            String actualSha256 = sha256ForDownload(dm, downloadId);
            if (!expectedSha256.equalsIgnoreCase(actualSha256)) {
                android.util.Log.w("ClashManagerMain", "APK SHA-256 mismatch for " + filename);
                Toast.makeText(this, "APK verification failed -- download blocked", Toast.LENGTH_LONG).show();
                return;
            }
        } catch (Exception e) {
            android.util.Log.w("ClashManagerMain", "Could not verify APK checksum for " + filename, e);
            Toast.makeText(this, "APK verification failed -- download blocked", Toast.LENGTH_LONG).show();
            return;
        }

        // The user can revoke this per-app approval while the download is in
        // progress. Do not surface the installer if it no longer exists.
        if (!getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, "Allow APK updates in Android, then open the verified file in Downloads", Toast.LENGTH_LONG).show();
            return;
        }

        try {
            var installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(installIntent);
            Toast.makeText(this, "Confirm Android installer to update Clash Manager", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            android.util.Log.w("ClashManagerMain", "Could not open installer for " + filename, e);
            Toast.makeText(this, "Download complete -- open " + filename + " from Downloads", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        // Logged so a restart can be told apart from a handled change: the manifest
        // declares rotation and dark mode as handled here, without recreating.
        android.util.Log.i("ClashManagerMain", "activity created" + (bundle != null ? " (recreated by the system)" : ""));
        configureTrustedOrigin();
        mBlitzRehearsal = BlitzService.isRehearsal(this, getIntent());

        // Only ever true for a manifest explicitly marked android:debuggable="true"
        // (a local dev install) - the signed release manifest never sets that flag,
        // so this is a no-op in production and safe to leave unconditional.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // Edge to edge, as native apps draw: the page runs under see-through
        // status and navigation bars and any camera cutout, and keeps its own
        // content clear of them. Android 15+ enforces this; on Android 14 this
        // call and Theme.ClashManager do the same. WebView does not report the
        // bars through CSS env(safe-area-inset-*), so their size goes to the page
        // through getSafeAreaInsets(). Only the keyboard is handled here: the page
        // is lifted above it, because edge to edge Android no longer resizes the
        // window for it (adjustResize in the manifest makes it report the
        // keyboard's height instead of sliding the whole window up).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        var frameLayout = new FrameLayout(this);
        ViewCompat.setOnApplyWindowInsetsListener(frameLayout, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            view.setPadding(0, 0, 0, keyboard);
            // The keyboard already covers the navigation bar, so the page need not clear it.
            Insets area = keyboard > 0 ? Insets.of(bars.left, bars.top, bars.right, 0) : bars;
            if (!area.equals(mSafeArea)) {
                mSafeArea = area;
                notifyPageOfSafeArea();
            }
            return WindowInsetsCompat.CONSUMED;
        });

        // Back is handled by updateBackHandling(), registered against the dispatcher
        // only while the page has history to go back through.

        this.mRootLayout = frameLayout;
        setContentView(frameLayout);
        applySystemBarAppearance();
        initWebView();
        mPowerSaveReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                notifyPageOfPowerSaving();
            }
        };
        registerReceiver(mPowerSaveReceiver,
            new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED), Context.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void onDestroy() {
        if (mPowerSaveReceiver != null) {
            unregisterReceiver(mPowerSaveReceiver);
            mPowerSaveReceiver = null;
        }
        if (this.mApkDownloadReceiver != null) {
            try {
                unregisterReceiver(this.mApkDownloadReceiver);
            } catch (Exception ignored) {
            }
            this.mApkDownloadReceiver = null;
        }
        super.onDestroy();
    }

    /**
     * Builds and attaches a fresh WebView with the full settings/client/bridge setup, then
     * loads the PWA. Split out from onCreate so onRenderProcessGone can rebuild the WebView
     * in place after the renderer crashes, instead of the whole app going down with it.
     */
    private void initWebView() {
        var webView = new WebView(this);
        this.mWebView = webView;
        // A renderer recovery creates a new WebView, so any attachment state
        // belonged to the destroyed one. The bridge is reattached only by
        // loadTrustedPage() before a known-good page starts loading.
        this.mBridgeAttached = false;
        this.mWebView.setHapticFeedbackEnabled(mHapticFeedbackEnabled && !isSystemPowerSaving());
        // Transparent until the PWA paints, so the window background shows rather
        // than WebView's default white flash in dark mode.
        this.mWebView.setBackgroundColor(Color.TRANSPARENT);
        this.mRootLayout.addView(webView);

        WebSettings settings = this.mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // Web SQL defaults off, and form-data persistence has been a no-op
        // since API 26. CM's minSdk is 34, so their deprecated setters only
        // created false assurance and compiler debt.
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setOffscreenPreRaster(true);
        settings.setSafeBrowsingEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        // The manifest already forbids cleartext traffic app-wide; ALWAYS_ALLOW here
        // actively fought that by letting an https page embed http subresources.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ClashManagerAndroidWrapper");

        this.mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return true;
                String url = request.getUrl().toString();
                if (!request.isForMainFrame()) {
                    // Android exposes a JS interface to every frame of a
                    // WebView. Never let an arbitrary third-party iframe gain
                    // that capability just because its parent is trusted.
                    return !isTrustedOrigin(url);
                }
                return shouldOverrideMainFrameNavigation(view, url);
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                // Detach the native bridge the instant the WebView navigates off the
                // PWA's own origin (an external https link opened in-place). It is
                // re-attached only once navigation returns to the trusted origin, so a
                // third-party page loaded in this WebView can never reach AndroidBridge.
                boolean trusted = isTrustedOrigin(url);
                if (!trusted) {
                    detachBridge(view);
                } else if (!mBridgeAttached && view == mWebView) {
                    // addJavascriptInterface is guaranteed for the *next*
                    // navigation. If an unexpected redirect returned to our
                    // origin after we detached it, restart the trusted page
                    // after attaching instead of rendering a page with a
                    // half-established bridge.
                    attachBridge(view);
                    view.stopLoading();
                    view.loadUrl(url);
                }
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                super.doUpdateVisitedHistory(view, url, isReload);
                // Fires for the PWA's in-page navigations too (history.pushState).
                if (view == mWebView) {
                    updateBackHandling();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // An inset change that arrived before this page committed found no
                // trusted page to tell (notifyPageOfSafeArea checks the URL) and is
                // not sent again, so the page is told once it is there.
                if (view == mWebView) {
                    notifyPageOfSafeArea();
                    notifyPageOfPowerSaving();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                super.onReceivedError(view, request, error);
                // Subresource failures belong in the page/network diagnostics;
                // only a failed top-level navigation makes this screen unusable.
                if (request != null && request.isForMainFrame()) {
                    String failingUrl = request.getUrl() == null ? "unknown" : request.getUrl().toString();
                    String description = error == null ? "unknown error" : String.valueOf(error.getDescription());
                    Toast.makeText(MainActivity.this, "Load failed: " + description + "\nURL: " + failingUrl, Toast.LENGTH_LONG).show();
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // WebView's contract (since API 26): if this isn't overridden, an unhandled
                // renderer crash takes the whole host app down with it. The renderer crash
                // itself lives in the platform's WebView, out of our control - but whether
                // it kills this app is entirely up to us, so rebuild the WebView instead.
                android.util.Log.w("ClashManagerMain", "WebView renderer process gone (didCrash="
                    + detail.didCrash() + "); rebuilding WebView instead of losing the app");
                if (view != mWebView) {
                    // Stale callback from a WebView already replaced by an earlier recovery.
                    return true;
                }
                mRootLayout.removeView(mWebView);
                mWebView.destroy();
                initWebView();
                // The fresh WebView has no history to go back through yet.
                updateBackHandling();
                return true;
            }
        });

        this.mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                String extra = view.getHitTestResult().getExtra();
                if (extra != null && (extra.startsWith("intent://") || extra.startsWith("clashroyale://") || extra.startsWith("http://") || extra.startsWith("https://"))) {
                    launchExternalIntent(extra);
                    return false;
                }

                // A window the page opens by script (window.open without a
                // clickable link) is handed a throwaway WebView whose first
                // navigation is sent out as an external intent.
                var popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                        if (request != null && request.getUrl() != null) {
                            launchExternalIntent(request.getUrl().toString());
                        }
                        return true;
                    }
                });
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });

        String requested = launchTarget(getIntent());
        loadTrustedPage(requested != null ? requested : launchUrl());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        android.util.Log.i("ClashManagerMain", "configuration handled in place: orientation " + newConfig.orientation
            + ", night " + ((newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES));
        applySystemBarAppearance();
    }

    /**
     * Status and navigation bar icons that contrast with what is behind them: the
     * page's own theme once the PWA has reported it, the phone's until then.
     */
    private void applySystemBarAppearance() {
        boolean dark = mPageDark != null
            ? mPageDark
            : (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        var controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (BlitzService.isRehearsal(this, intent)) {
            mBlitzRehearsal = true;
        }
        // singleTask: a shortcut, link or share reaching the running app arrives
        // here. A plain launcher tap names no page and leaves the user where they were.
        String requested = launchTarget(intent);
        if (requested != null && mWebView != null) {
            loadTrustedPage(requested);
        }
    }

    /**
     * Registers the page's Back handler only while the page can go back. At the
     * start of its history Back then reaches Android, which plays its
     * back-to-home animation and keeps the app in memory, so it reopens where it
     * was. Always handling Back here meant calling finish() at the start screen,
     * which discarded the page and reloaded it on the next launch.
     */
    private void updateBackHandling() {
        boolean pageCanGoBack = mWebView != null && mWebView.canGoBack();
        if (pageCanGoBack == mPageBackRegistered) return;
        if (pageCanGoBack) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, mPageBack);
        } else {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(mPageBack);
        }
        mPageBackRegistered = pageCanGoBack;
    }

    /**
     * Tells a page already running that the bars changed size (rotation, the
     * keyboard, a switch of navigation mode), so it reads getSafeAreaInsets()
     * again. Pages from other origins are left alone.
     */
    private boolean isSystemPowerSaving() {
        PowerManager powerManager = getSystemService(PowerManager.class);
        return powerManager != null && powerManager.isPowerSaveMode();
    }

    private void notifyPageOfPowerSaving() {
        if (mWebView == null) return;
        mWebView.setHapticFeedbackEnabled(mHapticFeedbackEnabled && !isSystemPowerSaving());
        if (isTrustedOrigin(mWebView.getUrl())) {
            mWebView.evaluateJavascript("window.dispatchEvent(new Event('cm-power-save-change'));", null);
        }
    }

    private void notifyPageOfSafeArea() {
        if (mWebView != null && isTrustedOrigin(mWebView.getUrl())) {
            mWebView.evaluateJavascript("window.dispatchEvent(new Event('shellinsetschange'))", null);
        }
    }

    private String launchUrl() {
        return getString(getResources().getIdentifier("launchUrl", "string", getPackageName()));
    }

    /**
     * Reads the one configured PWA origin once at startup. The production
     * manifest forbids cleartext, but enforce that invariant here too: a future
     * resource edit must not silently make the privileged bridge available to
     * http. The debuggable CM Dev build is the deliberate exception so it can
     * inspect a local development server through adb reverse.
     */
    private void configureTrustedOrigin() {
        mTrustedScheme = null;
        mTrustedHost = null;
        mTrustedPort = -1;
        try {
            String configuredHost = getString(getResources().getIdentifier("hostName", "string", getPackageName()));
            URI launch = new URI(launchUrl());
            String scheme = launch.getScheme();
            String host = launch.getHost();
            boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            boolean secure = "https".equalsIgnoreCase(scheme);
            boolean allowedDevHttp = debuggable && "http".equalsIgnoreCase(scheme);
            if (host == null || launch.getRawUserInfo() != null || (!secure && !allowedDevHttp)
                || !configuredHost.equalsIgnoreCase(host)) {
                throw new IllegalArgumentException("launchUrl is not a configured trusted origin");
            }
            mTrustedScheme = scheme.toLowerCase(Locale.ROOT);
            mTrustedHost = host;
            mTrustedPort = canonicalPort(mTrustedScheme, launch.getPort());
            if (mTrustedPort < 0) {
                throw new IllegalArgumentException("launchUrl has no usable web port");
            }
        } catch (Exception e) {
            android.util.Log.e("ClashManagerMain", "Invalid trusted PWA origin; native bridge disabled", e);
        }
    }

    /** Normalizes omitted web ports so e.g. https://host and https://host:443 agree. */
    private static int canonicalPort(String scheme, int port) {
        if (port >= 0) return port;
        if ("https".equalsIgnoreCase(scheme)) return HTTPS_PORT;
        if ("http".equalsIgnoreCase(scheme)) return 80;
        return -1;
    }

    /**
     * Exact origin comparison used for the bridge boundary. Deliberately pure
     * Java so the URL policy can be unit-tested without an Android device.
     */
    private static boolean isTrustedWebOrigin(String url, String expectedScheme, String expectedHost, int expectedPort) {
        if (url == null || expectedScheme == null || expectedHost == null || expectedPort < 0) return false;
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            return scheme != null && host != null && uri.getRawUserInfo() == null
                && expectedScheme.equalsIgnoreCase(scheme)
                && expectedHost.equalsIgnoreCase(host)
                && expectedPort == canonicalPort(scheme, uri.getPort());
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Attaches the bridge only while the active WebView is about to load this
     * app's configured PWA. addJavascriptInterface is page-load scoped, so
     * attaching at WebView construction would also expose it to about:blank.
     */
    private void attachBridge(WebView view) {
        if (view == null || view != mWebView || mBridgeAttached) return;
        if (mBridge == null) {
            mBridge = new AndroidBridge();
        }
        view.addJavascriptInterface(mBridge, "AndroidBridge");
        mBridgeAttached = true;
    }

    /** Removes the bridge from the active WebView before an untrusted page can use it. */
    private void detachBridge(WebView view) {
        if (view == null || view != mWebView || !mBridgeAttached) return;
        view.removeJavascriptInterface("AndroidBridge");
        mBridgeAttached = false;
    }

    /** Routes only top-level untrusted navigations out to Android; frames are blocked instead. */
    private boolean shouldOverrideMainFrameNavigation(WebView view, String url) {
        // There is no safe native action for a blank navigation. In particular,
        // never leave AndroidBridge on about:blank while a popup or an
        // untrusted redirect is being resolved.
        if (url == null || "about:blank".equalsIgnoreCase(url)) {
            detachBridge(view);
            return true;
        }
        if (!isTrustedOrigin(url)) {
            launchExternalIntent(url);
            return true;
        }
        return false;
    }

    /** Starts a trusted navigation with the bridge already in place, or fails closed. */
    private void loadTrustedPage(String url) {
        if (mWebView == null) return;
        if (!isTrustedOrigin(url)) {
            android.util.Log.e("ClashManagerMain", "Refusing to load untrusted URL in the bridge WebView: " + url);
            detachBridge(mWebView);
            Toast.makeText(this, "Could not load Clash Manager securely", Toast.LENGTH_LONG).show();
            return;
        }
        attachBridge(mWebView);
        mWebView.loadUrl(url);
    }

    /**
     * The page a launch asks for, as a URL inside this app's own PWA, or null
     * when it names none.
     *
     * Launcher shortcuts, links into the PWA, web+clash and clash-manager links
     * and the share sheet each name a page, and each used to be dropped: every
     * one of them opened the roster. The intent only ever chooses the route (the
     * part after #); the origin always comes from this build's own launch URL,
     * so a link can never point the bridge-carrying WebView at another site, and
     * the dev build's shortcuts open the dev build's PWA. The mappings mirror the
     * PWA's web manifest: share_target and protocol_handlers both land on
     * #/headhunter with the same parameter names.
     */
    private String launchTarget(Intent intent) {
        if (intent == null) return null;
        String route = null;
        Uri data = intent.getData();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && !text.trim().isEmpty()) {
                String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
                route = "/headhunter?text=" + Uri.encode(text) + (title == null ? "" : "&title=" + Uri.encode(title));
            }
        } else if (data != null) {
            String scheme = data.getScheme();
            if ("https".equals(scheme) || "http".equals(scheme)) {
                route = data.getEncodedFragment();
            } else if ("web+clash".equals(scheme)) {
                route = "/headhunter?query=" + Uri.encode(data.toString());
            } else if ("clash-manager".equals(scheme)) {
                route = "/" + (data.getHost() == null ? "" : data.getHost()) + (data.getPath() == null ? "" : data.getPath());
            }
        }
        if (route == null || !route.startsWith("/") || route.length() > MAX_LAUNCH_ROUTE_LENGTH) return null;
        String launchUrl = launchUrl();
        int hash = launchUrl.indexOf('#');
        return (hash >= 0 ? launchUrl.substring(0, hash) : launchUrl) + "#" + route;
    }

    /**
     * Why Blitz cannot tap. Android lists the service as switched on and still
     * leaves it unbound after the app was force-stopped, until the user toggles
     * it; "turn it on" would then point them at a switch that is already on.
     */
    private String accessibilityHint() {
        var component = new ComponentName(this, ClashManagerAccessibilityService.class);
        String label;
        try {
            label = getPackageManager().getServiceInfo(component, 0).loadLabel(getPackageManager()).toString();
        } catch (Exception e) {
            label = "Clash Manager Blitz";
        }
        String enabled = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        boolean switchedOn = false;
        if (enabled != null) {
            for (String entry : enabled.split(":")) {
                if (component.equals(ComponentName.unflattenFromString(entry))) {
                    switchedOn = true;
                    break;
                }
            }
        }
        return switchedOn
            ? "\"" + label + "\" is on but not connected. Turn it off and on again in Accessibility settings so Blitz can tap."
            : "Turn on \"" + label + "\" in Accessibility settings so Blitz can tap Invite.";
    }

    /** True only for the configured scheme, host, and port (safe to keep the bridge attached for). */
    private boolean isTrustedOrigin(String url) {
        return isTrustedWebOrigin(url, mTrustedScheme, mTrustedHost, mTrustedPort);
    }

    /** The versioned release filename is also the path segment the URL must name. */
    private static boolean isValidApkFilename(String filename) {
        return filename != null && filename.length() <= MAX_APK_FILENAME_LENGTH
            && filename.matches("clashmanager-v\\d+\\.\\d+\\.\\d+\\+\\d+\\.apk");
    }

    /** Native installation is allowed only after an exact, complete SHA-256 check. */
    private static boolean isValidSha256(String expectedSha256) {
        return expectedSha256 != null && expectedSha256.matches("(?i)^[a-f0-9]{64}$");
    }

    /**
     * Restricts native APK installation to the two release locations the PWA
     * resolver uses. A browser can still open ordinary HTTPS links, but an
     * arbitrary page must not be able to enqueue an APK and open Android's
     * installer through this privileged bridge.
     */
    private static boolean isAllowedApkDownloadUrl(String url, String filename, String trustedHost) {
        if (!isValidApkFilename(filename) || trustedHost == null || url == null
            || url.length() > MAX_APK_DOWNLOAD_URL_LENGTH) {
            return false;
        }
        try {
            URI uri = new URI(url);
            String host = uri.getHost();
            String path = uri.getPath();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || path == null
                || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || canonicalPort(uri.getScheme(), uri.getPort()) != HTTPS_PORT) {
                return false;
            }
            boolean canonicalRawRelease = APK_RELEASE_RAW_HOST.equalsIgnoreCase(host)
                && (APK_RELEASE_RAW_PATH + filename).equals(path);
            boolean sameOriginRelease = trustedHost.equalsIgnoreCase(host)
                && (APK_RELEASE_SAME_ORIGIN_PATH + filename).equals(path);
            return canonicalRawRelease || sameOriginRelease;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Launches a page-supplied URL/intent-URI as a standalone Android intent instead of
     * inside this WebView. `setSelector(null)` blocks the intent-scheme "selector"
     * confusion trick a hostile page could otherwise use to redirect an explicit intent
     * at an arbitrary component.
     */
    private void launchExternalIntent(String url) {
        try {
            Intent intent;
            if (url.startsWith("intent://")) {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            android.util.Log.w("ClashManagerMain", "Could not launch external intent for: " + url, e);
            Toast.makeText(this, "Could not open link", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        notifyPageOfPowerSaving();
        if (this.mAwaitingOverlayPermission) {
            this.mAwaitingOverlayPermission = false;
            if (Settings.canDrawOverlays(this)) {
                String pendingTags = this.mPendingTagsJson;
                if (pendingTags != null) {
                    startBlitzService(pendingTags, this.mPendingDelayMs, this.mPendingSendInvites);
                    this.mPendingTagsJson = null;
                }
            } else {
                Toast.makeText(this, "Overlay permission is required for autonomous Blitz Mode", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private void startBlitzService(String tagsJson, long delayMs, boolean sendInvites) {
        var intent = new Intent(this, BlitzService.class);
        intent.putExtra("tags", tagsJson);
        intent.putExtra("delayMs", delayMs);
        intent.putExtra(BlitzService.EXTRA_SEND_INVITES, sendInvites);
        if (mBlitzRehearsal) {
            intent.putExtra(BlitzService.EXTRA_REHEARSAL, true);
        }
        try {
            startForegroundService(intent);
        } catch (android.app.ForegroundServiceStartNotAllowedException e) {
            // Android only lets an app start a foreground service while it is in
            // front. Uncaught, this refusal used to take the whole app down.
            android.util.Log.w("ClashManagerMain", "Blitz could not start: app not in the foreground", e);
            Toast.makeText(this, "Blitz could not start. Open Clash Manager and try again.", Toast.LENGTH_LONG).show();
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public boolean isPowerSaveMode() {
            return isSystemPowerSaving();
        }

        @JavascriptInterface
        public void setHapticFeedbackEnabled(boolean enabled) {
            runOnUiThread(() -> {
                mHapticFeedbackEnabled = enabled;
                if (mWebView != null) {
                    mWebView.setHapticFeedbackEnabled(enabled && !isSystemPowerSaving());
                }
            });
        }

        @JavascriptInterface
        public boolean isAndroidWrapper() {
            return true;
        }

        @JavascriptInterface
        public String getAppVersionName() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "getAppVersionName failed", e);
                return "";
            }
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            try {
                var packageInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                return (int) Math.min(packageInfo.getLongVersionCode(), Integer.MAX_VALUE);
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "getAppVersionCode failed", e);
                return 0;
            }
        }

        @JavascriptInterface
        public int getBuildNumber() {
            try {
                int buildNumberId = getResources().getIdentifier("buildNumber", "string", getPackageName());
                return Integer.parseInt(getString(buildNumberId));
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "getBuildNumber failed", e);
                return 0;
            }
        }

        @JavascriptInterface
        public void openExternalUrl(String url) {
            runOnUiThread(() -> {
                try {
                    if (url == null) {
                        android.util.Log.w("ClashManagerMain", "openExternalUrl rejected null URL");
                        return;
                    }
                    Uri parsed = Uri.parse(url);
                    String scheme = parsed.getScheme();
                    if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
                        android.util.Log.w("ClashManagerMain", "openExternalUrl rejected non-http(s) scheme: " + scheme);
                        return;
                    }
                    var intent = new Intent(Intent.ACTION_VIEW, parsed);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    android.util.Log.w("ClashManagerMain", "Could not open URL: " + url, e);
                    Toast.makeText(MainActivity.this, "Could not open URL", Toast.LENGTH_SHORT).show();
                }
            });
        }

        /**
         * Downloads an APK file directly using the Android DownloadManager.
         *
         * Unlike openExternalUrl (which fires ACTION_VIEW and hands the URL to a
         * browser), this method enqueues the download through the system
         * DownloadManager so the binary is fetched natively and saved to the
         * public Downloads folder. The system shows a download progress
         * notification automatically. Once complete, the wrapper opens Android's
         * package installer so the user can confirm the in-place update.
         *
         * @param url      Direct HTTPS URL to the APK file.
         * @param filename Suggested filename to save under in Downloads.
         */
        @JavascriptInterface
        public boolean downloadApkFile(String url, String filename) {
            return downloadApkFile(url, filename, null);
        }

        @JavascriptInterface
        public boolean downloadApkFile(String url, String filename, String expectedSha256) {
            if (!isValidApkFilename(filename)) {
                android.util.Log.w("ClashManagerMain", "downloadApkFile rejected invalid filename");
                return false;
            }
            if (!isValidSha256(expectedSha256)) {
                // Older PWA metadata did not publish a digest. Return false so
                // the PWA uses its existing browser fallback instead of opening
                // Android's installer for a file native code cannot verify.
                android.util.Log.w("ClashManagerMain", "downloadApkFile rejected missing or invalid SHA-256 metadata");
                return false;
            }
            if (!isAllowedApkDownloadUrl(url, filename, mTrustedHost)) {
                android.util.Log.w("ClashManagerMain", "downloadApkFile rejected URL outside the APK release allowlist");
                return false;
            }

            final Uri parsed;
            try {
                parsed = Uri.parse(url);
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "downloadApkFile rejected unparseable URL", e);
                return false;
            }
            final String checksum = expectedSha256.toLowerCase(Locale.ROOT);
            final DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                android.util.Log.w("ClashManagerMain", "downloadApkFile rejected: DownloadManager unavailable");
                return false;
            }
            runOnUiThread(() -> {
                try {
                    var request = new DownloadManager.Request(parsed);
                    request.setTitle("Clash Manager Update");
                    request.setDescription("Downloading " + filename);
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, filename);
                    request.setMimeType("application/vnd.android.package-archive");
                    request.addRequestHeader("User-Agent", "ClashManager-Android");
                    long downloadId = dm.enqueue(request);
                    try {
                        registerApkDownloadReceiver(downloadId, filename, checksum);
                    } catch (Exception receiverError) {
                        // Without a receiver the user never reaches the verified
                        // installer. Remove this just-enqueued request rather
                        // than leaving an unchecked APK in Downloads.
                        try {
                            dm.remove(downloadId);
                        } catch (Exception removeError) {
                            android.util.Log.w("ClashManagerMain", "Could not remove untracked APK download", removeError);
                        }
                        throw receiverError;
                    }
                    Toast.makeText(MainActivity.this, "Download started -- installer opens when ready", Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    android.util.Log.e("ClashManagerMain", "downloadApkFile failed: " + url, e);
                    Toast.makeText(MainActivity.this, "Download failed -- check your connection", Toast.LENGTH_SHORT).show();
                }
            });
            return true;
        }

        @JavascriptInterface
        public void openPlayerProfile(String tag) {
            runOnUiThread(() -> {
                try {
                    String safeTag = tag == null ? "" : tag.replaceAll("[^0289CGJLPQRUVY]", "");
                    if (safeTag.isEmpty()) {
                        android.util.Log.w("ClashManagerMain", "openPlayerProfile rejected invalid tag");
                        return;
                    }
                    var intent = Intent.parseUri("intent://playerInfo?id=" + Uri.encode(safeTag) + "#Intent;scheme=clashroyale;package=com.supercell.clashroyale;end", Intent.URI_INTENT_SCHEME);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                    Toast.makeText(MainActivity.this, "Could not open Clash Royale - is it installed?", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public boolean hasOverlayPermission() {
            return Settings.canDrawOverlays(MainActivity.this);
        }

        @JavascriptInterface
        public boolean canRequestPackageInstalls() {
            return getPackageManager().canRequestPackageInstalls();
        }

        @JavascriptInterface
        public void openPackageInstallSettings() {
            runOnUiThread(() -> {
                try {
                    var intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    android.util.Log.w("ClashManagerMain", "Could not open package install settings", e);
                    Toast.makeText(MainActivity.this, "Could not open install settings", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void openOverlaySettings() {
            runOnUiThread(() -> {
                try {
                    openOverlayPermissionScreen();
                } catch (Exception e) {
                    android.util.Log.w("ClashManagerMain", "Could not open overlay settings", e);
                    Toast.makeText(MainActivity.this, "Could not open overlay settings", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void startBlitz(String tagsJson, long delayMs) {
            requestBlitz(tagsJson, delayMs, true);
        }

        /**
         * Blitz without the Invite and Close taps: opens each profile for the
         * dwell, then the next. The Roster uses it, because its players are
         * already in the clan. A separate method rather than a third argument,
         * so the PWA can tell whether the installed shell supports it.
         */
        @JavascriptInterface
        public void openProfiles(String tagsJson, long delayMs) {
            requestBlitz(tagsJson, delayMs, false);
        }

        private void requestBlitz(String tagsJson, long delayMs, boolean sendInvites) {
            runOnUiThread(() -> {
                if (Settings.canDrawOverlays(MainActivity.this)) {
                    // A profiles-only run sends no taps, so it does not need the
                    // accessibility service and should not ask for it.
                    if (sendInvites && !ClashManagerAccessibilityService.isActive()) {
                        Toast.makeText(MainActivity.this, accessibilityHint(), Toast.LENGTH_LONG).show();
                    }
                    startBlitzService(tagsJson, delayMs, sendInvites);
                    return;
                }
                mPendingTagsJson = tagsJson;
                mPendingDelayMs = delayMs;
                mPendingSendInvites = sendInvites;
                mAwaitingOverlayPermission = true;
                Toast.makeText(MainActivity.this, "Grant 'Display over other apps' for Clash Manager, then return here", Toast.LENGTH_LONG).show();
                try {
                    openOverlayPermissionScreen();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Please grant 'Display over other apps' in system settings", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void saveCoordinates(float inviteX, float inviteY, float closeX, float closeY) {
            new Calibration(inviteX, inviteY, closeX, closeY).save(MainActivity.this, false);
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Coordinates updated successfully", Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public String getCoordinates() {
            return Calibration.load(MainActivity.this).toJson();
        }

        /**
         * The PWA reports the background it is showing whenever its theme resolves
         * or changes. The page itself paints behind the status and navigation
         * bars; this layout takes the same colour for the space the keyboard
         * opens below the page, and the bar icons are picked to contrast with it.
         * The window background from the theme only covers the moment before the
         * page has painted: it follows the phone, while the page follows the
         * app's own theme setting.
         */
        @JavascriptInterface
        public void setThemeColors(String background, boolean dark) {
            int color;
            try {
                color = Color.parseColor(background);
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "setThemeColors rejected colour: " + background);
                return;
            }
            runOnUiThread(() -> {
                mPageDark = dark;
                mRootLayout.setBackgroundColor(color);
                applySystemBarAppearance();
            });
        }

        /**
         * Where the status bar, display cutout and navigation bar cover the page,
         * in CSS pixels: {"top":..,"right":..,"bottom":..,"left":..}. The page
         * reads it before its first paint and again on "resize" and
         * "shellinsetschange"; see BOOT_INSETS_SCRIPT in the PWA.
         */
        @JavascriptInterface
        public String getSafeAreaInsets() {
            Insets area = mSafeArea;
            float density = getResources().getDisplayMetrics().density;
            return "{\"top\":" + area.top / density + ",\"right\":" + area.right / density
                + ",\"bottom\":" + area.bottom / density + ",\"left\":" + area.left / density + "}";
        }

        /** The last Blitz run as JSON (see BlitzRun), or an empty string when Blitz has never run. */
        @JavascriptInterface
        public String getLastBlitzRun() {
            return BlitzRun.lastJson(MainActivity.this);
        }

        @JavascriptInterface
        public boolean isAccessibilityActive() {
            return ClashManagerAccessibilityService.isActive();
        }

        @JavascriptInterface
        public void openAccessibilitySettings() {
            runOnUiThread(() -> {
                try {
                    var intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                    Toast.makeText(MainActivity.this, "Could not open Accessibility Settings", Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    /**
     * Opens this app's own "Display over other apps" screen, falling back to the
     * system-wide list on the few builds that reject the per-package form.
     * Shared by openOverlaySettings and the startBlitz permission prompt, which
     * each carried their own copy of this.
     */
    private void openOverlayPermissionScreen() {
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
        } catch (Exception perPackageRejected) {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
        }
    }
}
