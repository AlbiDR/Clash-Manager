// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import android.net.Uri;
import android.os.Bundle;
import java.util.HashMap;
import java.util.Map;

/**
 * Dormant TWA launcher scaffolding, retained but not the app's actual launcher
 * (MainActivity is - see AndroidManifest.xml's LAUNCHER intent-filter).
 */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    @Override
    protected Map<String, Uri> getProtocolHandlers() {
        HashMap<String, Uri> map = new HashMap<>();
        map.put("web+clash", Uri.parse("https://albidr.github.io/Clash-Manager/#/headhunter?query=%s"));
        return map;
    }

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        setRequestedOrientation(-1);
    }

    @Override
    protected Uri getLaunchingUrl() {
        return super.getLaunchingUrl();
    }
}
