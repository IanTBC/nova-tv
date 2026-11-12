package com.ianbrown.novatv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Iterator;

public class MainActivity extends Activity {
    static final int SHELL_API = 2;
    static final String UPDATE_BASE = "https://raw.githubusercontent.com/IanTBC/nova-tv/main/update/";
    static final int DESIGN_WIDTH = 1440; // CSS pixels the UI is laid out at

    WebView web;
    final Handler ui = new Handler(Looper.getMainLooper());
    String defaultUa;
    long lastBack = 0;
    volatile boolean checking = false;
    JSONObject pendingApk = null;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(10, 13, 25));
        setContentView(web);
        hideBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // IPTV panels send no CORS headers: let the app read them directly (like the Mac app)
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        defaultUa = s.getUserAgentString();
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        // lay the UI out at 1440 CSS px wide whatever the TV resolution
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int w = Math.max(dm.widthPixels, dm.heightPixels);
        web.setInitialScale(Math.max(1, (int) Math.floor(w * 100.0 / DESIGN_WIDTH)));

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return !(url.startsWith("file:") || url.startsWith("about:"));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public Bitmap getDefaultVideoPoster() { return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888); }
        });
        web.addJavascriptInterface(new Bridge(), "NovaAndroid");
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.requestFocus();
        web.loadUrl(activeUiUrl());

        ui.postDelayed(() -> new Thread(() -> checkForUpdates(false)).start(), 6000);
    }

    void hideBars() {
        if (Build.VERSION.SDK_INT >= 19) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideBars(); }

    @Override
    protected void onPause() { super.onPause(); if (web != null) web.evaluateJavascript("try{document.getElementById('video')&&!document.getElementById('player').classList.contains('hidden')&&document.getElementById('video').pause()}catch(e){}", null); }

    @Override
    protected void onDestroy() { if (web != null) web.destroy(); super.onDestroy(); }

    /* ---------------- remote keys ---------------- */
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int k = e.getKeyCode();
        if (k == KeyEvent.KEYCODE_BACK || k == KeyEvent.KEYCODE_ESCAPE) {
            if (e.getAction() == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("(window.__tvBack ? window.__tvBack() : false)", v -> {
                    if (!"true".equals(v)) {
                        long now = System.currentTimeMillis();
                        if (now - lastBack < 2000) finish();
                        else { lastBack = now; Toast.makeText(this, "Press Back again to exit Nova TV", Toast.LENGTH_SHORT).show(); }
                    }
                });
            }
            return true;
        }
        String js = null;
        switch (k) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case KeyEvent.KEYCODE_MEDIA_PLAY: case KeyEvent.KEYCODE_MEDIA_PAUSE: js = "MediaPlayPause"; break;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: js = "MediaFastForward"; break;
            case KeyEvent.KEYCODE_MEDIA_REWIND: js = "MediaRewind"; break;
            case KeyEvent.KEYCODE_CHANNEL_UP: js = "ArrowUp"; break;
            case KeyEvent.KEYCODE_CHANNEL_DOWN: js = "ArrowDown"; break;
        }
        if (js != null) {
            if (e.getAction() == KeyEvent.ACTION_DOWN)
                web.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'" + js + "',bubbles:true}))", null);
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    /* ---------------- JS bridge ---------------- */
    void emit(String type, String json) {
        ui.post(() -> web.evaluateJavascript("window.__novaEvt && window.__novaEvt('" + type + "'," + json + ")", null));
    }

    class Bridge {
        @JavascriptInterface
        public void setUserAgent(String key) {
            String ua;
            switch (key == null ? "" : key) {
                case "vlc": ua = "VLC/3.0.20 LibVLC/3.0.20"; break;
                case "smarters": ua = "IPTVSmartersPro"; break;
                case "tivimate": ua = "TiviMate/4.7.0 (Android 11)"; break;
                default: ua = defaultUa;
            }
            final String u = ua;
            ui.post(() -> web.getSettings().setUserAgentString(u));
        }

        @JavascriptInterface
        public String openExternal(String url) {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(Uri.parse(url), "video/*");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { i.setPackage("org.videolan.vlc"); startActivity(i); }
                catch (ActivityNotFoundException e) { i.setPackage(null); startActivity(Intent.createChooser(i, "Play with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                return "{\"ok\":true}";
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"VLC is not installed\"}";
            }
        }

        @JavascriptInterface
        public void openLink(String url) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public String versions() {
            try {
                JSONObject o = new JSONObject();
                o.put("shell", BuildConfig.VERSION_NAME);
                o.put("api", SHELL_API);
                o.put("ui", activeUiVersion());
                o.put("arch", "android-tv");
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public void checkUpdates() { new Thread(() -> checkForUpdates(true)).start(); }

        @JavascriptInterface
        public void installUpdate() { new Thread(MainActivity.this::installApk).start(); }

        @JavascriptInterface
        public void reloadUi() { ui.post(() -> web.loadUrl(activeUiUrl())); }

        @JavascriptInterface
        public void showKeyboard() {
            ui.post(() -> {
                InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(web, InputMethodManager.SHOW_IMPLICIT);
            });
        }
    }

    /* ---------------- UI bundles (same update feed as the Mac app) ---------------- */
    File uiRoot() { File f = new File(getFilesDir(), "ui"); f.mkdirs(); return f; }

    String bundledUiVersion() {
        try (InputStream in = getAssets().open("app/version.json")) {
            return new JSONObject(new String(readAll(in), StandardCharsets.UTF_8)).optString("version", "0.0.0");
        } catch (Exception e) { return "0.0.0"; }
    }

    JSONObject currentJson() {
        try { return new JSONObject(new String(readFile(new File(uiRoot(), "current.json")), StandardCharsets.UTF_8)); }
        catch (Exception e) { return null; }
    }

    String activeUiVersion() {
        JSONObject c = currentJson();
        if (c != null && cmpVer(c.optString("version"), bundledUiVersion()) > 0 && c.optInt("minShell", 0) <= SHELL_API
                && new File(new File(uiRoot(), c.optString("version")), "index.html").exists()) return c.optString("version");
        return bundledUiVersion();
    }

    String activeUiUrl() {
        String v = activeUiVersion();
        if (!v.equals(bundledUiVersion())) return Uri.fromFile(new File(new File(uiRoot(), v), "index.html")).toString();
        return "file:///android_asset/app/index.html";
    }

    void checkForUpdates(boolean manual) {
        if (checking) { if (manual) emit("check", "{\"status\":\"busy\"}"); return; }
        checking = true;
        JSONObject res = new JSONObject();
        try {
            res.put("status", "latest");
            res.put("shell", BuildConfig.VERSION_NAME);
            JSONObject m = new JSONObject(new String(get(UPDATE_BASE + "manifest.json"), StandardCharsets.UTF_8));

            JSONObject an = m.optJSONObject("android");
            if (an != null && an.optInt("versionCode", 0) > BuildConfig.VERSION_CODE) {
                pendingApk = an;
                JSONObject ev = new JSONObject();
                ev.put("version", an.optString("version"));
                ev.put("notes", an.optString("notes"));
                emit("shell", ev.toString());
                res.put("status", "shell");
            }

            JSONObject u = m.optJSONObject("ui");
            res.put("ui", activeUiVersion());
            if (u != null && cmpVer(u.optString("version"), activeUiVersion()) > 0 && u.optInt("minShell", 0) <= SHELL_API) {
                String url = u.optString("url");
                byte[] buf = get(url.startsWith("http") ? url : UPDATE_BASE + url);
                String sha = u.optString("sha256", "");
                if (!sha.isEmpty() && !sha.equalsIgnoreCase(sha256(buf))) throw new Exception("Update file was corrupted");
                JSONObject files = new JSONObject(new String(buf, StandardCharsets.UTF_8)).getJSONObject("files");
                String ver = u.optString("version");
                File dir = new File(uiRoot(), ver);
                dir.mkdirs();
                String base = dir.getCanonicalPath() + File.separator;
                Iterator<String> it = files.keys();
                while (it.hasNext()) {
                    String rel = it.next();
                    File out = new File(dir, rel);
                    if (!out.getCanonicalPath().startsWith(base)) continue;
                    out.getParentFile().mkdirs();
                    try (FileOutputStream fo = new FileOutputStream(out)) { fo.write(android.util.Base64.decode(files.getString(rel), android.util.Base64.DEFAULT)); }
                }
                JSONObject cur = new JSONObject();
                cur.put("version", ver);
                cur.put("minShell", u.optInt("minShell", 0));
                try (FileOutputStream fo = new FileOutputStream(new File(uiRoot(), "current.json"))) { fo.write(cur.toString().getBytes(StandardCharsets.UTF_8)); }
                // keep the 2 newest
                File[] vs = uiRoot().listFiles(f -> f.isDirectory() && f.getName().matches("\\d+\\.\\d+\\.\\d+"));
                if (vs != null && vs.length > 2) {
                    Arrays.sort(vs, (a, b2) -> cmpVer(a.getName(), b2.getName()));
                    for (int i = 0; i < vs.length - 2; i++) deleteTree(vs[i]);
                }
                JSONObject ev = new JSONObject();
                ev.put("version", ver);
                ev.put("notes", u.optString("notes"));
                emit("ui", ev.toString());
                if ("latest".equals(res.optString("status"))) res.put("status", "ui");
                res.put("ui", ver);
            }
        } catch (Exception e) {
            try { res.put("status", "error"); res.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) {}
        } finally {
            checking = false;
        }
        if (manual) emit("check", res.toString());
    }

    /* ---------------- full app (APK) update ---------------- */
    void installApk() {
        try {
            if (pendingApk == null) { emit("install", "{\"ok\":false,\"error\":\"No update found\"}"); return; }
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                ui.post(() -> {
                    Toast.makeText(this, "Allow Nova TV to install updates, then press Back and try again", Toast.LENGTH_LONG).show();
                    try { startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) {}
                });
                emit("install", "{\"ok\":false,\"error\":\"Allow installs for Nova TV, then try again\"}");
                return;
            }
            byte[] apk = get(pendingApk.getString("url"));
            String sha = pendingApk.optString("sha256", "");
            if (!sha.isEmpty() && !sha.equalsIgnoreCase(sha256(apk))) throw new Exception("Download was corrupted");
            File dir = new File(getCacheDir(), "updates");
            dir.mkdirs();
            File f = new File(dir, "nova-tv.apk");
            try (FileOutputStream fo = new FileOutputStream(f)) { fo.write(apk); }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ui.post(() -> startActivity(i));
            emit("install", "{\"ok\":true}");
        } catch (Exception e) {
            emit("install", "{\"ok\":false,\"error\":" + JSONObject.quote("Update failed: " + e.getMessage()) + "}");
        }
    }

    /* ---------------- helpers ---------------- */
    static byte[] get(String url) throws Exception {
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(60000);
            c.setRequestProperty("Cache-Control", "no-cache");
            c.setInstanceFollowRedirects(true);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) { url = c.getHeaderField("Location"); continue; }
            if (code != 200) throw new Exception("HTTP " + code);
            try (InputStream in = c.getInputStream()) { return readAll(in); }
        }
        throw new Exception("Too many redirects");
    }

    static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] b = new byte[65536];
        int n;
        while ((n = in.read(b)) > 0) bo.write(b, 0, n);
        return bo.toByteArray();
    }

    static byte[] readFile(File f) throws Exception {
        try (InputStream in = new java.io.FileInputStream(f)) { return readAll(in); }
    }

    static String sha256(byte[] b) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : d) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    static int cmpVer(String a, String b) {
        String[] x = (a == null ? "0" : a).split("\\."), y = (b == null ? "0" : b).split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? parse(x[i]) : 0, q = i < y.length ? parse(y[i]) : 0;
            if (p != q) return p < q ? -1 : 1;
        }
        return 0;
    }

    static int parse(String s) { try { return Integer.parseInt(s.replaceAll("\\D", "")); } catch (Exception e) { return 0; } }

    static void deleteTree(File f) {
        File[] k = f.listFiles();
        if (k != null) for (File c : k) deleteTree(c);
        f.delete();
    }
}
