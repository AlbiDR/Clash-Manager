package com.albidr.clashmanager;

import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import java.util.HashMap;
import java.util.Map;

/* JADX INFO: loaded from: /Users/ADR/Documents/Github/Projects/clash-manager/APK/android/classes.dex */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    @Override // com.google.androidbrowserhelper.trusted.LauncherActivity
    protected Map<String, Uri> getProtocolHandlers() {
        HashMap map = new HashMap();
        map.put("web+clash", Uri.parse("https://albidr.github.io/Clash-Manager/#/headhunter?query=%s"));
        return map;
    }

    @Override // com.google.androidbrowserhelper.trusted.LauncherActivity, android.app.Activity
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        if (Build.VERSION.SDK_INT > 26) {
            setRequestedOrientation(-1);
        } else {
            setRequestedOrientation(-1);
        }
    }

    @Override // com.google.androidbrowserhelper.trusted.LauncherActivity
    protected Uri getLaunchingUrl() {
        return super.getLaunchingUrl();
    }
}
