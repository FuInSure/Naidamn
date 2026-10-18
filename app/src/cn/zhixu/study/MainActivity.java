package cn.zhixu.study;

import android.app.Activity;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Map;

/** Local-only Android shell. No INTERNET or storage permission is requested. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;
    private static final int SAVE_NOTES = 408, OPEN_NOTES = 409;
    private final AtomicBoolean importing = new AtomicBoolean(false);
    private final AtomicBoolean exporting = new AtomicBoolean(false);
    private byte[] pendingNotes;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(247,246,240));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root.setOnApplyWindowInsetsListener((view,insets)->{
            view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(247,246,240));
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setTextZoom(100);
        // The book reader handles its own pinch and pan without scaling the app UI.
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri u=request.getUrl();
                if(!"https".equals(u.getScheme()) || !HOST.equals(u.getHost()) || !"GET".equals(request.getMethod())) return blocked();
                String path=u.getPath();
                if(path==null||!path.startsWith("/assets/")||path.contains("..")||path.contains("\\"))return blocked();
                String name=path.substring(8);
                try {
                    String mime=name.endsWith(".html")?"text/html":name.endsWith(".css")?"text/css":name.endsWith(".js")?"application/javascript":name.endsWith(".webp")?"image/webp":name.endsWith(".png")?"image/png":"application/octet-stream";
                    Map<String,String> headers=new HashMap<>();
                    headers.put("Cache-Control","no-cache");
                    headers.put("X-Content-Type-Options","nosniff");
                    headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'");
                    return new WebResourceResponse(mime,name.endsWith(".webp")?null:"UTF-8",200,"OK",headers,getAssets().open(name));
                } catch(Exception e){return blocked();}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){return true;}
        });
        web.addJavascriptInterface(new NoteExportBridge(),"NaidamnExport");
        web.loadUrl("https://"+HOST+"/assets/index.html");
    }
    /** Exposes only user-triggered note backup import and export; the WebView loads local app assets only. */
    public final class NoteExportBridge {
        @JavascriptInterface public boolean pickNotes(){
            if(!importing.compareAndSet(false,true))return false;
            runOnUiThread(()->{
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");
                try{startActivityForResult(intent,OPEN_NOTES);}catch(Exception e){finishNoteImport("","error");}
            });return true;
        }
        @JavascriptInterface public boolean saveNotes(String name,String json){
            try {
                if(name==null || !name.matches("Naidamn-notes-(all|ds|co|os|net)-[0-9-]+\\.json") || json==null || json.length()>20*1024*1024)return false;
                JSONObject data=new JSONObject(json);
                if(!"naidamn-handwriting-backup".equals(data.getString("format")) || data.getInt("version")!=1 || data.getJSONArray("notes").length()==0)return false;
                byte[] bytes=json.getBytes(StandardCharsets.UTF_8);
                if(bytes.length>20*1024*1024 || !exporting.compareAndSet(false,true))return false;
                runOnUiThread(()->{
                    pendingNotes=bytes;
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");intent.putExtra(Intent.EXTRA_TITLE,name);
                    try{startActivityForResult(intent,SAVE_NOTES);}catch(Exception e){finishNoteExport("error");}
                });
                return true;
            }catch(Exception e){return false;}
        }
    }
    private void finishNoteExport(String status){
        pendingNotes=null;exporting.set(false);
        if(web!=null)web.evaluateJavascript("window.EbookTools && EbookTools.exportStatus("+JSONObject.quote(status)+");",null);
    }
    private void finishNoteImport(String text,String status){
        importing.set(false);
        if(web!=null)web.evaluateJavascript("window.EbookTools && EbookTools.receiveImport("+JSONObject.quote(text)+","+JSONObject.quote(status)+");",null);
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==OPEN_NOTES){
            if(result!=RESULT_OK){finishNoteImport("","cancelled");return;}
            final Uri input=data==null?null:data.getData();
            if(input==null){finishNoteImport("","error");return;}
            new Thread(()->{
                String text="",status="ready";
                try(java.io.InputStream stream=getContentResolver().openInputStream(input);java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){
                    if(stream==null)throw new java.io.IOException("No input stream");
                    byte[] buffer=new byte[8192];int count,total=0;
                    while((count=stream.read(buffer))!=-1){total+=count;if(total>20*1024*1024)throw new java.io.IOException("Too large");out.write(buffer,0,count);}
                    text=new String(out.toByteArray(),StandardCharsets.UTF_8);
                }catch(Exception e){status="error";}
                final String contents=text,outcome=status;runOnUiThread(()->finishNoteImport(contents,outcome));
            },"note-import").start();return;
        }
        if(request!=SAVE_NOTES)return;
        if(result!=RESULT_OK){finishNoteExport("cancelled");return;}
        Uri uri=data==null?null:data.getData();byte[] bytes=pendingNotes;
        if(uri==null || bytes==null){finishNoteExport("error");return;}
        new Thread(()->{
            String status="saved";
            try(OutputStream stream=getContentResolver().openOutputStream(uri,"wt")){
                if(stream==null)throw new java.io.IOException("No output stream");
                stream.write(bytes);stream.flush();
            }catch(Exception e){status="error";}
            final String outcome=status;runOnUiThread(()->finishNoteExport(outcome));
        },"note-export").start();
    }
    private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",null,new ByteArrayInputStream(new byte[0]));}
    @Override public void onBackPressed(){web.evaluateJavascript("window.handleBack ? window.handleBack() : false",value->{if(!"true".equals(value))finish();});}
    @Override protected void onPause(){super.onPause();if(web!=null){web.evaluateJavascript("if (typeof saveReaderPosition === 'function') saveReaderPosition();",null);web.onPause();}}
    @Override protected void onResume(){super.onResume();if(web!=null){web.onResume();web.evaluateJavascript("if (typeof checkWeeklyReport === 'function') checkWeeklyReport();",null);}}
    @Override protected void onDestroy(){if(web!=null){web.destroy();web=null;}super.onDestroy();}
}
