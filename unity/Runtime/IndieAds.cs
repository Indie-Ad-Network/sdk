using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace IndieAdNetwork
{
	public enum IndieAdFormat
	{
		/// The player's choice; watching to the end of the countdown earns the game's reward.
		Rewarded,
		/// The game's choice, between two things the player was doing: no reward, and a way out by the placement's minSecs.
		Interstitial,
	}

	/// Where IndieAds.ShowMoreGames opens the page of more games.
	public enum IndieAdsOpenIn
	{
		/// The device's browser: the player leaves the game for it.
		Browser,
		/// A web view over the game, closed by the page's own ✕ (or the back button).
		Game,
	}

	[Serializable]
	public class IndieAdPlacement
	{
		public string id;
		public IndieAdFormat format = IndieAdFormat.Rewarded;
		[Tooltip("The longest creative this placement takes, in seconds. 0 = any.")]
		public int maxSecs = 30;
		[Tooltip("The least time this placement holds the player to an ad, in seconds. -1 = unsaid. Interstitial: a video offers Skip 3 s before it, and ✕ is on its end card 3 s after Skip (unsaid: skipAfter; 15 at most). Rewarded: the reward can be claimed from then (unsaid: the creative's own time, its end unless it says earlier). The dashboard can say another for a placement, by its name.")]
		public float minSecs = -1f;
		[Tooltip("Interstitial: minSecs, as it was called before 0.6.3. Read where minSecs is unsaid.")]
		public float skipAfter = 5f;
		[Tooltip("Rewarded: what watching earns, as the player is told it (\"Earned: …\"). Empty = \"Reward earned\".")]
		public string reward;
	}

	public class IndieAdsConfig
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
		/// The network's public key, or null for the one in the catalogue shipped with the game (Resources/indie-ads-catalogue.json:
		/// a signing server writes its key into every catalogue it serves, as "signedBy"). With a key the server's catalogue is
		/// used only if the network signed it: someone between the player and the server can't serve ads of their own.
		public string catalogueKey;
		public IndieAdPlacement[] placements;
		/// The web view to play in, if not the package's own (NativeWebView); called whenever one is needed.
		/// Null result = the ads can't show here.
		public Func<IIndieAdsWebView> createWebView;
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
		/// Has the player agreed to anything being kept on their device? The UK and the EEA ask it for advertising. False:
		/// nothing is kept there (ads stream, what's been shown is remembered until the game closes, for which the web
		/// view is kept between ads, and what an earlier session kept is taken away). Say it at Init, not after. IndieAds.SetConsent changes it later; IndieAds.CmpConsent reads a consent
		/// platform's answer. True unless said, as ever.
		public bool consent = true;
		/// A developer trying the ads out (IndieAds.SetTest changes it later): the game's own ads, games that are resting
		/// and creatives at their daily cap all count, and nothing is sent to the ingest. Never on in a player's game.
		public bool test;
		/// Log to the Unity console and the device log: what the page says, its warnings and its web view's console.
		/// Off, the package logs nothing at all.
		public bool log;
	}

	/// What there is to show this player in a placement now, and what share of the game's slots the network asks for.
	public struct IndieAdDemand
	{
		/// 0–1. Already 0 when nothing is available.
		public float share;
		/// How many creatives this player could be shown here: 0 if they have every game, or have seen each as often
		/// as it may be shown today, or none is downloaded yet.
		public int available;
	}

	public struct IndieAdResult
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
	public struct IndieAdEvent
	{
		public string @event, placement, creative, app, kind, why, via, step;
		public float secs;
	}

	/// <summary>
	/// Indie Ad Network in a Unity game: our own and our friends' games, as rewarded ads and interstitials, beside whatever
	/// paid network the game has.
	///
	///   IndieAds.Init(config);                                  // at boot: fetches the catalogue, downloads a few creatives ahead
	///   if (IndieAds.Wants("FreeCoins")) {                       // this slot is the house's (Demand: share and what's available)
	///       IndieAds.Show("FreeCoins", r => { if (r.granted) … });
	///   } else { …the paid network's }
	///
	/// The share is the network's to say (the catalogue, or the ingest's /mix: what's owed between studios), and is
	/// 0 for a player there's nothing to show: they have every game, or have seen each as often as it may be shown
	/// today. So a game asks before every ad and falls back to its paid network on "no".
	///
	/// The ads themselves are the package's web player (Resources/IndieAdsPlayer.html: core/ in one page), in the
	/// package's own web view (NativeWebView: the system's, on iOS and Android).
	/// </summary>
	public class IndieAds : MonoBehaviour
	{
		const string PlayerPage = "IndieAdsPlayer";
		static readonly string[] ShippedCatalogue = { "indie-ads-catalogue", "house-ads-catalogue" };

		static IndieAds instance;
		// The game asked for logs (IndieAdsConfig.log): without, the package writes none.
		internal static bool Logging => instance != null && instance.config != null && instance.config.log;

		public static event Action<IndieAdEvent> OnEvent;
		/// An ad is on screen, whoever showed it: pause the game's music and sound here. Called once a showing.
		public static event Action OnShown;
		/// The ad OnShown told of has closed, before Show's done callback: resume the game's sound here. Not
		/// called for an ad that never appeared, so a game only resumes what it paused.
		public static event Action OnHidden;
		/// What's available, or the share asked for, may have changed.
		public static event Action OnDemandChanged;

		public static bool IsInitialised => instance != null;
		public static bool IsShowing => instance != null && instance.showing;

		/// The catalogue the game shipped with: a TextAsset named indie-ads-catalogue in a Resources folder, or
		/// house-ads-catalogue, its name before 0.6.0, so a game needn't rename the file it ships.
		public static string LoadShippedCatalogue()
		{
			foreach (string name in ShippedCatalogue)
			{
				TextAsset shipped = Resources.Load<TextAsset>(name);
				if (shipped != null) return shipped.text;
			}
			return null;
		}

		public static void Init(IndieAdsConfig config)
		{
			if (instance != null)
			{
				return;
			}
			GameObject go = new GameObject("IndieAds-" + Guid.NewGuid().ToString("N"));
			DontDestroyOnLoad(go);
			instance = go.AddComponent<IndieAds>();
			instance.config = config;
			NativeWebView.LogConsole = config.log;
			if (config.shippedCatalogueJson == null)
			{
				config.shippedCatalogueJson = LoadShippedCatalogue();
			}
			instance.EnsurePage();
		}

		/// Stop this session before logout, opt-out or a change of player. An outstanding Show completes once,
		/// with shown reflecting whether it appeared and granted false. OnHidden precedes that callback if shown.
		/// Safe to call again; Init may be called afterwards, including from the callback. Call on Unity's main thread.
		/// Event subscriptions are retained; persistent storage is not erased (use SetConsent for storage consent).
		public static void Shutdown()
		{
			IndieAds previous = instance;
			if (previous == null) return;
			try { previous.StopSession(); }
			finally { Destroy(previous.gameObject); }
		}

		void OnDestroy() { StopSession(); }

		void StopSession()
		{
			if (stopped) return;
			stopped = true;
			if (instance == this) instance = null; // A callback may initialize the next player.
			enabled = false;
			remake = false;
			demand.Clear();
			try
			{
				// NativeWebView.Dispose destroys its GameObject at frame end; hide it now.
				try
				{
					try { if (view != null) view.SetVisible(false); }
					finally { DropPage(); }
				}
				finally { CloseGames(); }
			}
			finally
			{
				try { IndieAdsNative.CloseStore(gameObject.name); }
				finally
				{
					if (showing) FinishShow(new IndieAdResult { shown = showStarted });
				}
			}
		}

		public static IndieAdDemand Demand(string placement)
		{
			IndieAdDemand demand;
			if (instance != null && !instance.showing && instance.demand.TryGetValue(placement, out demand))
			{
				return demand;
			}
			return default(IndieAdDemand);
		}

		/// Should this slot be the house's? Rolls the share: call once per ad, when it's about to be shown.
		public static bool Wants(string placement)
		{
			IndieAdDemand demand = Demand(placement);
			return demand.available > 0 && UnityEngine.Random.value < demand.share;
		}

		/// Turns test mode (IndieAdsConfig.test) on or off. What's available changes with it: OnDemandChanged says when it's in.
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

		/// The player's answer on things being kept on their device (IndieAdsConfig.consent) has changed. The page is made
		/// again with it, at once, or when the ad that's up has closed.
		public static void SetConsent(bool agreed)
		{
			if (instance == null || instance.config.consent == agreed)
			{
				return;
			}
			instance.config.consent = agreed;
			if (instance.showing)
			{
				instance.remake = true;
				return;
			}
			instance.RemakePage();
		}

		/// What the game's consent platform (Google's, or any on the IAB's framework) has kept of the player's answer:
		/// true (agreed to things being kept on the device, or somewhere that needn't be asked), false (asked, and not
		/// agreed), or null where no platform has said, and the game must go by its own means. Ask once the platform's
		/// dialog has been answered: `consent = IndieAds.CmpConsent() ?? myOwnAnswer`.
		public static bool? CmpConsent()
		{
			return IndieAdsNative.CmpConsent();
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

		/// The address of the network's page of the games this one shows the ads of (https://indieadnetwork.com/games/&lt;this
		/// game's id&gt;, the page an ad's ⓘ leads to), for a game that would do something of its own with it. Null until the
		/// catalogue is in (a moment after Init), where the catalogue names no such page, and for a player the game has said
		/// is under 13 (IndieAdsConfig.age).
		public static string GetMoreGamesURL()
		{
			return instance != null ? instance.moreGamesUrl : null;
		}

		/// For a "More games" button of the game's own: opens that page, in the device's browser or in a web view over the
		/// game with a ✕ of its own. False: there's no page to open (GetMoreGamesURL is null), or an ad is up.
		/// In the game's web view the page is shown only once it says it can be closed; one that doesn't in a few seconds,
		/// or won't load, is handed to the browser. Where there's no web view (the Editor) it's the browser.
		public static bool ShowMoreGames(IndieAdsOpenIn where = IndieAdsOpenIn.Browser)
		{
			if (instance == null || instance.showing || string.IsNullOrEmpty(instance.moreGamesUrl))
			{
				return false;
			}
			if (where != IndieAdsOpenIn.Game || !instance.OpenGames(instance.moreGamesUrl))
			{
				Application.OpenURL(instance.moreGamesUrl);
			}
			return true;
		}

		/// False: nothing will be shown and `done` won't be called. Otherwise `done` is called once, when the ad has
		/// closed (or failed to appear: result.shown false).
		public static bool Show(string placement, Action<IndieAdResult> done, string reward = null)
		{
			return instance != null && instance.DoShow(placement, done, reward);
		}

		IndieAdsConfig config;
		IIndieAdsWebView view;
		bool pageLoaded;
		// Made for each page and given only to it: a frame inside the page (a playable) can post too, but not this.
		string pageKey;
		readonly List<string> waitingCalls = new List<string>();
		readonly Dictionary<string, IndieAdDemand> demand = new Dictionary<string, IndieAdDemand>();
		bool asked;   // the page has asked what it can't know: it's told again whenever that may have changed
		float demandTime;

		bool stopped;
		bool showing;
		bool remake;   // the page is to be made again once the ad that's up has closed: the player's consent changed
		int? sleepTimeoutWas;   // the game's own Screen.sleepTimeout while an ad has the screen kept on, put back when it closes
		bool showStarted;
		int showNumber;
		float showRequestedTime;
		Action<IndieAdResult> showDone;

		string moreGamesUrl;        // the network's page of the games this one shows, as the page says it (web/host.js 'more'); null: none
		NativeWebView games;        // that page, in a web view over the game (ShowMoreGames, in the game)
		string gamesUrl;
		bool gamesReady;            // it has said it can be closed, and is on screen
		float gamesAsked;

		bool storeOpen;
		bool storeLeftApp;
		float storeOpenedTime;

		// ---- the page ----

		bool EnsurePage()
		{
			if (stopped) return false;
			if (view != null)
			{
				return true;
			}
			TextAsset page = Resources.Load<TextAsset>(PlayerPage);
			view = page == null ? null : config.createWebView != null ? config.createWebView() : NativeWebView.Create();
#if UNITY_EDITOR && INDIEADS_HAS_VIDEO && INDIEADS_HAS_IMGUI && INDIEADS_HAS_WEBREQUEST
			if (view == null && page != null)
			{
				view = EditorAds.Create();   // Play mode in the Editor, which has no web view: a stand-in that plays the catalogue's videos
			}
#endif
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

		void RemakePage()
		{
			DropPage();
			EnsurePage();
		}

		void DropPage()
		{
			IIndieAdsWebView previous = view;
			view = null;
			pageLoaded = false;
			waitingCalls.Clear();
			if (previous == null) return;
			previous.MessageReceived -= Receive;
			previous.BackPressed -= HandleBack;
			previous.Lost -= HandleLost;
			previous.Dispose();
		}

		void Call(string function, string arguments)
		{
			string js = "indieAdsHost." + function + "(" + arguments + ")";
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
			if (stopped) return;
			Batch batch;
			try
			{
				batch = JsonUtility.FromJson<Batch>(json);
			}
			catch (Exception e)
			{
				if (Logging)
				{
					Debug.LogWarning("[IndieAds] unreadable message: " + e.Message);
				}
				return;
			}
			if (batch == null || batch.items == null)
			{
				return;
			}
			for (int i = 0; !stopped && i < batch.items.Length; i++)
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
				Debug.Log("[IndieAds] " + m.type);
			}
			switch (m.type)
			{
				case "loaded":
					if (pageLoaded)
					{
						break;
					}
					pageLoaded = true;
					view.Evaluate("indieAdsHost.start(" + StartConfig() + ")");
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
						demand[m.demand[i].placement] = new IndieAdDemand { share = m.demand[i].share, available = m.demand[i].available };
					}
					demandTime = Time.realtimeSinceStartup;
					OnDemandChanged?.Invoke();
					break;
				case "event":
					if (config.log)
					{
						Debug.Log("[IndieAds] " + m.e.@event + " " + m.e.placement + " " + m.e.creative);
					}
					bool shownNow = showing && !showStarted && m.e.@event == "show";
					if (shownNow)
					{
						showStarted = true;
					}
					OnEvent?.Invoke(m.e);
					if (shownNow && !stopped)
					{
						OnShown?.Invoke();
					}
					break;
				case "store":
					OpenStore(m.link);
					break;
				case "more":
					moreGamesUrl = m.link != null && !string.IsNullOrEmpty(m.link.url) ? m.link.url : null;
					break;
				case "banner":
					if (showing && m.link != null)
					{
						IndieAdsNative.StoreBanner(m.link.id, m.link.ct, m.link.pt);
					}
					break;
				case "done":
					if (showing && m.n == showNumber)
					{
						FinishShow(new IndieAdResult { shown = m.shown, granted = m.granted, creative = m.creative, app = m.app, kind = m.kind, watchedSecs = m.watchedSecs });
					}
					break;
				case "idle":
					// without the player's consent what's been shown is remembered in the page alone, so the page is kept
					if (!showing && !config.keepWebView && config.consent)
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
			json.Append(",\"consent\":").Append(config.consent ? "true" : "false");
			json.Append(",\"wide\":").Append(Screen.width > Screen.height ? "true" : "false");   // the page can't see its own shape until it's shown
			json.Append(",\"placements\":{");
			for (int i = 0; config.placements != null && i < config.placements.Length; i++)
			{
				IndieAdPlacement p = config.placements[i];
				json.Append(i > 0 ? "," : "").Append(Quote(p.id)).Append(":{\"format\":");
				json.Append(p.format == IndieAdFormat.Interstitial ? "\"interstitial\"" : "\"rewarded\"");
				if (p.maxSecs > 0)
				{
					json.Append(",\"maxSecs\":").Append(p.maxSecs);
				}
				if (p.minSecs >= 0f)
				{
					json.Append(",\"minSecs\":").Append(p.minSecs.ToString(System.Globalization.CultureInfo.InvariantCulture));
				}
				if (p.format == IndieAdFormat.Interstitial)
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
			Call("device", IndieAdsNative.IsMetered() ? "{\"metered\":true}" : "{\"metered\":false}");
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
			if (stopped || !focused || config == null)
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

		bool DoShow(string placement, Action<IndieAdResult> done, string reward)
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

		void FinishShow(IndieAdResult result)
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
			IndieAdsNative.StoreBanner(null, null, null);   // the page takes it away as it closes; this is for one that never said
			if (view != null)
			{
				view.SetVisible(false);
			}
			Action<IndieAdResult> done = showDone;
			showDone = null;
			try
			{
				if (wasShown) OnHidden?.Invoke();
				if (remake && !stopped)   // the player's consent changed while the ad was up
				{
					remake = false;
					RemakePage();
				}
			}
			finally { done?.Invoke(result); }
		}

		void Update()
		{
			if (stopped) return;
			// A page of games that hasn't said it can be closed isn't put in front of the player: the browser has it
			if (games != null && !gamesReady && Time.realtimeSinceStartup - gamesAsked > GamesPatience)
			{
				HandleGamesFailed(0, "it never said it could be closed");
			}
			if (showing && !showStarted && Time.realtimeSinceStartup - showRequestedTime > config.showTimeout)
			{
				if (Logging)
				{
					Debug.LogWarning("[IndieAds] the ad never started: giving up on it");
				}
				DropPage();
				FinishShow(default(IndieAdResult));
			}
			// A store that never took the game from the front (nothing opened): don't leave the ad's clock standing.
			if (storeOpen && !storeLeftApp && !IndieAdsNative.StoreSheetIsUp && Time.realtimeSinceStartup - storeOpenedTime > 3f)
			{
				StoreClosed();
			}
		}

		// ---- the page of more games, in a web view of the game's own ----

		const string GamesReady = "indie-ads:games-ready", GamesClose = "indie-ads:close";   // what that page says (the server's games.js)
		const float GamesPatience = 6f;   // seconds for it to load and say it can be closed, before the browser has it

		// False: there's no web view to be had here.
		bool OpenGames(string url)
		{
			CloseGames();
			games = NativeWebView.Create();
			if (games == null)
			{
				return false;
			}
			gamesUrl = url;
			gamesReady = false;
			gamesAsked = Time.realtimeSinceStartup;
			games.MessageReceived += HandleGamesSaid;
			games.BackPressed += CloseGames;
			games.Lost += CloseGames;
			games.PageFailed += HandleGamesFailed;
			games.LoadUrl(url + (url.Contains("?") ? "&" : "?") + "in=app");   // as the server gives it to a game: a ✕, and links the stores' own apps take
			return true;
		}

		void HandleGamesSaid(string said)
		{
			if (stopped) return;
			if (said == GamesReady && games != null && !gamesReady)
			{
				gamesReady = true;
				games.SetVisible(true);
			}
			else if (said == GamesClose)
			{
				CloseGames();
			}
		}

		// It wouldn't load: not shown at all. The browser may do better, and is no worse.
		void HandleGamesFailed(int code, string message)
		{
			if (stopped || games == null || gamesReady)
			{
				return;
			}
			string url = gamesUrl;
			CloseGames();
			Application.OpenURL(url);
		}

		void CloseGames()
		{
			NativeWebView previous = games;
			games = null;
			gamesUrl = null;
			gamesReady = false;
			if (previous == null) return;
			previous.MessageReceived -= HandleGamesSaid;
			previous.BackPressed -= CloseGames;
			previous.Lost -= CloseGames;
			previous.PageFailed -= HandleGamesFailed;
			try { previous.SetVisible(false); }
			finally { previous.Dispose(); }
		}

		void HandleBack()
		{
			if (showing && pageLoaded)
			{
				view.Evaluate("indieAdsHost.back()");
			}
		}

		void HandleLost()
		{
			if (Logging)
			{
				Debug.LogWarning("[IndieAds] the web view was lost");
			}
			bool wasShowing = showing;
			DropPage();
			if (wasShowing)
			{
				FinishShow(new IndieAdResult { shown = showStarted });
			}
		}

		// ---- the store ----

		void OpenStore(Link link)
		{
			storeOpen = true;
			storeLeftApp = false;
			storeOpenedTime = Time.realtimeSinceStartup;
			IndieAdsNative.OpenStore(link.id, link.ct, link.pt, link.url, link.fallback, gameObject.name);
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
				view.Evaluate("indieAdsHost.storeClosed()");
			}
		}

		// ---- JSON, as much of it as this needs ----

		const char LineSeparator = (char)0x2028, ParagraphSeparator = (char)0x2029;   // end a line in JavaScript, though not in JSON

		internal static string Quote(string s)
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
			public IndieAdEvent e;
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
