package com.indieadnetwork.sample;

import android.app.Activity;
import android.graphics.Color;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.indieadnetwork.sdk.IndieAdDemand;
import com.indieadnetwork.sdk.IndieAdEvent;
import com.indieadnetwork.sdk.IndieAdPlacement;
import com.indieadnetwork.sdk.IndieAdResult;
import com.indieadnetwork.sdk.IndieAds;
import com.indieadnetwork.sdk.IndieAdsConfig;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * A game, as far as the SDK can tell: an OpenGL ES surface it draws on (a colour going round), with three buttons over
 * it. Interstitial and More games are tapped on the main thread; Rewarded is shown from the GL thread, as a game whose
 * code is C++ under a thin Java layer would call it. The log under them is everything the SDK says.
 *
 * It runs in test mode against the live catalogue: every ad can be shown, and nothing is counted.
 */
public class MainActivity extends Activity {

    private static final String REWARDED = "FreeCoins", INTERSTITIAL = "LevelEnd";

    private GLSurfaceView game;
    private TextView status, log;
    private volatile boolean gamePaused;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        buildScreen();

        IndieAds.setListener(new IndieAds.Listener() {
            @Override public void onEvent(IndieAdEvent event) { say(event.toString()); }
            @Override public void onShown() { gamePaused = true; say("onShown: the game pauses"); }
            @Override public void onHidden() { gamePaused = false; say("onHidden: the game resumes"); }
            @Override public void onDemandChanged() { showDemand(); }
        });

        IndieAdsConfig config = new IndieAdsConfig();
        config.host = "android-sample";
        config.catalogueUrl = "https://indieadnetwork.com/catalogue.json";
        config.placements = new IndieAdPlacement[] {
            IndieAdPlacement.rewarded(REWARDED).maxSecs(30).reward("100 coins"),
            IndieAdPlacement.interstitial(INTERSTITIAL).maxSecs(30).minSecs(5),
        };
        config.test = true;   // every ad can be shown, and nothing is sent to the ingest: never in a player's game
        config.log = true;    // logcat, tag IndieAds
        IndieAds.init(this, config);
        say("IndieAds " + IndieAds.VERSION + " started");
    }

    private void showInterstitial() {
        // Every tap is the network's here. A real game with a paid network calls IndieAds.showIfWanted instead, and shows
        // the paid network's ad when result.shown is false.
        boolean showing = IndieAds.show(INTERSTITIAL, new IndieAds.ShowCallback() {
            @Override public void onDone(IndieAdResult result) { say("interstitial done: " + result); }
        });
        if (!showing) say("interstitial: nothing to show");
    }

    private void showRewarded() {
        // From the game's own thread: the SDK takes it to the main thread, and calls back there.
        game.queueEvent(new Runnable() {
            @Override public void run() {
                boolean showing = IndieAds.show(REWARDED, new IndieAds.ShowCallback() {
                    @Override public void onDone(IndieAdResult result) { say(result.granted ? "rewarded: 100 coins earned" : "rewarded done, no reward: " + result); }
                });
                if (!showing) say("rewarded: nothing to show");
            }
        });
    }

    private void showMoreGames() {
        if (!IndieAds.showMoreGames(IndieAds.OpenIn.GAME)) say("more games: no page yet");
    }

    private void showDemand() {
        IndieAdDemand r = IndieAds.demand(REWARDED), i = IndieAds.demand(INTERSTITIAL);
        status.setText("rewarded: " + r.available + " available, share " + r.share + "\ninterstitial: " + i.available + " available, share " + i.share);
    }

    // ---- the screen ----

    private void buildScreen() {
        FrameLayout root = new FrameLayout(this);
        game = new GLSurfaceView(this);
        game.setEGLContextClientVersion(2);
        game.setRenderer(new Spinner());
        root.addView(game);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(24);
        column.setPadding(pad, dp(64), pad, pad);
        column.addView(button("Interstitial", new View.OnClickListener() { @Override public void onClick(View v) { showInterstitial(); } }));
        column.addView(button("Rewarded", new View.OnClickListener() { @Override public void onClick(View v) { showRewarded(); } }));
        column.addView(button("More games", new View.OnClickListener() { @Override public void onClick(View v) { showMoreGames(); } }));
        status = text(14);
        status.setText("waiting for the catalogue…");
        column.addView(status);
        ScrollView scroll = new ScrollView(this);
        log = text(11);
        scroll.addView(log);
        column.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        root.addView(column);
        setContentView(root);
    }

    private Button button(String label, View.OnClickListener tap) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(18);
        b.setOnClickListener(tap);
        LinearLayout.LayoutParams at = new LinearLayout.LayoutParams(dp(240), dp(56));
        at.bottomMargin = dp(12);
        b.setLayoutParams(at);
        return b;
    }

    private TextView text(int sp) {
        TextView t = new TextView(this);
        t.setTextColor(Color.WHITE);
        t.setShadowLayer(3, 0, 1, Color.BLACK);
        t.setTextSize(sp);
        t.setPadding(0, dp(8), 0, 0);
        return t;
    }

    private int dp(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    // From any thread: on the screen and in logcat.
    private void say(final String line) {
        Log.i("IndieAdsSample", line);
        runOnUiThread(new Runnable() {
            @Override public void run() { log.setText(line + "\n" + log.getText()); }
        });
    }

    @Override protected void onPause() {
        super.onPause();
        game.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        game.onResume();
    }

    // Full screen, as a game is: the ads are laid over the whole of the activity, system bars and all.
    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (!focused) return;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController bars = getWindow().getInsetsController();
            if (bars != null) {
                bars.hide(WindowInsets.Type.systemBars());
                bars.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    // The game itself: a colour going round, which stands still while an ad is up (onShown, onHidden).
    private final class Spinner implements GLSurfaceView.Renderer {
        private float hue;
        private long last = SystemClock.elapsedRealtime();

        @Override public void onSurfaceCreated(GL10 unused, EGLConfig config) {}

        @Override public void onSurfaceChanged(GL10 unused, int width, int height) { GLES20.glViewport(0, 0, width, height); }

        @Override public void onDrawFrame(GL10 unused) {
            long now = SystemClock.elapsedRealtime();
            if (!gamePaused) hue = (hue + (now - last) * 0.03f) % 360;
            last = now;
            int c = Color.HSVToColor(new float[] { hue, 0.6f, 0.45f });
            GLES20.glClearColor(Color.red(c) / 255f, Color.green(c) / 255f, Color.blue(c) / 255f, 1);
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
        }
    }
}
