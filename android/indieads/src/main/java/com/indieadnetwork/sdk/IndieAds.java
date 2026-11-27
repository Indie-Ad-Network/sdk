package com.indieadnetwork.sdk;

import android.app.Activity;
import android.app.Application;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.content.res.Configuration;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Indie Ad Network in a native Android game: our own and our friends' games, as rewarded ads and interstitials, beside
 * whatever paid network the game has.
 *
 * <pre>
 *   IndieAds.init(activity, config);                        // in onCreate: fetches the catalogue, downloads a few creatives ahead
 *   if (IndieAds.wants("FreeCoins")) {                      // this slot is the house's (demand: share and what's available)
 *       IndieAds.show("FreeCoins", result -&gt; { if (result.granted) … });
 *   } else { …the paid network's }
 * </pre>
 *
 * The share is the network's to say (the catalogue, or the ingest's /mix: what's owed between studios), and is 0 for a
 * player there's nothing to show. So a game asks before every ad and falls back to its paid network on "no".
 *
 * The ads themselves are the SDK's web player (the asset indieads/IndieAdsPlayer.html: core/ in one page, the same page
 * the Unity package plays) in the system's web view, laid over the game's activity. This class is the Unity package's
 * IndieAds.cs, in Java: what the page is told, and what's done with what it says.
 *
 * Every method may be called from any thread (a game's own, its GL thread); the work is done on the main thread, and
 * every callback and listener is called there.
 */
public final class IndieAds {

    public static final String VERSION = "0.6.23";

    /** What the SDK says of itself, for a game that wants to hear it. Every method may be left out. Main thread. */
    public static abstract class Listener {
        /** Every event of the player, for the game's own analytics. */
        public void onEvent(IndieAdEvent event) {}
        /** An ad is on screen, whoever showed it: pause the game's music and sound here. Called once a showing. */
        public void onShown() {}
        /**
         * The ad onShown told of has closed, before show's callback: resume the game's sound here. Not called for an ad
         * that never appeared, so a game only resumes what it paused.
         */
        public void onHidden() {}
        /** What's available, or the share asked for, may have changed. */
        public void onDemandChanged() {}
    }

    public interface ShowCallback {
        void onDone(IndieAdResult result);
    }

    public interface CampaignCallback {
        void onCampaign(String campaign);
    }

    /** Where showMoreGames opens the page of more games. */
    public enum OpenIn {
        /** The device's browser: the player leaves the game for it. */
        BROWSER,
        /** A web view over the game, closed by the page's own ✕ (or the back button). */
        GAME,
    }

    static final String TAG = "IndieAds";
    private static final String PLAYER_ASSET = "indieads/IndieAdsPlayer.html";
    private static final String SHIPPED_ASSET = "indie-ads-catalogue.json";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static volatile IndieAds instance;
    private static volatile Listener listener;   // kept from one session to the next, as the Unity package's events are
    private static String playerPage;            // the asset, read once (main thread)

    // ---- the game's side: any thread ----

    /** Says what happens, to a game that wants to hear it (null: nothing). Kept across shutdown and init. */
    public static void setListener(Listener l) {
        listener = l;
    }

    /**
     * Starts the SDK in `activity` (the game's own, which the ads are laid over), from its onCreate. Again while it's
     * running: nothing. When the activity is destroyed the SDK shuts down, so a game whose activity is made again (say on
     * rotation) calls init again from the new one's onCreate.
     */
    public static void init(Activity activity, IndieAdsConfig config) {
        if (activity == null || config == null) throw new IllegalArgumentException("IndieAds.init: an activity and a config");
        if (config.catalogueUrl == null) throw new IllegalArgumentException("IndieAds.init: the config has no catalogueUrl");
        final IndieAds session;
        synchronized (IndieAds.class) {
            if (instance != null) return;
            session = new IndieAds(activity, config.copy());
            instance = session;
        }
        onMain(new Runnable() { @Override public void run() { session.start(); } });
    }

    /**
     * Stops this session before logout, opt-out or a change of player. An outstanding show completes once, with shown
     * saying whether it appeared and granted false; onHidden comes before it if shown. Safe to call again; init may be
     * called afterwards. The listener is kept; what's kept on the device isn't erased (setConsent is for that).
     */
    public static void shutdown() {
        final IndieAds previous;
        synchronized (IndieAds.class) {
            previous = instance;
            if (previous == null) return;
            instance = null;
        }
        onMain(new Runnable() { @Override public void run() { previous.stopSession(); } });
    }

    public static boolean isInitialised() {
        return instance != null;
    }

    public static boolean isShowing() {
        IndieAds s = instance;
        return s != null && (s.showing || s.showPending);
    }

    /** What there is to show this player in `placement` now, as the page last said: always to hand, without waiting. */
    public static IndieAdDemand demand(String placement) {
        IndieAds s = instance;
        if (s == null || s.showing || s.showPending) return IndieAdDemand.NONE;
        IndieAdDemand d = s.demand.get(placement);
        return d != null ? d : IndieAdDemand.NONE;
    }

    /** Should this slot be the house's? Rolls the share: call once per ad, when it's about to be shown. */
    public static boolean wants(String placement) {
        IndieAdDemand d = demand(placement);
        return d.available > 0 && Math.random() < d.share;
    }

    /**
     * Shows an ad in `placement`. False: nothing will be shown and `done` won't be called. Otherwise `done` is called
     * once, on the main thread, when the ad has closed (or failed to appear: result.shown false).
     */
    public static boolean show(String placement, ShowCallback done) {
        return show(placement, null, done);
    }

    /** `reward`: what watching earns, as the player is told it ("Earned: …"), for this showing; null for the placement's. */
    public static boolean show(final String placement, final String reward, final ShowCallback done) {
        final IndieAds s = instance;
        if (s == null) return false;
        if (onMain()) return !s.showPending && s.doShow(placement, done, reward);
        // From another thread: the answer is the one the main thread will give, as far as it can be known here. Should it
        // turn out otherwise, `done` is told nothing was shown.
        synchronized (s) {
            if (s.stopped || s.showing || s.showPending || !AdWebView.isAvailable()) return false;
            s.showPending = true;
        }
        MAIN.post(new Runnable() {
            @Override public void run() {
                s.showPending = false;
                if (!s.doShow(placement, done, reward) && done != null) s.callDone(done, IndieAdResult.notShown());
            }
        });
        return true;
    }

    /** Turns test mode (IndieAdsConfig.test) on or off. What's available changes with it: onDemandChanged says when it's in. */
    public static void setTest(final boolean on) {
        session(new Session() { @Override public void with(IndieAds s) {
            if (s.config.test == on) return;
            s.config.test = on;
            if (s.view != null) s.call("test", on ? "true" : "false");
            else s.ensurePage();   // a page that's been put away starts again with the new setting
        } });
    }

    /**
     * The player's answer on things being kept on their device (IndieAdsConfig.consent) has changed. The page is made
     * again with it, at once, or when the ad that's up has closed.
     */
    public static void setConsent(final boolean agreed) {
        session(new Session() { @Override public void with(IndieAds s) {
            if (s.config.consent == agreed) return;
            s.config.consent = agreed;
            if (s.showing) s.remake = true;
            else s.remakePage();
        } });
    }

    /** Is the game muted? The next ad starts silent if so. */
    public static void setMuted(final boolean muted) {
        session(new Session() { @Override public void with(IndieAds s) { s.config.muted = muted; } });
    }

    /** The language the player is playing in (IndieAdsConfig.language), from the next ad. */
    public static void setLanguage(final String language) {
        session(new Session() { @Override public void with(IndieAds s) { s.config.language = language; } });
    }

    /**
     * What the game's consent platform (Google's, or any on the IAB's framework) has kept of the player's answer: true
     * (agreed to things being kept on the device, or somewhere that needn't be asked), false (asked, and not agreed), or
     * null where no platform has said, and the game must go by its own means. Ask once the platform's dialog has been
     * answered: {@code config.consent = cmp != null ? cmp : myOwnAnswer}.
     */
    public static Boolean cmpConsent(Context context) {
        return Device.cmpConsent(context);
    }

    /** A placement's button was put in front of the player (once per time it's put there): shows over offers is the opt-in rate. */
    public static void offered(final String placement) {
        session(new Session() { @Override public void with(IndieAds s) {
            // a page that's been put away is made again to hear it: an offer unsaid is an opt-in rate too high
            if (s.ensurePage()) s.call("offered", Wire.quote(placement));
        } });
    }

    /**
     * The address of the network's page of the games this one shows the ads of (the page an ad's ⓘ leads to), for a game
     * that would do something of its own with it. Null until the catalogue is in (a moment after init), where the
     * catalogue names no such page, and for a player the game has said is under 13 (IndieAdsConfig.age).
     */
    public static String getMoreGamesUrl() {
        IndieAds s = instance;
        return s != null ? s.moreGamesUrl : null;
    }

    /**
     * For a "More games" button of the game's own: opens that page, in the device's browser or in a web view over the
     * game with a ✕ of its own. False: there's no page to open (getMoreGamesUrl is null), or an ad is up. In the game's
     * web view the page is shown only once it says it can be closed; one that doesn't in a few seconds, or won't load, is
     * handed to the browser.
     */
    public static boolean showMoreGames(final OpenIn where) {
        final IndieAds s = instance;
        if (s == null || s.showing || s.showPending || s.moreGamesUrl == null) return false;
        onMain(new Runnable() { @Override public void run() {
            if (s.stopped || s.showing || s.moreGamesUrl == null) return;
            if (where != OpenIn.GAME || !s.openGames(s.moreGamesUrl)) Device.view(s.activity, s.moreGamesUrl);
        } });
        return true;
    }

    /**
     * The campaign of the network's ad this game was installed from (the creative's campaign, else its id): `done` is
     * called once, on the main thread, with it or null. Google Play keeps it for 90 days after the install; null after
     * that, before init, and for an install not from one of the network's ads. Nothing is kept or sent.
     */
    public static void getInstallCampaign(final CampaignCallback done) {
        if (done == null) return;
        onMain(new Runnable() { @Override public void run() {
            final IndieAds s = instance;
            if (s == null) { done.onCampaign(null); return; }
            boolean asking = !s.campaignWanted.isEmpty();
            s.campaignWanted.add(done);
            if (!asking) {
                InstallReferrer.read(s.activity, new InstallReferrer.Done() {
                    @Override public void with(String referrer) { s.answerCampaign(referrer); }
                });
            }
        } });
    }

    // ---- threads ----

    private interface Session {
        void with(IndieAds s);
    }

    // `work` with the session that's running, on the main thread; none, nothing
    private static void session(final Session work) {
        onMain(new Runnable() { @Override public void run() {
            IndieAds s = instance;
            if (s != null && !s.stopped) work.with(s);
        } });
    }

    private static boolean onMain() {
        return Looper.myLooper() == Looper.getMainLooper();
    }

    private static void onMain(Runnable work) {
        if (onMain()) work.run(); else MAIN.post(work);
    }

    // ---- a session: the main thread's alone, but for what's marked volatile ----

    // A page that's run this long without trouble starts the waits again from the shortest; one has this long to answer
    // as the game comes back; and a page lost this soon after it came back (its word arriving late) was lost while it
    // was away. With an ad up the page has longer to answer (a playable can keep its page busy), but it must: an ad page
    // emptied while the game was away can't end its own ad, and the game would wait on it for good.
    private static final long HEALTHY_MS = 60000, ANSWER_MS = 4000, SHOWING_ANSWER_MS = 10000, BACK_MS = ANSWER_MS + 2000;
    private static final long GAMES_PATIENCE_MS = 6000;   // for the page of games to load and say it can be closed, before the browser has it
    private static final long STORE_PATIENCE_MS = 3000;   // for a store to take the game from the front, before the ad's clock goes on
    private static final long TICK_MS = 250;
    private static final String GAMES_READY = "indie-ads:games-ready", GAMES_CLOSE = "indie-ads:close";   // what that page says (the server's games.js)

    private final Activity activity;
    private final IndieAdsConfig config;
    private AdWebView view;
    private boolean pageLoaded;
    // Made for each page and given only to it: a frame inside the page (a playable) can post too, but not this.
    private String pageKey;
    private final List<String> waitingCalls = new ArrayList<String>();
    private volatile Map<String, IndieAdDemand> demand = Collections.emptyMap();   // replaced whole, so any thread may read it
    private boolean asked;   // the page has asked what it can't know: it's told again whenever that may have changed
    private long demandTime;
    private long remakeDelay = 5000;   // how long after the next page lost (or put away for memory) one is made again: doubled each time, to 10 minutes
    private long remakeAt = -1;        // when that is (-1: none is to be)
    private long pageLoadedTime = -1;  // when the page that's up said it was there (-1: none has)
    private boolean away;              // the game isn't at the front
    private long backTime = -1;        // when it last came back to the front
    private long askedAliveAt = -1;    // back at the front, the page was asked if it's there: when (-1: no answer awaited)
    private int aliveAsk;              // that question's number: only 'alive' with it is an answer, not anything said before
    private boolean aliveHeard;        // and it has been answered

    private volatile boolean stopped;
    private volatile boolean showing;
    private volatile boolean showPending;   // show was called from another thread, and the main thread hasn't yet had it
    private boolean remake;                 // the page is to be made again once the ad that's up has closed: the player's consent changed
    private boolean keptScreenOn;           // the screen was kept on for the ad (the game hadn't), and is let go as it closes
    private boolean showStarted;
    private int showNumber;
    private String showPlacement;
    private long showRequestedTime;
    private ShowCallback showDone;

    private volatile String moreGamesUrl;   // the network's page of the games this one shows, as the page says it (web/host.js 'more'); null: none
    private AdWebView games;                // that page, in a web view over the game (showMoreGames, in the game)
    private String gamesUrl;
    private boolean gamesReady;             // it has said it can be closed, and is on screen
    private long gamesAsked;

    private boolean storeOpen;
    private boolean storeLeftApp;
    private long storeOpenedTime;
    private final List<CampaignCallback> campaignWanted = new ArrayList<CampaignCallback>();   // getInstallCampaign's, while Play is asked

    private boolean ticking;

    private IndieAds(Activity activity, IndieAdsConfig config) {
        this.activity = activity;
        this.config = config;
    }

    private static long now() {
        return SystemClock.elapsedRealtime();
    }

    private boolean logging() {
        return config.log;
    }

    private void start() {
        if (stopped) return;
        if (config.shippedCatalogueJson == null) config.shippedCatalogueJson = readAsset(activity, SHIPPED_ASSET);
        activity.getApplication().registerActivityLifecycleCallbacks(lifecycle);
        activity.getApplication().registerComponentCallbacks(memory);
        ensurePage();   // at the front, as the game is when it starts us: onActivityPaused says otherwise
        tickSoon();
    }

    private void stopSession() {
        if (stopped) return;
        stopped = true;
        synchronized (IndieAds.class) {
            if (instance == this) instance = null;   // a callback may start the next session
        }
        remake = false;
        activity.getApplication().unregisterActivityLifecycleCallbacks(lifecycle);
        activity.getApplication().unregisterComponentCallbacks(memory);
        MAIN.removeCallbacks(tick);
        demand = Collections.emptyMap();
        answerCampaign(null);   // anyone still waiting on getInstallCampaign is answered: no answer will reach this one now
        try {
            try { dropPage(); }
            finally { closeGames(); }
        } finally {
            if (showing) finishShow(IndieAdResult.ended(showStarted));
        }
    }

    // ---- the page ----

    private boolean ensurePage() {
        if (stopped) return false;
        if (view != null) return true;
        if (playerPage == null) playerPage = readAsset(activity, PLAYER_ASSET);
        if (playerPage == null) {
            if (logging()) Log.e(TAG, "the player page (assets/" + PLAYER_ASSET + ") isn't in the app");
            return false;
        }
        final AdWebView[] made = new AdWebView[1];
        made[0] = AdWebView.create(activity, new AdWebView.Listener() {
            @Override public void onMessage(String message) { if (view == made[0]) receive(message); }
            @Override public void onBack() { if (view == made[0]) handleBack(); }
            @Override public void onLost() { if (view == made[0]) lose("lost"); }
            @Override public void onPageFailed(int code, String message) {
                if (view == made[0] && logging()) Log.w(TAG, "the player page failed: " + code + " " + message);
            }
        }, config.log);
        if (made[0] == null) {
            if (logging()) Log.w(TAG, "there's no web view on this device: no ads");
            return false;
        }
        view = made[0];
        pageLoaded = false;
        remakeAt = -1;
        pageLoadedTime = -1;
        askedAliveAt = -1;
        asked = false;   // a page is asked if it's there only once it has asked what it can't know: it's up by then
        pageKey = UUID.randomUUID().toString().replace("-", "");
        waitingCalls.clear();
        if (away) view.setPaused(true);
        // The catalogue's origin is the page's: its history, downloads and unsent analytics are kept under it.
        view.loadHtml(playerPage, Wire.origin(config.catalogueUrl));
        return true;
    }

    private void remakePage() {
        forget();
        ensurePage();
    }

    // The page goes, and what it said is available goes with it: nothing is the house's until a page that's up says
    // otherwise, so a slot is never claimed for an ad that would wait on a web view being made. (A page put away because
    // it's idle, with keepWebView off, keeps its word instead: show makes it again.)
    private void forget() {
        dropPage();
        boolean had = !demand.isEmpty();
        demand = Collections.emptyMap();
        if (had) notifyDemandChanged();
    }

    private void dropPage() {
        AdWebView previous = view;
        view = null;
        pageLoaded = false;
        waitingCalls.clear();
        if (previous == null) return;
        previous.setVisible(false);
        previous.destroy();
    }

    private void call(String function, String arguments) {
        String js = "indieAdsHost." + function + "(" + arguments + ")";
        if (pageLoaded) view.evaluate(js);
        else waitingCalls.add(js);
    }

    private void receive(String json) {
        if (stopped) return;
        JSONObject batch;
        try {
            batch = new JSONObject(json);
        } catch (JSONException e) {
            if (logging()) Log.w(TAG, "unreadable message: " + e.getMessage());
            return;
        }
        JSONArray items = batch.optJSONArray("items");
        if (items == null) return;
        String k = batch.optString("k", "");
        for (int i = 0; !stopped && i < items.length(); i++) {
            JSONObject m = items.optJSONObject(i);
            if (m == null) continue;
            String type = m.optString("type", "");
            // Before start() the page has no key, and all it says is that it's there.
            boolean first = !pageLoaded && type.equals("loaded");
            if (first || (pageLoaded && k.equals(pageKey))) handle(type, m);
        }
        tickSoon();
    }

    private void handle(String type, JSONObject m) {
        if (logging() && !type.equals("event")) Log.d(TAG, type);
        switch (type) {
            case "loaded":
                if (pageLoaded) break;
                pageLoaded = true;
                pageLoadedTime = now();
                view.evaluate("indieAdsHost.start(" + Wire.startConfig(config, pageKey, config.language, isWide()) + ")");
                for (String js : waitingCalls) view.evaluate(js);
                waitingCalls.clear();
                break;
            case "device":
                asked = true;
                tellDevice(0);
                break;
            case "alive":
                if (m.optInt("n", 0) == aliveAsk) aliveHeard = true;
                break;
            case "demand": {
                Map<String, IndieAdDemand> now = new HashMap<String, IndieAdDemand>();
                JSONArray rows = m.optJSONArray("demand");
                for (int i = 0; rows != null && i < rows.length(); i++) {
                    JSONObject row = rows.optJSONObject(i);
                    if (row != null) now.put(row.optString("placement", ""), new IndieAdDemand(row.optDouble("share", 0), row.optInt("available", 0)));
                }
                demand = Collections.unmodifiableMap(now);
                demandTime = now();
                notifyDemandChanged();
                break;
            }
            case "event": {
                IndieAdEvent e = eventOf(m.optJSONObject("e"));
                if (logging()) Log.d(TAG, e.toString());
                boolean shownNow = showing && !showStarted && "show".equals(e.event);
                if (shownNow) showStarted = true;
                notifyEvent(e);
                if (shownNow && !stopped) {
                    Listener l = listener;
                    if (l != null) {
                        try { l.onShown(); } catch (RuntimeException x) { Log.e(TAG, "the game's onShown threw", x); }
                    }
                }
                break;
            }
            case "store":
                openStore(m.optJSONObject("link"));
                break;
            case "more": {
                JSONObject link = m.optJSONObject("link");
                String url = link != null ? text(link, "url") : null;
                moreGamesUrl = url != null && !url.isEmpty() ? url : null;
                break;
            }
            case "banner":
                break;   // the App Store's banner: iOS's alone
            case "done":
                if (showing && m.optInt("n", -1) == showNumber) {
                    finishShow(new IndieAdResult(m.optBoolean("shown"), m.optBoolean("granted"), text(m, "creative"), text(m, "app"), text(m, "kind"), m.optDouble("watchedSecs", 0)));
                }
                break;
            case "idle":
                // without the player's consent what's been shown is remembered in the page alone, so the page is kept
                if (!showing && !config.keepWebView && config.consent) dropPage();
                break;
            default:
                break;
        }
    }

    private static String text(JSONObject o, String name) {
        return o == null || o.isNull(name) ? null : o.optString(name, null);
    }

    private static IndieAdEvent eventOf(JSONObject e) {
        return new IndieAdEvent(text(e, "event"), text(e, "placement"), text(e, "creative"), text(e, "app"), text(e, "kind"),
                text(e, "why"), text(e, "via"), text(e, "step"), e != null ? e.optDouble("secs", 0) : 0);
    }

    // the game's screen is wider than tall: the page can't see its own shape until it's shown
    private boolean isWide() {
        View decor = activity.getWindow().getDecorView();
        int w = decor.getWidth(), h = decor.getHeight();
        if (w <= 0 || h <= 0) {
            DisplayMetrics metrics = activity.getResources().getDisplayMetrics();
            w = metrics.widthPixels;
            h = metrics.heightPixels;
        }
        return w > h;
    }

    // ---- what a page can't know ----

    // True: the page was told. `ask`: a question's number, which it says back at once ('alive'), before anything else.
    private boolean tellDevice(int ask) {
        if (view == null || !asked || !pageLoaded) return false;
        String metered = Device.isMetered(activity) ? "true" : "false";
        call("device", "{\"metered\":" + metered + (ask > 0 ? ",\"ask\":" + ask : "") + "}");
        return true;
    }

    // The game's activity left the front (paused) or came back (resumed): Unity's OnApplicationFocus, for this SDK.
    private void onFront(boolean front) {
        if (storeOpen) {
            if (!front) storeLeftApp = true;
            else if (storeLeftApp) storeClosed();
        }
        if (stopped) return;
        if (view != null) view.setPaused(!front);
        if (games != null) games.setPaused(!front);
        away = !front;
        if (away) {
            askedAliveAt = -1;   // asked again on the way back: a page that hadn't the chance to answer isn't taken for lost
            return;
        }
        backTime = now();
        // Back at the front: the network may have changed, and a day-old cap may have lapsed. A page that's up is told,
        // and must answer: one the system emptied in the background without a word is lost all the same (tick).
        if (view != null) {
            aliveHeard = false;
            if (tellDevice(++aliveAsk)) askedAliveAt = backTime;
        } else if (remakeAt >= 0 || now() - demandTime > (long) (config.refreshAfterSeconds * 1000)) {
            // one lost, or put away for memory, while the game was away is made again now, not on its timer
            ensurePage();
        }
        tickSoon();
    }

    // ---- showing ----

    private boolean doShow(String placement, ShowCallback done, String reward) {
        if (showing || !ensurePage()) return false;
        showing = true;
        showStarted = false;
        showDone = done;
        showPlacement = placement;
        // The screen stays on for as long as an ad is up: nobody touches a video, or a playable's opening, for longer than
        // a phone waits before it dims, and a web view's page can't ask this of the device itself.
        keptScreenOn = (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) == 0;
        if (keptScreenOn) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        showRequestedTime = now();
        ++showNumber;
        view.setVisible(true);
        call("show", showNumber + "," + Wire.quote(placement) + "," + Wire.quote(reward) + "," + (config.muted ? "true" : "false") + "," + Wire.quote(config.language));
        tickSoon();
        return true;
    }

    private void finishShow(IndieAdResult result) {
        boolean wasShown = showStarted;
        if (keptScreenOn) {
            activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            keptScreenOn = false;
        }
        showing = false;
        showStarted = false;
        storeOpen = false;
        if (view != null) view.setVisible(false);
        ShowCallback done = showDone;
        showDone = null;
        try {
            Listener l = listener;
            if (wasShown && l != null) {
                try { l.onHidden(); } catch (RuntimeException x) { Log.e(TAG, "the game's onHidden threw", x); }
            }
            if (remake && !stopped) {   // the player's consent changed while the ad was up
                remake = false;
                remakePage();
            }
        } finally {
            if (done != null) callDone(done, result);
        }
    }

    private void callDone(ShowCallback done, IndieAdResult result) {
        try { done.onDone(result); } catch (RuntimeException x) { Log.e(TAG, "the game's show callback threw", x); }
    }

    // ---- the clock: Unity's Update, for what's waited on ----

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            ticking = false;
            if (stopped || away) return;   // the game away runs nothing of this, as Unity's player loop doesn't; onFront starts it again
            update();
            tickSoon();
        }
    };

    private boolean waiting() {
        return askedAliveAt >= 0 || remakeAt >= 0 || (games != null && !gamesReady) || (showing && !showStarted) || (storeOpen && !storeLeftApp);
    }

    private void tickSoon() {
        if (ticking || stopped || away || !waiting()) return;
        ticking = true;
        MAIN.postDelayed(tick, TICK_MS);
    }

    private void update() {
        long now = now();
        // Asked if it was there as the game came back, and no answer: the system emptied it in the background
        if (askedAliveAt >= 0 && now - askedAliveAt > (showing ? SHOWING_ANSWER_MS : ANSWER_MS)) {
            askedAliveAt = -1;
            if (!aliveHeard && view != null) {
                lose("unanswered");
                if (stopped) return;
            }
        }
        // A page lost, or put away for memory, is made again (lose, handleLowMemory)
        if (remakeAt >= 0 && now >= remakeAt) {
            remakeAt = -1;
            if (!showing) ensurePage();
        }
        // A page of games that hasn't said it can be closed isn't put in front of the player: the browser has it
        if (games != null && !gamesReady && now - gamesAsked > GAMES_PATIENCE_MS) handleGamesFailed();
        if (showing && !showStarted && now - showRequestedTime > (long) (config.showTimeout * 1000)) {
            if (logging()) Log.w(TAG, "the ad never started: giving up on it");
            try { forget(); }   // a page that couldn't start an ad: its word goes with it, and one is made again later
            finally {
                scheduleRemake(lostWhileAway());
                finishShow(IndieAdResult.notShown());
            }
        }
        // A store that never took the game from the front (nothing opened): don't leave the ad's clock standing.
        if (storeOpen && !storeLeftApp && now - storeOpenedTime > STORE_PATIENCE_MS) storeClosed();
    }

    // ---- the page of more games, in a web view of the game's own ----

    // False: there's no web view to be had here.
    private boolean openGames(String url) {
        closeGames();
        final AdWebView[] made = new AdWebView[1];
        made[0] = AdWebView.create(activity, new AdWebView.Listener() {
            @Override public void onMessage(String said) { if (games == made[0]) handleGamesSaid(said); }
            @Override public void onBack() { if (games == made[0]) closeGames(); }
            @Override public void onLost() { if (games == made[0]) closeGames(); }
            @Override public void onPageFailed(int code, String message) { if (games == made[0]) handleGamesFailed(); }
        }, config.log);
        if (made[0] == null) return false;
        games = made[0];
        gamesUrl = url;
        gamesReady = false;
        gamesAsked = now();
        games.loadUrl(url + (url.contains("?") ? "&" : "?") + "in=app");   // as the server gives it to a game: a ✕, and links the stores' own apps take
        tickSoon();
        return true;
    }

    private void handleGamesSaid(String said) {
        if (stopped) return;
        if (GAMES_READY.equals(said) && games != null && !gamesReady) {
            gamesReady = true;
            games.setVisible(true);
        } else if (GAMES_CLOSE.equals(said)) {
            closeGames();
        }
    }

    // It wouldn't load, or never said it could be closed: not shown at all. The browser may do better, and is no worse.
    private void handleGamesFailed() {
        if (stopped || games == null || gamesReady) return;
        String url = gamesUrl;
        closeGames();
        Device.view(activity, url);
    }

    private void closeGames() {
        AdWebView previous = games;
        games = null;
        gamesUrl = null;
        gamesReady = false;
        if (previous == null) return;
        previous.setVisible(false);
        previous.destroy();
    }

    private void handleBack() {
        if (showing && pageLoaded) view.evaluate("indieAdsHost.back()");
    }

    // An ad that was up ends (shown, if it had started; no reward), with a fail of this `why` (see IndieAdEvent).
    private void lose(String why) {
        if (logging()) Log.w(TAG, "the web view was lost (" + why + ")");
        boolean wasShowing = showing;
        try { forget(); }   // what it said goes with it: a page that can't be made at all must claim nothing
        finally {
            scheduleRemake(why.equals("unanswered") || lostWhileAway());   // silent as the game came back: emptied while away
            // unless a listener (onDemandChanged, then onEvent) shut the SDK down, which finished it
            if (wasShowing && showing) {
                try { notifyEvent(new IndieAdEvent("fail", showPlacement, null, null, null, why, null, null, 0)); }
                finally { if (showing) finishShow(IndieAdResult.ended(showStarted)); }
            }
        }
        tickSoon();
    }

    // The system says memory is low: the page goes (it's tens of MB), unless an ad is up or, without consent, it's the
    // only record of what's been shown. It's made again a little later.
    private void handleLowMemory() {
        if (stopped || showing || view == null || !config.consent) return;
        if (logging()) Log.w(TAG, "memory is low: the web view is put away");
        forget();
        scheduleRemake(false);   // always after the wait: made again at once, it would take the memory straight back
        tickSoon();
    }

    // A page lost with the game away (the system empties a web view in the background now and then), or so soon after it
    // came back that word of it is late: made again as the game comes back, not on the timer.
    private boolean lostWhileAway() {
        return away || (backTime >= 0 && now() - backTime < BACK_MS);
    }

    // `atOnce`, or later after each time, in case the system keeps taking it; one that ran a minute without trouble starts
    // the waits again from the shortest.
    private void scheduleRemake(boolean atOnce) {
        long now = now();
        if (atOnce) {
            remakeAt = now;
            return;
        }
        if (pageLoadedTime >= 0 && now - pageLoadedTime >= HEALTHY_MS) remakeDelay = 5000;
        pageLoadedTime = -1;
        remakeAt = now + remakeDelay;
        remakeDelay = Math.min(remakeDelay * 2, 600000);
    }

    // ---- the store ----

    private void openStore(JSONObject link) {
        storeOpen = true;
        storeLeftApp = false;
        storeOpenedTime = now();
        String url = text(link, "url"), fallback = text(link, "fallback");
        if (!Device.openStore(activity, url, fallback) && logging()) Log.w(TAG, "nothing on this device opens " + fallback);
        tickSoon();
    }

    private void storeClosed() {
        if (!storeOpen) return;
        storeOpen = false;
        if (view != null && pageLoaded) view.evaluate("indieAdsHost.storeClosed()");
    }

    // ---- the install campaign ----

    // What Play keeps of the store link, or null. Each who asked is told.
    private void answerCampaign(String referrer) {
        if (campaignWanted.isEmpty()) return;
        List<CampaignCallback> wanted = new ArrayList<CampaignCallback>(campaignWanted);
        campaignWanted.clear();
        String campaign = Wire.campaignOf(referrer);
        for (CampaignCallback done : wanted) {
            try { done.onCampaign(campaign); } catch (RuntimeException x) { Log.e(TAG, "the game's campaign callback threw", x); }
        }
    }

    // ---- the game's listener ----

    private void notifyEvent(IndieAdEvent e) {
        Listener l = listener;
        if (l == null) return;
        try { l.onEvent(e); } catch (RuntimeException x) { Log.e(TAG, "the game's onEvent threw", x); }
    }

    private void notifyDemandChanged() {
        Listener l = listener;
        if (l == null) return;
        try { l.onDemandChanged(); } catch (RuntimeException x) { Log.e(TAG, "the game's onDemandChanged threw", x); }
    }

    // ---- the system ----

    private final Application.ActivityLifecycleCallbacks lifecycle = new Application.ActivityLifecycleCallbacks() {
        @Override public void onActivityResumed(Activity a) { if (a == activity) onFront(true); }
        @Override public void onActivityPaused(Activity a) { if (a == activity) onFront(false); }
        // The web views are the activity's: with it gone, so is the session. A game made again calls init again.
        @Override public void onActivityDestroyed(Activity a) {
            if (a != activity) return;
            synchronized (IndieAds.class) {
                if (instance == IndieAds.this) instance = null;
            }
            stopSession();
        }
        @Override public void onActivityCreated(Activity a, Bundle saved) {}
        @Override public void onActivityStarted(Activity a) {}
        @Override public void onActivityStopped(Activity a) {}
        @Override public void onActivitySaveInstanceState(Activity a, Bundle out) {}
    };

    private final ComponentCallbacks2 memory = new ComponentCallbacks2() {
        @Override public void onTrimMemory(int level) {
            if (level == TRIM_MEMORY_RUNNING_CRITICAL || level >= TRIM_MEMORY_COMPLETE) handleLowMemory();
        }
        @Override public void onLowMemory() { handleLowMemory(); }
        @Override public void onConfigurationChanged(Configuration configuration) {}
    };

    private static String readAsset(Context context, String name) {
        InputStream in = null;
        try {
            in = context.getAssets().open(name);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        } catch (IOException e) {
            return null;
        } finally {
            if (in != null) {
                try { in.close(); } catch (IOException e) { /* read already */ }
            }
        }
    }
}
