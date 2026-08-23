// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.os.ParcelFileDescriptor;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.core.graphics.Insets;
import androidx.core.view.OnApplyWindowInsetsListener;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.io.FileInputStream;
import java.security.MessageDigest;

public class MainActivity extends Activity {
    private static final int MAX_APK_FILENAME_LENGTH = 96;

    // Origin the bridge is allowed to talk to. Matches strings.xml/hostName - the
    // PWA's real host. Any other origin loaded into this WebView (an external
    // link the user tapped) gets the JS interface detached so that page cannot
    // call into native code, even though it shares the same WebView instance.
    private String mTrustedHost;
    private WebView mWebView;
    private AndroidBridge mBridge;
    private boolean mBridgeAttached = false;
    private BroadcastReceiver mApkDownloadReceiver = null;
    private String mPendingTagsJson = null;
    private long mPendingDelayMs = BlitzService.DEFAULT_PROFILE_LOAD_DELAY_MS;
    private boolean mAwaitingOverlayPermission = false;
    private FrameLayout mRootLayout;

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

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(this.mApkDownloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(this.mApkDownloadReceiver, filter);
        }
    }

    private String sha256ForDownload(DownloadManager dm, long downloadId) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (ParcelFileDescriptor descriptor = dm.openDownloadedFile(downloadId);
             FileInputStream inputStream = new FileInputStream(descriptor.getFileDescriptor())) {
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                digest.update(buffer, 0, bytesRead);
            }
        }
        byte[] hash = digest.digest();
        StringBuilder hex = new StringBuilder(hash.length * 2);
        for (byte value : hash) {
            hex.append(String.format("%02x", value));
        }
        return hex.toString();
    }

    private void openDownloadedApkInstaller(long downloadId, String filename, String expectedSha256) {
        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            Toast.makeText(this, "Download finished, but installer could not open", Toast.LENGTH_LONG).show();
            return;
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
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

        if (expectedSha256 != null && expectedSha256.matches("(?i)^[a-f0-9]{64}$")) {
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
        }

        try {
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
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
        mTrustedHost = getString(getResources().getIdentifier("hostName", "string", getPackageName()));

        // Only ever true for a manifest explicitly marked android:debuggable="true"
        // (a local dev install) - the signed release manifest never sets that flag,
        // so this is a no-op in production and safe to leave unconditional.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // True edge-to-edge: draw behind system bars ourselves and consume the
        // insets as padding, rather than relying on setStatusBarColor/
        // setNavigationBarColor - both are no-ops once targetSdk reaches 35+,
        // where the platform enforces edge-to-edge unconditionally.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        FrameLayout frameLayout = new FrameLayout(this);
        frameLayout.setBackgroundColor(Color.parseColor("#0B0E14"));
        ViewCompat.setOnApplyWindowInsetsListener(frameLayout, new OnApplyWindowInsetsListener() {
            @Override
            public WindowInsetsCompat onApplyWindowInsets(android.view.View v, WindowInsetsCompat insets) {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            }
        });

        // Predictive back (Android 13+): registered directly against the
        // dispatcher since this Activity extends the plain android.app.Activity,
        // not AppCompatActivity/ComponentActivity, so onBackPressed() alone is
        // never invoked once the app opts into the predictive-back contract via
        // the manifest's enableOnBackInvokedCallback flag.
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                new android.window.OnBackInvokedCallback() {
                    @Override
                    public void onBackInvoked() {
                        if (mWebView != null && mWebView.canGoBack()) {
                            mWebView.goBack();
                        } else {
                            finish();
                        }
                    }
                });
        }

        this.mRootLayout = frameLayout;
        setContentView(frameLayout);
        initWebView();
    }

    @Override
    protected void onDestroy() {
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
        WebView webView = new WebView(this);
        this.mWebView = webView;
        this.mWebView.setHapticFeedbackEnabled(true);
        this.mRootLayout.addView(webView);

        WebSettings settings = this.mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setSaveFormData(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= 23) {
            settings.setOffscreenPreRaster(true);
        }
        if (Build.VERSION.SDK_INT >= 26) {
            settings.setSafeBrowsingEnabled(true);
        }
        settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        // The manifest already forbids cleartext traffic app-wide; ALWAYS_ALLOW here
        // actively fought that by letting an https page embed http subresources.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ClashManagerAndroidWrapper");

        if (this.mBridge == null) {
            this.mBridge = new AndroidBridge();
        }
        this.mWebView.addJavascriptInterface(this.mBridge, "AndroidBridge");
        this.mBridgeAttached = true;

        this.mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView webView2, String str) {
                if (str.startsWith("clashroyale://") || str.startsWith("intent://")) {
                    launchExternalIntent(str);
                    return true;
                }
                if (!isTrustedOrigin(str)) {
                    launchExternalIntent(str);
                    return true;
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView webView2, String str, android.graphics.Bitmap favicon) {
                super.onPageStarted(webView2, str, favicon);
                // Detach the native bridge the instant the WebView navigates off the
                // PWA's own origin (an external https link opened in-place). It is
                // re-attached only once navigation returns to the trusted origin, so a
                // third-party page loaded in this WebView can never reach AndroidBridge.
                boolean trusted = isTrustedOrigin(str);
                if (trusted && !mBridgeAttached) {
                    webView2.addJavascriptInterface(mBridge, "AndroidBridge");
                    mBridgeAttached = true;
                } else if (!trusted && mBridgeAttached) {
                    webView2.removeJavascriptInterface("AndroidBridge");
                    mBridgeAttached = false;
                }
            }

            @Override
            public void onReceivedError(WebView webView2, int i, String str, String str2) {
                super.onReceivedError(webView2, i, str, str2);
                Toast.makeText(MainActivity.this, "Load failed: " + str + "\nURL: " + str2, Toast.LENGTH_LONG).show();
            }

            @Override
            public boolean onRenderProcessGone(WebView webView2, RenderProcessGoneDetail detail) {
                // WebView's contract (since API 26): if this isn't overridden, an unhandled
                // renderer crash takes the whole host app down with it. The renderer crash
                // itself lives in the platform's WebView, out of our control - but whether
                // it kills this app is entirely up to us, so rebuild the WebView instead.
                android.util.Log.w("ClashManagerMain", "WebView renderer process gone (didCrash="
                    + detail.didCrash() + "); rebuilding WebView instead of losing the app");
                if (webView2 != mWebView) {
                    // Stale callback from a WebView already replaced by an earlier recovery.
                    return true;
                }
                mRootLayout.removeView(mWebView);
                mWebView.destroy();
                initWebView();
                return true;
            }
        });

        this.mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView webView2, boolean z, boolean z2, Message message) {
                String extra = webView2.getHitTestResult().getExtra();
                if (extra != null && (extra.startsWith("intent://") || extra.startsWith("clashroyale://") || extra.startsWith("http://") || extra.startsWith("https://"))) {
                    launchExternalIntent(extra);
                    return false;
                }

                WebView webView3 = new WebView(MainActivity.this);
                webView3.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView webView4, String str) {
                        launchExternalIntent(str);
                        return true;
                    }
                });
                ((WebView.WebViewTransport) message.obj).setWebView(webView3);
                message.sendToTarget();
                return true;
            }
        });

        this.mWebView.loadUrl(getString(getResources().getIdentifier("launchUrl", "string", getPackageName())));
    }

    /** True when the URL's host is the PWA's own origin (safe to keep the bridge attached for). */
    private boolean isTrustedOrigin(String url) {
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (!"https".equals(scheme) && !"http".equals(scheme)) {
                // Non-web schemes (about:, data:, blob:) never carry the bridge origin.
                return "about:blank".equals(url);
            }
            return mTrustedHost.equalsIgnoreCase(uri.getHost());
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
    private void launchExternalIntent(String str) {
        try {
            Intent intent;
            if (str.startsWith("intent://")) {
                intent = Intent.parseUri(str, Intent.URI_INTENT_SCHEME);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(str));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            android.util.Log.w("ClashManagerMain", "Could not launch external intent for: " + str, e);
            Toast.makeText(this, "Could not open link", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (this.mAwaitingOverlayPermission) {
            this.mAwaitingOverlayPermission = false;
            if (Build.VERSION.SDK_INT >= 23 && Settings.canDrawOverlays(this)) {
                String str = this.mPendingTagsJson;
                if (str != null) {
                    startBlitzService(str, this.mPendingDelayMs);
                    this.mPendingTagsJson = null;
                }
            } else {
                Toast.makeText(this, "Overlay permission is required for autonomous Blitz Mode", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (this.mWebView.canGoBack()) {
            this.mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void startBlitzService(String str, long delayMs) {
        Intent intent = new Intent(this, BlitzService.class);
        intent.putExtra("tags", str);
        intent.putExtra("delayMs", delayMs);
        if (Build.VERSION.SDK_INT >= 26) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public boolean isAndroidWrapper() {
            return true;
        }

        @JavascriptInterface
        public String getAppVersionName() {
            try {
                return MainActivity.this.getPackageManager()
                    .getPackageInfo(MainActivity.this.getPackageName(), 0)
                    .versionName;
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "getAppVersionName failed", e);
                return "";
            }
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            try {
                android.content.pm.PackageInfo packageInfo = MainActivity.this.getPackageManager()
                    .getPackageInfo(MainActivity.this.getPackageName(), 0);
                if (Build.VERSION.SDK_INT >= 28) {
                    return (int) Math.min(packageInfo.getLongVersionCode(), Integer.MAX_VALUE);
                }
                return packageInfo.versionCode;
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "getAppVersionCode failed", e);
                return 0;
            }
        }

        @JavascriptInterface
        public int getBuildNumber() {
            try {
                int buildNumberId = MainActivity.this.getResources()
                    .getIdentifier("buildNumber", "string", MainActivity.this.getPackageName());
                return Integer.parseInt(MainActivity.this.getString(buildNumberId));
            } catch (Exception e) {
                android.util.Log.w("ClashManagerMain", "getBuildNumber failed", e);
                return 0;
            }
        }

        @JavascriptInterface
        public void openExternalUrl(final String url) {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Uri parsed = Uri.parse(url);
                    String scheme = parsed.getScheme();
                    if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
                        android.util.Log.w("ClashManagerMain", "openExternalUrl rejected non-http(s) scheme: " + scheme);
                        return;
                    }
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, parsed);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        MainActivity.this.startActivity(intent);
                    } catch (Exception e) {
                        android.util.Log.w("ClashManagerMain", "Could not open URL: " + url, e);
                        Toast.makeText(MainActivity.this, "Could not open URL", Toast.LENGTH_SHORT).show();
                    }
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
        public boolean downloadApkFile(final String url, final String filename) {
            return downloadApkFile(url, filename, null);
        }

        @JavascriptInterface
        public boolean downloadApkFile(final String url, final String filename, final String expectedSha256) {
            Uri parsed = Uri.parse(url);
            String scheme = parsed.getScheme();
            if (!"https".equalsIgnoreCase(scheme)) {
                android.util.Log.w("ClashManagerMain", "downloadApkFile rejected non-https scheme: " + scheme);
                return false;
            }
            if (filename == null || filename.length() > MAX_APK_FILENAME_LENGTH || !filename.matches("clashmanager-v\\d+\\.\\d+\\.\\d+\\+\\d+\\.apk")) {
                android.util.Log.w("ClashManagerMain", "downloadApkFile rejected invalid filename");
                return false;
            }
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        DownloadManager.Request request = new DownloadManager.Request(parsed);
                        request.setTitle("Clash Manager Update");
                        request.setDescription("Downloading " + filename);
                        request.setNotificationVisibility(
                            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        request.setDestinationInExternalPublicDir(
                            android.os.Environment.DIRECTORY_DOWNLOADS, filename);
                        request.setMimeType("application/vnd.android.package-archive");
                        request.addRequestHeader("User-Agent", "ClashManager-Android");
                        DownloadManager dm = (DownloadManager)
                            MainActivity.this.getSystemService(Context.DOWNLOAD_SERVICE);
                        long downloadId = dm.enqueue(request);
                        MainActivity.this.registerApkDownloadReceiver(downloadId, filename, expectedSha256);
                        Toast.makeText(MainActivity.this,
                            "Download started -- installer opens when ready",
                            Toast.LENGTH_LONG).show();
                    } catch (Exception e) {
                        android.util.Log.e("ClashManagerMain", "downloadApkFile failed: " + url, e);
                        Toast.makeText(MainActivity.this,
                            "Download failed -- check your connection",
                            Toast.LENGTH_SHORT).show();
                    }
                }
            });
            return true;
        }

        @JavascriptInterface
        public void openPlayerProfile(final String tag) {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        String safeTag = tag == null ? "" : tag.replaceAll("[^0289CGJLPQRUVY]", "");
                        if (safeTag.length() == 0) {
                            android.util.Log.w("ClashManagerMain", "openPlayerProfile rejected invalid tag");
                            return;
                        }
                        Intent uri = Intent.parseUri("intent://playerInfo?id=" + Uri.encode(safeTag) + "#Intent;scheme=clashroyale;package=com.supercell.clashroyale;end", Intent.URI_INTENT_SCHEME);
                        uri.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        MainActivity.this.startActivity(uri);
                    } catch (Exception e) {
                        e.printStackTrace();
                        Toast.makeText(MainActivity.this, "Could not open Clash Royale - is it installed?", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean hasOverlayPermission() {
            if (Build.VERSION.SDK_INT >= 23) {
                return Settings.canDrawOverlays(MainActivity.this);
            }
            return true;
        }

        @JavascriptInterface
        public boolean canRequestPackageInstalls() {
            if (Build.VERSION.SDK_INT >= 26) {
                return MainActivity.this.getPackageManager().canRequestPackageInstalls();
            }
            return true;
        }

        @JavascriptInterface
        public void openPackageInstallSettings() {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent;
                        if (Build.VERSION.SDK_INT >= 26) {
                            intent = new Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + MainActivity.this.getPackageName()));
                        } else {
                            intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
                        }
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        MainActivity.this.startActivity(intent);
                    } catch (Exception e) {
                        android.util.Log.w("ClashManagerMain", "Could not open package install settings", e);
                        Toast.makeText(MainActivity.this, "Could not open install settings", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void openOverlaySettings() {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        try {
                            MainActivity.this.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + MainActivity.this.getPackageName())));
                        } catch (Exception unused) {
                            MainActivity.this.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
                        }
                    } catch (Exception e) {
                        android.util.Log.w("ClashManagerMain", "Could not open overlay settings", e);
                        Toast.makeText(MainActivity.this, "Could not open overlay settings", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void startBlitz(final String tagsJson, final long delayMs) {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    boolean overlaysAllowed = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(MainActivity.this);
                    if (overlaysAllowed) {
                        if (!ClashManagerAccessibilityService.isActive()) {
                            Toast.makeText(MainActivity.this, "Tip: Enable Clash Manager in Accessibility Settings for automatic invites", Toast.LENGTH_LONG).show();
                        }
                        MainActivity.this.startBlitzService(tagsJson, delayMs);
                        return;
                    }
                    MainActivity.this.mPendingTagsJson = tagsJson;
                    MainActivity.this.mPendingDelayMs = delayMs;
                    MainActivity.this.mAwaitingOverlayPermission = true;
                    Toast.makeText(MainActivity.this, "Grant 'Display over other apps' for Clash Manager, then return here", Toast.LENGTH_LONG).show();
                    try {
                        try {
                            MainActivity.this.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + MainActivity.this.getPackageName())));
                        } catch (Exception unused) {
                            MainActivity.this.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
                        }
                    } catch (Exception unused2) {
                        Toast.makeText(MainActivity.this, "Please grant 'Display over other apps' in system settings", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void saveCoordinates(final float inviteX, final float inviteY, final float closeX, final float closeY) {
            MainActivity.this.getSharedPreferences("blitz_prefs", 0).edit()
                .putFloat("invite_x", inviteX)
                .putFloat("invite_y", inviteY)
                .putFloat("close_x", closeX)
                .putFloat("close_y", closeY)
                .apply();
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, "Coordinates updated successfully", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public String getCoordinates() {
            // Defaults must stay numerically identical to ClashManagerAccessibilityService's
            // DEFAULT_INVITE_*/DEFAULT_CLOSE_* - previously drifted (0.7214/0.2044 here vs.
            // 0.7218/0.204 there), so the Settings UI showed calibration markers in a
            // different spot than where the accessibility service would actually tap.
            return "{\"inviteX\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("invite_x", 0.5083f)
                + ",\"inviteY\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("invite_y", 0.7218f)
                + ",\"closeX\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("close_x", 0.9213f)
                + ",\"closeY\":" + MainActivity.this.getSharedPreferences("blitz_prefs", 0).getFloat("close_y", 0.204f) + "}";
        }

        @JavascriptInterface
        public boolean isAccessibilityActive() {
            return ClashManagerAccessibilityService.isActive();
        }

        @JavascriptInterface
        public void openAccessibilitySettings() {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        MainActivity.this.startActivity(intent);
                    } catch (Exception e) {
                        e.printStackTrace();
                        Toast.makeText(MainActivity.this, "Could not open Accessibility Settings", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
    }
}
