using System;
using System.Reflection;
using System.Text.Json;
using IndieAdNetwork;
using UnityEngine;

sealed class View : IIndieAdsWebView
{
    public event Action<string> MessageReceived;
    public event Action BackPressed;
    public event Action Lost;
    public bool visible, disposed, failHide, failDispose;
    public int disposals;
    public string key;
    public void LoadHtml(string html, string origin) { Emit(new { type = "loaded" }); }
    public void Evaluate(string js)
    {
        if (js.StartsWith("indieAdsHost.start("))
            key = JsonDocument.Parse(js[19..^1]).RootElement.GetProperty("key").GetString();
    }
    string Packet(object[] items) => JsonSerializer.Serialize(new { k = key, items });
    public void Emit(params object[] items) { MessageReceived?.Invoke(Packet(items)); }
    public Action Capture(params object[] items)
    { var callback = MessageReceived; string packet = Packet(items); return () => callback?.Invoke(packet); }
    public void SetVisible(bool value)
    { visible = value; if (!value && failHide) throw new InvalidOperationException("hide"); }
    public void Dispose()
    { disposed = true; disposals++; if (failDispose) throw new InvalidOperationException("dispose"); }
    public bool Detached => MessageReceived == null && BackPressed == null && Lost == null;
    public void Lose() { Lost?.Invoke(); }
}

static class Program
{
    static int checks, done, hidden;
    static IndieAdResult result;
    static object Sdk => typeof(IndieAds).GetField("instance", BindingFlags.Static | BindingFlags.NonPublic).GetValue(null);
    static void Call(object sdk, string method, params object[] args) => sdk.GetType().GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(sdk, args);
    static void Check(bool condition, string why) { checks++; if (!condition) throw new Exception(why); }
    // `make`: each web view the package asks for (one view, made again and again, unless said); `keep`: keepWebView
    static View Start(Func<IIndieAdsWebView> make = null, bool keep = true)
    {
        var view = make == null ? new View() : null;   // with `make`, the caller keeps its own
        IndieAds.Init(new IndieAdsConfig { host = "first", age = 16, catalogueUrl = "https://example.com/catalogue.json", createWebView = make ?? (() => view), keepWebView = keep });
        return view;
    }
    static View Showing(bool present = true)
    {
        var view = Start();
        Check(IndieAds.Show("coins", r => { done++; result = r; }), "show rejected");
        if (present) view.Emit(new { type = "event", e = new { @event = "show" } });
        return view;
    }
    static void Reset()
    {
        IndieAds.Shutdown();
        foreach (var obj in GameObject.Pending.ToArray()) obj.DestroyNow();
        GameObject.Pending.Clear();
        done = hidden = 0;
        result = default;
        Screen.sleepTimeout = 30;
    }
    static void Main()
    {
        IndieAds.OnHidden += () => hidden++;
        IndieAds.Shutdown();
        var view = Start();
        view.Emit(new { type = "demand", demand = new[] { new { placement = "coins", share = 1, available = 2 } } });
        Check(IndieAds.Demand("coins").available == 2, "demand fixture");
        IndieAds.Shutdown(); IndieAds.Shutdown();
        Check(!IndieAds.IsInitialised && !IndieAds.IsShowing && IndieAds.Demand("coins").available == 0, "idle shutdown retained state");
        Check(view.disposals == 1 && view.Detached && done == 0 && hidden == 0, "idle shutdown callbacks or duplicate dispose");

        Reset(); view = Showing(false); IndieAds.Shutdown();
        Check(done == 1 && hidden == 0 && !result.shown && !result.granted, "pending show cancellation");
        Check(Screen.sleepTimeout == 30 && view.disposed && !view.visible, "pending show cleanup");

        Reset(); view = Showing(); var old = Sdk;
        view.Emit(new { type = "store", link = new { id = "123" } }, new { type = "banner", link = new { id = "123" } });
        var stale = view.Capture(new { type = "done", n = 1, shown = true, granted = true }, new { type = "loaded" });
        IndieAds.SetConsent(false); // A pending page remake must not survive shutdown.
        IndieAds.Shutdown();
        Check(done == 1 && hidden == 1 && result.shown && !result.granted, "presented cancellation result");
        Check(view.Detached && !view.visible && view.disposals == 1 && Screen.sleepTimeout == 30, "presented cleanup");
        Check(IndieAdsNative.closedListener == IndieAdsNative.listener && IndieAdsNative.banner == null, "store cleanup");
        var next = Showing(); var successor = Sdk;
        Check(((IndieAds)old).gameObject.name != ((IndieAds)successor).gameObject.name, "native listener reused");
        stale(); Call(old, "OnApplicationFocus", true); Call(old, "Update"); Call(old, "OnDestroy");
        Check(ReferenceEquals(Sdk, successor) && IndieAds.IsShowing && done == 1 && next.visible, "old session affected replacement");
        next.Emit(new { type = "done", n = 1, shown = true, granted = true });
        Check(done == 2 && result.granted && hidden == 2, "replacement cannot finish");

        Reset(); view = Showing(); ((IndieAds)Sdk).gameObject.DestroyNow();
        Check(!IndieAds.IsInitialised && done == 1 && view.disposed && hidden == 1, "external destruction cleanup");

        Reset(); view = Start(); View replacement = null;
        IndieAds.Show("coins", r => {
            Check(!IndieAds.IsInitialised && !IndieAds.IsShowing && !r.granted, "state not cleared before callback");
            replacement = Start();
        });
        old = Sdk; IndieAds.Shutdown(); Call(old, "OnDestroy");
        Check(IndieAds.IsInitialised && replacement != null && !replacement.disposed, "callback reinitialization destroyed");

        Reset(); view = Showing(); Action throws = () => throw new InvalidOperationException("subscriber");
        IndieAds.OnHidden += throws;
        try { IndieAds.Shutdown(); throw new Exception("subscriber exception swallowed"); }
        catch (InvalidOperationException) {}
        finally { IndieAds.OnHidden -= throws; }
        Check(done == 1 && view.disposed && Screen.sleepTimeout == 30 && !IndieAds.IsInitialised, "subscriber prevented completion");

        foreach (bool hide in new[] { true, false })
        {
            Reset(); view = Showing(); view.failHide = hide; view.failDispose = !hide;
            try { IndieAds.Shutdown(); throw new Exception("boundary exception swallowed"); }
            catch (InvalidOperationException) {}
            Check(done == 1 && hidden == 1 && view.disposed && view.Detached && Screen.sleepTimeout == 30 && !IndieAds.IsInitialised, "boundary failure prevented cleanup");
        }
        Reset(); view = Showing();
        Action shutdownOnEvent = IndieAds.Shutdown;
        Action<IndieAdEvent> handler = e => shutdownOnEvent();
        IndieAds.OnEvent += handler;
        try { view.Emit(new { type = "event", e = new { @event = "first_touch" } }, new { type = "loaded" }); }
        finally { IndieAds.OnEvent -= handler; }
        Check(done == 1 && view.disposals == 1, "batched message continued after shutdown");
        Reset();
        foreach (bool ready in new[] { false, true })
        {
            view = Start();
            view.Emit(new { type = "more", link = new { url = "https://example.com/games/first" } });
            var games = new NativeWebView(); NativeWebView.next = games;
            Check(IndieAds.ShowMoreGames(IndieAdsOpenIn.Game), "games page did not open");
            if (ready) games.Emit("indie-ads:games-ready");
            Check(games.visible == ready, "games readiness fixture");
            var lateReady = games.CaptureMessage("indie-ads:games-ready");
            var lateFailure = games.CaptureFailure();
            int opened = Application.opened.Count;
            old = Sdk;
            IndieAds.Shutdown();
            Check(games.disposed && games.Detached && !games.visible && !IndieAds.IsInitialised, "shutdown retained games web view");
            Start(); successor = Sdk;
            lateReady(); lateFailure(); Call(old, "Update"); Call(old, "OnDestroy");
            Check(!games.visible && Application.opened.Count == opened && ReferenceEquals(Sdk, successor), "late games callback reopened page or affected successor");
            Reset();
        }
        // the campaign of the ad a game was installed from: core/storeLinks.js campaignOf's, of the referrer Play hands back
        Check(IndieAds.CampaignOf("utm_source=tca&utm_medium=house&utm_campaign=half%20off%2Fnow&utm_content=x") == "half off/now", "campaign of a network referrer");
        Check(IndieAds.CampaignOf("utm_source=google-play&utm_medium=organic") == null && IndieAds.CampaignOf("utm_medium=cpc&utm_campaign=theirs") == null && IndieAds.CampaignOf("") == null, "campaign of another install");
        {
            string first = "unset", second = "unset", late = "unset";
            IndieAds.GetInstallCampaign(c => first = c);
            Check(first == null, "asked before Init");
            Start(); IndieAdsNative.referrerAsks = 0;
            IndieAds.GetInstallCampaign(c => first = c); IndieAds.GetInstallCampaign(c => second = c);
            Check(IndieAdsNative.referrerAsks == 1, "overlapping callers asked Play more than once");
            Call(Sdk, "NativeInstallReferrer", "utm_medium=house&utm_campaign=starter50");
            Check(first == "starter50" && second == "starter50", "campaign not handed to each caller");
            IndieAds.GetInstallCampaign(c => late = c);
            IndieAds.Shutdown();
            Check(late == null && IndieAdsNative.referrerAsks == 2, "a caller still waiting at shutdown was not answered");
            Reset();
        }
        // 0.6.20: the web view is kept between ads; it goes when memory is low, and what it said goes with it (Wants is false
        // until a page that's up says again); it's made again later. A lost page's word goes too, and one lost while the game
        // was away, or silent as it comes back, is made again at once. keepWebView off: put away when idle, its word kept.
        {
            int made = 0, changed = 0; View current = null;
            Action onChange = () => changed++;
            var says = new { type = "demand", demand = new[] { new { placement = "coins", share = 1, available = 2 } } };
            Func<IIndieAdsWebView> make = () => { made++; return current = new View(); };
            Time.realtimeSinceStartup = 1000;
            Start(make);
            IndieAds.OnDemandChanged += onChange;
            try
            {
                current.Emit(says); current.Emit(new { type = "idle" });
                Check(made == 1 && !current.disposed && IndieAds.Wants("coins"), "an idle page put away with keepWebView on");
                Application.LowMemory();
                Check(current.disposed && !IndieAds.Wants("coins") && changed == 2, "kept when memory was low, or its word kept");
                Time.realtimeSinceStartup = 1004; Call(Sdk, "Update");
                Check(made == 1, "made again at once after low memory");
                Time.realtimeSinceStartup = 1006; Call(Sdk, "Update");
                Check(made == 2 && !IndieAds.Wants("coins"), "not made again after low memory, or claimed before it said");
                current.Emit(says);
                Check(IndieAds.Wants("coins"), "its word not taken once it said");
                current.Lose();
                Check(current.disposed && IndieAds.Demand("coins").available == 0 && changed == 4, "a lost page's word kept");
                Time.realtimeSinceStartup = 1015; Call(Sdk, "Update");
                Check(made == 2, "made again before the longer wait");
                Time.realtimeSinceStartup = 1017; Call(Sdk, "Update");
                Check(made == 3, "a lost web view not made again");

                // lost while the game was away: made again as it comes back, not on the timer
                Call(Sdk, "OnApplicationFocus", false); current.Lose();
                Time.realtimeSinceStartup = 1100; Call(Sdk, "OnApplicationFocus", true);
                Check(made == 4, "a page lost while away not made again as the game came back");
                // lost just after it came back (word of it arriving late): the same
                Call(Sdk, "OnApplicationFocus", false); Call(Sdk, "OnApplicationFocus", true);
                current.Lose(); Call(Sdk, "Update");
                Check(made == 5, "a page lost just after the game came back waited on the timer");
                // back at the front, a page must answer what it's told; one that says nothing was emptied in the background
                current.Emit(new { type = "device" });
                Call(Sdk, "OnApplicationFocus", false); Time.realtimeSinceStartup = 1200; Call(Sdk, "OnApplicationFocus", true);
                current.Emit(says);
                Time.realtimeSinceStartup = 1205; Call(Sdk, "Update");
                Check(made == 5 && !current.disposed, "a page that answered was taken for lost");
                Call(Sdk, "OnApplicationFocus", false); Time.realtimeSinceStartup = 1300; Call(Sdk, "OnApplicationFocus", true);
                Time.realtimeSinceStartup = 1305; Call(Sdk, "Update");
                Check(made == 6 && !IndieAds.Wants("coins"), "a page that said nothing as the game came back not made again, or its word kept");
                // a page that ran a minute without trouble: the next is made again after the shortest wait
                Time.realtimeSinceStartup = 1400; current.Lose();
                Time.realtimeSinceStartup = 1404; Call(Sdk, "Update");
                Check(made == 6, "made again at once after a page that ran a minute");
                Time.realtimeSinceStartup = 1406; Call(Sdk, "Update");
                Check(made == 7, "the waits not started again after a page that ran a minute");
            }
            finally { IndieAds.OnDemandChanged -= onChange; }
            Reset();
            Application.LowMemory();   // a session shut down no longer hears it
            Start(make, keep: false);
            current.Emit(says); current.Emit(new { type = "idle" });
            Check(made == 8 && current.disposed && IndieAds.Wants("coins"), "keepWebView off: an idle page's word not kept");
            Check(IndieAds.Show("coins", r => { done++; result = r; }) && made == 9, "keepWebView off: Show didn't make the page");
            Reset(); Time.realtimeSinceStartup = 0;
        }
        Console.WriteLine($"Unity lifecycle harness: {checks} checks passed.");
    }
}
