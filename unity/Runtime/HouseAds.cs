using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace HouseAdsNetwork
{
	public enum HouseAdFormat
	{
		/// The player's choice; watching to the end of the countdown earns the game's reward.
		Rewarded,
		/// The game's choice, between two things the player was doing: no reward, closable after skipAfter seconds.
		Interstitial,
	}

	[Serializable]
	public class HouseAdPlacement
	{
		public string id;
		public HouseAdFormat format = HouseAdFormat.Rewarded;
		[Tooltip("The longest creative this placement takes, in seconds. 0 = any.")]
		public int maxSecs = 30;
		[Tooltip("Interstitial: seconds before it can be closed.")]
		public float skipAfter = 5f;
		[Tooltip("Rewarded: what watching earns, as the player is told it (\"Earned: …\"). Empty = \"Reward earned\".")]
		public string reward;
	}

	public class HouseAdsConfig
	{
		/// This game's id in the catalogue: it's never advertised to itself.
		public string host;
		/// This game's age rating ("4+", "9+"…): nothing rated above it is shown. Null = anything.
		public string rating;
		/// The catalogue on the server. Its origin is also the page's: where its storage and downloads are kept.
		public string catalogueUrl;
		/// The catalogue that shipped with the game, as JSON text, for a first run with no server. May be null.
		public string shippedCatalogueJson;
		/// The package's own analytics endpoint, or null for none.
		public string ingestUrl;
		/// Where a player's report of an ad is sent (the ingest's /flag), or null for /flag beside ingestUrl. A development build
		/// that leaves ingestUrl out, so as to count nothing, can set this and still see its reports arrive: a report from a
		/// test showing is sent marked as one, and the dashboard keeps those apart.
		public string reportUrl;
		/// Where the share of this game's ad slots is asked (the ingest's /mix), or null for the catalogue's own word.
		public string mixUrl;
		/// The network's public key, or null for the one in the catalogue shipped with the game (Resources/house-ads-catalogue.json:
		/// a signing server writes its key into every catalogue it serves, as "signedBy"). With a key the server's catalogue is
		/// used only if the network signed it: someone between the player and the server can't serve ads of their own.
		public string catalogueKey;
		public HouseAdPlacement[] placements;
		/// The web view to play in, if not the package's own (NativeWebView); called whenever one is needed.
		/// Null result = house ads can't show here.
		public Func<IHouseAdsWebView> createWebView;
		/// Is the game muted? Asked as each ad starts.
		public Func<bool> muted;
		/// The language the player is playing in, if the game has a setting of its own: "fr", "es", "zh-Hant", "pt-BR".
		/// Asked as each ad starts. A language alone is enough: its region is taken from the device ("es" on a phone
		/// set to es-MX is Latin America's Spanish). Null, or a null answer: the device's language.
		public Func<string> language;
		/// The player's reported age, or 0 if not known. Under 13, only the games the network has marked as for them are shown.
		public int age;
		/// Keep the web view (tens of MB) between ads. Off: it is put away once the page says it's idle, and made
		/// again for the next ad (a fraction of a second) or the next look at what's available.
		public bool keepWebView;
		/// With the web view put away, look again at what's available when the game comes back to the front after this long.
		public float refreshAfterSeconds = 600f;
		/// Seconds for an ad to start before it's given up as failed.
		public float showTimeout = 6f;
		/// A developer trying the ads out (HouseAds.SetTest changes it later): the game's own ads, games that are resting
		/// and creatives at their daily cap all count, and nothing is sent to the ingest. Never on in a player's game.
		public bool test;
		/// Log to the Unity console and the device log: what the page says, its warnings and its web view's console.
		/// Off, the package logs nothing at all.
		public bool log;
	}

	/// What there is to show this player in a placement now, and what share of the game's slots the network asks for.
	public struct HouseAdDemand
	{
		/// 0–1. Already 0 when nothing is available.
		public float share;
		/// How many creatives this player could be shown here: 0 if they have every game, or have seen each as often
		/// as it may be shown today, or none is downloaded yet.
		public int available;
	}

	public struct HouseAdResult
	{
		/// An ad was put in front of the player. False: nothing happened, show another network's.
		public bool shown;
		/// Rewarded: watched to the end of the countdown. Always false for an interstitial.
		public bool granted;
		public string creative, app, kind;
		public float watchedSecs;
	}

	/// An event of the player, for the game's own analytics: offer, show, q25…q100, first_touch, complete, reward,
	/// exit_kept, exit_early, keep_playing, store_banner, store_open, cache_miss, fail; and step, a playable's own name (`step`) for
	/// somewhere in it a showing reached.
	[Serializable]
	public struct HouseAdEvent
	{
		public string @event, placement, creative, app, kind, why, via, step;
		public float secs;
	}

	/// <summary>
	/// House ads in a Unity game: our own and our friends' games, as rewarded ads and interstitials, beside whatever
	/// paid network the game has.
	///
	///   HouseAds.Init(config);                                  // at boot: fetches the catalogue, downloads a few creatives ahead
	///   if (HouseAds.Wants("FreeCoins")) {                       // this slot is the house's (Demand: share and what's available)
	///       HouseAds.Show("FreeCoins", r => { if (r.granted) … });
	///   } else { …the paid network's }
	///
	/// The share is the network's to say (the catalogue, or the ingest's /mix: what's owed between studios), and is
	/// 0 for a player there's nothing to show: they have every game, or have seen each as often as it may be shown
	/// today. So a game asks before every ad and falls back to its paid network on "no".
	///
	/// The ads themselves are the package's web player (Resources/HouseAdsPlayer.html: core/ in one page), in the
	/// package's own web view (NativeWebView: the system's, on iOS and Android).
	/// </summary>
	public class HouseAds : MonoBehaviour
	{
		const string PlayerPage = "HouseAdsPlayer";
		const string ShippedCatalogue = "house-ads-catalogue";

		static HouseAds instance;
		// The game asked for logs (HouseAdsConfig.log): without, the package writes none.
		internal static bool Logging => instance != null && instance.config != null && instance.config.log;

		public static event Action<HouseAdEvent> OnEvent;
		/// An ad is on screen, whoever showed it: pause the game's music and sound here. Called once a showing.
		public static event Action OnShown;
		/// The ad OnShown told of has closed, before Show's done callback: resume the game's sound here. Not
		/// called for an ad that never appeared, so a game only resumes what it paused.
		public static event Action OnHidden;
		/// What's available, or the share asked for, may have changed.
		public static event Action OnDemandChanged;

		public static bool IsInitialised => instance != null;
		public static bool IsShowing => instance != null && instance.showing;

		/// The catalogue the game shipped with: a TextAsset named house-ads-catalogue in a Resources folder. The
		/// package's build steps read the same file for the games to ask the device about (Editor/HouseAdsBuildProcessor).
		public static string LoadShippedCatalogue()
		{
			TextAsset shipped = Resources.Load<TextAsset>(ShippedCatalogue);
			return shipped != null ? shipped.text : null;
		}

		public static void Init(HouseAdsConfig config)
		{
			if (instance != null)
			{
				return;
			}
			GameObject go = new GameObject("HouseAds");
			DontDestroyOnLoad(go);
			instance = go.AddComponent<HouseAds>();
			instance.config = config;
			NativeWebView.LogConsole = config.log;
			if (config.shippedCatalogueJson == null)
			{
				config.shippedCatalogueJson = LoadShippedCatalogue();
			}
			instance.EnsurePage();
		}

		public static HouseAdDemand Demand(string placement)
		{
			HouseAdDemand demand;
			if (instance != null && !instance.showing && instance.demand.TryGetValue(placement, out demand))
			{
				return demand;
			}
			return default(HouseAdDemand);
		}

		/// Should this slot be the house's? Rolls the share: call once per ad, when it's about to be shown.
		public static bool Wants(string placement)
		{
			HouseAdDemand demand = Demand(placement);
			return demand.available > 0 && UnityEngine.Random.value < demand.share;
		}

		/// Turns test mode (HouseAdsConfig.test) on or off. What's available changes with it: OnDemandChanged says when it's in.
		public static void SetTest(bool on)
		{
			if (instance == null || instance.config.test == on)
			{
				return;
			}
			instance.config.test = on;
			// A page that's been put away starts again with the new setting
			if (instance.view != null)
			{
				instance.Call("test", on ? "true" : "false");
			}
			else
			{
				instance.EnsurePage();
			}
		}

		/// A placement's button was put in front of the player (once per time it's put there): shows over offers is the opt-in rate.
		public static void Offered(string placement)
		{
			// A page that's been put away is made again to hear it (as for SetTest): an offer unsaid is an opt-in rate too high
			if (instance != null && instance.EnsurePage())
			{
				instance.Call("offered", Quote(placement));
			}
		}

		/// False: nothing will be shown and `done` won't be called. Otherwise `done` is called once, when the ad has
		/// closed (or failed to appear: result.shown false).
		public static bool Show(string placement, Action<HouseAdResult> done, string reward = null)
		{
			return instance != null && instance.DoShow(placement, done, reward);
		}

		HouseAdsConfig config;
		IHouseAdsWebView view;
		bool pageLoaded;
		// Made for each page and given only to it: a frame inside the page (a playable) can post too, but not this.
		string pageKey;
		readonly List<string> waitingCalls = new List<string>();
		readonly Dictionary<string, HouseAdDemand> demand = new Dictionary<string, HouseAdDemand>();
		bool asked;   // the page has asked what it can't know: it's told again whenever that may have changed
		float demandTime;

		bool showing;
		int? sleepTimeoutWas;   // the game's own Screen.sleepTimeout while an ad has the screen kept on, put back when it closes
		bool showStarted;
		int showNumber;
		float showRequestedTime;
		Action<HouseAdResult> showDone;

		bool storeOpen;
		bool storeLeftApp;
		float storeOpenedTime;

		// ---- the page ----

		bool EnsurePage()
		{
			if (view != null)
			{
				return true;
			}
			TextAsset page = Resources.Load<TextAsset>(PlayerPage);
			view = page == null ? null : config.createWebView != null ? config.createWebView() : NativeWebView.Create();
			if (view == null)
			{
				return false;
			}
			pageLoaded = false;
			pageKey = Guid.NewGuid().ToString("N");
			waitingCalls.Clear();
			view.MessageReceived += Receive;
			view.BackPressed += HandleBack;
			view.Lost += HandleLost;
			// The catalogue's origin is the page's: its history, downloads and unsent analytics are kept under it.
			view.LoadHtml(page.text, new Uri(new Uri(config.catalogueUrl), "/").AbsoluteUri);
			return true;
		}

		void DropPage()
		{
			if (view == null)
			{
				return;
			}
			view.MessageReceived -= Receive;
			view.BackPressed -= HandleBack;
			view.Lost -= HandleLost;
			view.Dispose();
			view = null;
			pageLoaded = false;
			waitingCalls.Clear();
		}

		void Call(string function, string arguments)
		{
			string js = "houseAdsHost." + function + "(" + arguments + ")";
			if (pageLoaded)
			{
				view.Evaluate(js);
			}
			else
			{
				waitingCalls.Add(js);
			}
		}

		void Receive(string json)
		{
			Batch batch;
			try
			{
				batch = JsonUtility.FromJson<Batch>(json);
			}
			catch (Exception e)
			{
				if (Logging)
				{
					Debug.LogWarning("[HouseAds] unreadable message: " + e.Message);
				}
				return;
			}
			if (batch == null || batch.items == null)
			{
				return;
			}
			for (int i = 0; i < batch.items.Length; i++)
			{
				// Before start() the page has no key, and all it says is that it's there.
				bool first = !pageLoaded && batch.items[i].type == "loaded";
				if (first || (pageLoaded && batch.k == pageKey))
				{
					Handle(batch.items[i]);
				}
			}
		}

		void Handle(Message m)
		{
			if (config.log && m.type != "event")
			{
				Debug.Log("[HouseAds] " + m.type);
			}
			switch (m.type)
			{
				case "loaded":
					if (pageLoaded)
					{
						break;
					}
					pageLoaded = true;
					view.Evaluate("houseAdsHost.start(" + StartConfig() + ")");
					for (int i = 0; i < waitingCalls.Count; i++)
					{
						view.Evaluate(waitingCalls[i]);
					}
					waitingCalls.Clear();
					break;
				case "device":
					asked = true;
					TellDevice();
					break;
				case "demand":
					demand.Clear();
					for (int i = 0; m.demand != null && i < m.demand.Length; i++)
					{
						demand[m.demand[i].placement] = new HouseAdDemand { share = m.demand[i].share, available = m.demand[i].available };
					}
					demandTime = Time.realtimeSinceStartup;
					OnDemandChanged?.Invoke();
					break;
				case "event":
					if (config.log)
					{
						Debug.Log("[HouseAds] " + m.e.@event + " " + m.e.placement + " " + m.e.creative);
					}
					bool shownNow = showing && !showStarted && m.e.@event == "show";
					if (shownNow)
					{
						showStarted = true;
					}
					OnEvent?.Invoke(m.e);
					if (shownNow)
					{
						OnShown?.Invoke();
					}
					break;
				case "store":
					OpenStore(m.link);
					break;
				case "banner":
					if (showing && m.link != null)
					{
						HouseAdsNative.StoreBanner(m.link.id, m.link.ct, m.link.pt);
					}
					break;
				case "done":
					if (showing && m.n == showNumber)
					{
						FinishShow(new HouseAdResult { shown = m.shown, granted = m.granted, creative = m.creative, app = m.app, kind = m.kind, watchedSecs = m.watchedSecs });
					}
					break;
				case "idle":
					if (!showing && !config.keepWebView)
					{
						DropPage();
					}
					break;
			}
		}

		string StartConfig()
		{
			StringBuilder json = new StringBuilder(256 + (config.shippedCatalogueJson != null ? config.shippedCatalogueJson.Length : 0));
			json.Append("{\"key\":").Append(Quote(pageKey));
			json.Append(",\"lang\":").Append(Quote(config.language != null ? config.language() : null));
			json.Append(",\"host\":").Append(Quote(config.host));
			json.Append(",\"rating\":").Append(Quote(config.rating));
			json.Append(",\"os\":").Append(Application.platform == RuntimePlatform.Android ? "\"android\"" : "\"ios\"");
			json.Append(",\"catalogue\":").Append(Quote(config.catalogueUrl));
			json.Append(",\"ingest\":").Append(Quote(config.ingestUrl));
			json.Append(",\"reports\":").Append(Quote(config.reportUrl));
			json.Append(",\"mix\":").Append(Quote(config.mixUrl));
			json.Append(",\"signedBy\":").Append(Quote(config.catalogueKey));
			json.Append(",\"age\":").Append(config.age > 0 ? config.age.ToString() : "null");
			json.Append(",\"test\":").Append(config.test ? "true" : "false");
			json.Append(",\"wide\":").Append(Screen.width > Screen.height ? "true" : "false");   // the page can't see its own shape until it's shown
			json.Append(",\"placements\":{");
			for (int i = 0; config.placements != null && i < config.placements.Length; i++)
			{
				HouseAdPlacement p = config.placements[i];
				json.Append(i > 0 ? "," : "").Append(Quote(p.id)).Append(":{\"format\":");
				json.Append(p.format == HouseAdFormat.Interstitial ? "\"interstitial\"" : "\"rewarded\"");
				if (p.maxSecs > 0)
				{
					json.Append(",\"maxSecs\":").Append(p.maxSecs);
				}
				if (p.format == HouseAdFormat.Interstitial)
				{
					json.Append(",\"skipAfter\":").Append(p.skipAfter.ToString(System.Globalization.CultureInfo.InvariantCulture));
				}
				if (!string.IsNullOrEmpty(p.reward))
				{
					json.Append(",\"reward\":").Append(Quote(p.reward));
				}
				json.Append("}");
			}
			// the shipped catalogue is JSON already, and JSON is JavaScript
			json.Append("},\"shipped\":").Append(string.IsNullOrEmpty(config.shippedCatalogueJson) ? "null" : config.shippedCatalogueJson);
			json.Append("}");
			return json.ToString();
		}

		// ---- what a page can't know ----

		void TellDevice()
		{
			if (view == null || !asked)
			{
				return;
			}
			Call("device", HouseAdsNative.IsMetered() ? "{\"metered\":true}" : "{\"metered\":false}");
		}

		void OnApplicationFocus(bool focused)
		{
			if (storeOpen)
			{
				if (!focused)
				{
					storeLeftApp = true;
				}
				else if (storeLeftApp)
				{
					StoreClosed();
				}
			}
			if (!focused || config == null)
			{
				return;
			}
			// Back at the front: the network may have changed, and a day-old cap may have lapsed.
			if (view != null)
			{
				TellDevice();
			}
			else if (Time.realtimeSinceStartup - demandTime > config.refreshAfterSeconds)
			{
				EnsurePage();
			}
		}

		// ---- showing ----

		bool DoShow(string placement, Action<HouseAdResult> done, string reward)
		{
			if (showing || !EnsurePage())
			{
				return false;
			}
			showing = true;
			showStarted = false;
			showDone = done;
			// The screen stays on for as long as an ad is up: nobody touches a video, or a playable's opening, for
			// longer than a phone waits before it dims, and a web view's page can't ask this of the device itself.
			sleepTimeoutWas = Screen.sleepTimeout;
			Screen.sleepTimeout = SleepTimeout.NeverSleep;
			showRequestedTime = Time.realtimeSinceStartup;
			++showNumber;
			bool muted = config.muted != null && config.muted();
			view.SetVisible(true);
			string language = config.language != null ? config.language() : null;
			Call("show", showNumber + "," + Quote(placement) + "," + Quote(reward) + "," + (muted ? "true" : "false") + "," + Quote(language));
			return true;
		}

		void FinishShow(HouseAdResult result)
		{
			bool wasShown = showStarted;
			if (sleepTimeoutWas.HasValue)
			{
				Screen.sleepTimeout = sleepTimeoutWas.Value;
				sleepTimeoutWas = null;
			}
			showing = false;
			showStarted = false;
			storeOpen = false;
			HouseAdsNative.StoreBanner(null, null, null);   // the page takes it away as it closes; this is for one that never said
			if (view != null)
			{
				view.SetVisible(false);
			}
			Action<HouseAdResult> done = showDone;
			showDone = null;
			if (wasShown)
			{
				OnHidden?.Invoke();
			}
			done?.Invoke(result);
		}

		void Update()
		{
			if (showing && !showStarted && Time.realtimeSinceStartup - showRequestedTime > config.showTimeout)
			{
				if (Logging)
				{
					Debug.LogWarning("[HouseAds] the ad never started: giving up on it");
				}
				DropPage();
				FinishShow(default(HouseAdResult));
			}
			// A store that never took the game from the front (nothing opened): don't leave the ad's clock standing.
			if (storeOpen && !storeLeftApp && !HouseAdsNative.StoreSheetIsUp && Time.realtimeSinceStartup - storeOpenedTime > 3f)
			{
				StoreClosed();
			}
		}

		void HandleBack()
		{
			if (showing && pageLoaded)
			{
				view.Evaluate("houseAdsHost.back()");
			}
		}

		void HandleLost()
		{
			if (Logging)
			{
				Debug.LogWarning("[HouseAds] the web view was lost");
			}
			bool wasShowing = showing;
			DropPage();
			if (wasShowing)
			{
				FinishShow(new HouseAdResult { shown = showStarted });
			}
		}

		// ---- the store ----

		void OpenStore(Link link)
		{
			storeOpen = true;
			storeLeftApp = false;
			storeOpenedTime = Time.realtimeSinceStartup;
			HouseAdsNative.OpenStore(link.id, link.ct, link.pt, link.url, link.fallback, gameObject.name);
		}

		// From the iOS side (UnitySendMessage) once the App Store sheet is put away.
		void NativeStoreClosed(string how)
		{
			StoreClosed();
		}

		void StoreClosed()
		{
			if (!storeOpen)
			{
				return;
			}
			storeOpen = false;
			if (view != null && pageLoaded)
			{
				view.Evaluate("houseAdsHost.storeClosed()");
			}
		}

		// ---- JSON, as much of it as this needs ----

		const char LineSeparator = (char)0x2028, ParagraphSeparator = (char)0x2029;   // end a line in JavaScript, though not in JSON

		static string Quote(string s)
		{
			if (s == null)
			{
				return "null";
			}
			StringBuilder quoted = new StringBuilder(s.Length + 2);
			quoted.Append('"');
			for (int i = 0; i < s.Length; i++)
			{
				char c = s[i];
				if (c == '"' || c == '\\')
				{
					quoted.Append('\\').Append(c);
				}
				else if (c < ' ' || c == LineSeparator || c == ParagraphSeparator || c == '<')
				{
					// '<' too: nothing here may end a script or start a tag, wherever it's put
					quoted.Append("\\u").Append(((int)c).ToString("x4"));
				}
				else
				{
					quoted.Append(c);
				}
			}
			return quoted.Append('"').ToString();
		}

		[Serializable]
		class Batch
		{
			public string k;
			public Message[] items;
		}

		// Every message the page sends (web/host.js), as one shape: JsonUtility leaves what's absent at its default.
		[Serializable]
		class Message
		{
			public string type;
			public int n;
			public bool shown, granted;
			public string creative, app, kind;
			public float watchedSecs;
			public DemandRow[] demand;
			public HouseAdEvent e;
			public Link link;
		}

		[Serializable]
		class DemandRow
		{
			public string placement;
			public float share;
			public int available;
		}

		[Serializable]
		class Link
		{
			public string via, url, fallback, id, ct, pt;
		}
	}
}
