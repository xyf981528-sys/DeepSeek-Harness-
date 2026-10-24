package com.dsh.filestation;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Menu;
import android.view.MenuItem;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JsResult;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/** 文件传输台的 Android WebView 壳：加载手机页，处理文件选择与下载。 */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 1001;
    private WebView web;
    private TextView status;
    private ValueCallback<Uri[]> fileCallback;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("fs", MODE_PRIVATE);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this);
        status.setTextSize(12);
        status.setPadding(28, 18, 28, 18);
        status.setTextColor(0xFF9FB3C8);
        status.setBackgroundColor(0xFF0A0E13);
        status.setText("正在启动…");
        root.addView(status, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        web = new WebView(this);
        web.setBackgroundColor(0xFF0A0E13);
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
        if (getActionBar() != null) getActionBar().setTitle("文件传输台");

        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ android.Manifest.permission.WRITE_EXTERNAL_STORAGE }, 9);
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) cm.setAcceptThirdPartyCookies(web, true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " DSHFileStationApp/1.1");
        WebView.setWebContentsDebuggingEnabled(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                String self = null;
                try { self = Uri.parse(view.getUrl()).getHost(); } catch (Exception e) { /* ignore */ }
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    // 下载链接交给系统浏览器：APK 内 WebView 的 DownloadManager 在部分机型会失败，
                    // 浏览器路径与手机网页一致，且 ticket URL 不依赖 Cookie。
                    if (u.getPath() != null && u.getPath().startsWith("/download")) {
                        openInBrowser(u);
                        return true;
                    }
                    if (self != null && host.equals(self)) return false;
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* ignore */ }
                    return true;
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                status.setText("正在加载 " + url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (status.getText().toString().startsWith("正在加载")) status.setText("已加载 " + url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    status.setText("加载失败：" + error.getDescription() + "\n" + request.getUrl());
                }
            }

            @Override
            public void onReceivedSslError(WebView view, final SslErrorHandler handler, SslError error) {
                handler.cancel();
                status.setText("HTTPS 证书不受信任：" + (error == null ? "" : error.getUrl()));
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("HTTPS 证书不受信任")
                        .setMessage("这个地址需要手机先安装证书。可以改用 HTTP 端口直接打开。")
                        .setPositiveButton("改用 HTTP", (d, w) -> openHttpVersion())
                        .setNegativeButton("取消", null)
                        .show();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                if (params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(Intent.createChooser(i, "选择文件"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("好", (d, w) -> result.confirm())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }
        });

        web.setDownloadListener((url, ua, cd, mime, len) -> {
            openInBrowser(Uri.parse(url));
        });

        String url = prefs.getString("url", "");
        if (url.isEmpty()) promptUrl();
        else web.loadUrl(url);
    }

    private void openInBrowser(Uri uri) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            Toast.makeText(this, "已交给浏览器下载", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "没有可用的浏览器：" + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void openHttpVersion() {
        String u = web.getUrl();
        if (u == null) u = prefs.getString("url", "");
        String v = u.replaceFirst("^https://", "http://").replace(":19791", ":19790");
        if (v.equals(u) || v.isEmpty()) {
            status.setText("地址里没有 19791，请检查端口后重新设置");
            return;
        }
        prefs.edit().putString("url", v).apply();
        web.loadUrl(v);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] out = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        int n = data.getClipData().getItemCount();
                        out = new Uri[n];
                        for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
                    } else if (data.getData() != null) {
                        out = new Uri[]{ data.getData() };
                    }
                }
                fileCallback.onReceiveValue(out);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void promptUrl() {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("http://电脑IP:19790/?k=访问码");
        input.setText(prefs.getString("url", ""));
        new AlertDialog.Builder(this)
                .setTitle("连接地址")
                .setMessage("在 DSH 面板点「显示连接地址」。局域网用 http://IP:19790/?k=…；不要用 19791（需要证书）。")
                .setView(input)
                .setPositiveButton("保存并打开", (d, w) -> {
                    String u = input.getText().toString().trim();
                    if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://" + u;
                    prefs.edit().putString("url", u).apply();
                    web.loadUrl(u);
                })
                .setNegativeButton("取消", null)
                .show();
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(0, 1, 0, "设置地址");
        menu.add(0, 2, 1, "用 HTTP 打开");
        menu.add(0, 3, 2, "重新加载");
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == 1) { promptUrl(); return true; }
        if (item.getItemId() == 2) { openHttpVersion(); return true; }
        if (item.getItemId() == 3) { web.reload(); return true; }
        return super.onOptionsItemSelected(item);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
