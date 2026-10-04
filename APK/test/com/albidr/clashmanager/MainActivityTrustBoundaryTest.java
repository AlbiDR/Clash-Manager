// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
package com.albidr.clashmanager;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import org.junit.Test;

/**
 * Pins MainActivity's pure URL and release-artifact boundary checks. These are
 * deliberately reached by reflection so the native bridge exposes no extra
 * API merely to support JVM tests.
 */
public class MainActivityTrustBoundaryTest {

    private static boolean callBoolean(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = MainActivity.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        try {
            return (Boolean) method.invoke(null, args);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception) throw (Exception) cause;
            throw new AssertionError(cause);
        }
    }

    private static boolean isTrustedWebOrigin(String url, String scheme, String host, int port) throws Exception {
        return callBoolean("isTrustedWebOrigin",
            new Class<?>[] { String.class, String.class, String.class, int.class }, url, scheme, host, port);
    }

    private static boolean isValidApkFilename(String filename) throws Exception {
        return callBoolean("isValidApkFilename", new Class<?>[] { String.class }, filename);
    }

    private static boolean isValidSha256(String checksum) throws Exception {
        return callBoolean("isValidSha256", new Class<?>[] { String.class }, checksum);
    }

    private static boolean isAllowedApkDownloadUrl(String url, String filename, String trustedHost) throws Exception {
        return callBoolean("isAllowedApkDownloadUrl",
            new Class<?>[] { String.class, String.class, String.class }, url, filename, trustedHost);
    }

    @Test
    public void bridgeTrustRequiresTheExactConfiguredWebOrigin() throws Exception {
        assertTrue(isTrustedWebOrigin(
            "https://albidr.github.io/Clash-Manager/#/roster", "https", "albidr.github.io", 443));
        assertTrue(isTrustedWebOrigin(
            "https://ALBIDR.GITHUB.IO:443/Clash-Manager/", "https", "albidr.github.io", 443));

        assertFalse(isTrustedWebOrigin(
            "http://albidr.github.io/Clash-Manager/", "https", "albidr.github.io", 443));
        assertFalse(isTrustedWebOrigin(
            "https://albidr.github.io:444/Clash-Manager/", "https", "albidr.github.io", 443));
        assertFalse(isTrustedWebOrigin(
            "https://albidr.github.io.evil.example/Clash-Manager/", "https", "albidr.github.io", 443));
        assertFalse(isTrustedWebOrigin("about:blank", "https", "albidr.github.io", 443));
        assertFalse(isTrustedWebOrigin(
            "https://user@albidr.github.io/Clash-Manager/", "https", "albidr.github.io", 443));
    }

    @Test
    public void theGenericOriginHelperStillRepresentsCMDevsExactLocalOrigin() throws Exception {
        // configureTrustedOrigin() only permits http when the APK is marked
        // debuggable. This helper independently pins the exact port comparison
        // needed for that supported CM Dev workflow.
        assertTrue(isTrustedWebOrigin("http://localhost:5173/Clash-Manager/", "http", "localhost", 5173));
        assertFalse(isTrustedWebOrigin("http://localhost:5174/Clash-Manager/", "http", "localhost", 5173));
    }

    @Test
    public void nativeInstallationRequiresACanonicalReleaseFilenameAndChecksum() throws Exception {
        assertTrue(isValidApkFilename("clashmanager-v14.50.135+440.apk"));
        assertFalse(isValidApkFilename("clashmanager-v14.50.135+440.apk.bak"));
        assertFalse(isValidApkFilename("../clashmanager-v14.50.135+440.apk"));
        assertFalse(isValidApkFilename("clashmanager-v14.50.135+440.apk\nother.apk"));

        String digest = "3606221b5c3b91415aac256cde44175543ff93a6d33a5914b6bb562bf1e92fef";
        assertTrue(isValidSha256(digest));
        assertTrue(isValidSha256(digest.toUpperCase()));
        assertFalse(isValidSha256(null));
        assertFalse(isValidSha256(digest.substring(1)));
        assertFalse(isValidSha256(digest + "00"));
        assertFalse(isValidSha256(digest.substring(0, 63) + "z"));
    }

    @Test
    public void nativeUpdaterAcceptsOnlyTheTwoCanonicalReleaseLocations() throws Exception {
        String filename = "clashmanager-v14.50.135+440.apk";
        String trustedHost = "albidr.github.io";

        assertTrue(isAllowedApkDownloadUrl(
            "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.50.135%2B440.apk",
            filename, trustedHost));
        assertTrue(isAllowedApkDownloadUrl(
            "https://albidr.github.io/Clash-Manager/apk/release/clashmanager-v14.50.135%2B440.apk",
            filename, trustedHost));

        assertFalse(isAllowedApkDownloadUrl(
            "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Nightly/APK/release/clashmanager-v14.50.135%2B440.apk",
            filename, trustedHost));
        assertFalse(isAllowedApkDownloadUrl(
            "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.50.135%2B440.apk?cache=1",
            filename, trustedHost));
        assertFalse(isAllowedApkDownloadUrl(
            "https://albidr.github.io/Clash-Manager/apk/release/clashmanager-v14.50.135%2B440.apk#fragment",
            filename, trustedHost));
        assertFalse(isAllowedApkDownloadUrl(
            "https://albidr.github.io@updates.example/Clash-Manager/apk/release/clashmanager-v14.50.135%2B440.apk",
            filename, trustedHost));
        assertFalse(isAllowedApkDownloadUrl(
            "https://updates.example/clashmanager-v14.50.135%2B440.apk", filename, trustedHost));
        assertFalse(isAllowedApkDownloadUrl(
            "http://albidr.github.io/Clash-Manager/apk/release/clashmanager-v14.50.135%2B440.apk",
            filename, trustedHost));
        assertFalse(isAllowedApkDownloadUrl(
            "https://albidr.github.io/Clash-Manager/apk/release/clashmanager-v14.50.135%2B440.apk",
            "clashmanager-v14.50.134+439.apk", trustedHost));
    }
}
