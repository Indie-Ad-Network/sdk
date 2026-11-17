#if UNITY_EDITOR && INDIEADS_HAS_VIDEO && INDIEADS_HAS_IMGUI && INDIEADS_HAS_WEBREQUEST
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.Video;

namespace IndieAdNetwork
{
	/// <summary>
	/// The ads in the Editor's Play mode, where there is no web view to play them in: a stand-in for the page, so a
	/// game's own code can be tried without a device. Show answers true, an ad goes up over the Game view, and the
	/// callbacks and events come as they do on a phone.
	///
	/// It is not the player. It reads the catalogue (the server's, else the one shipped) and plays its videos, the
	/// real ones, with Unity's VideoPlayer, under a countdown, a close button and a store button of its own drawing.
	/// A video is shown as its creative asks (CREATIVES.md): its end card's art, where its store button sits and the
	/// picture of it, its pulse, a card of its own, a fade, a loop, and when a tap opens the store. So a creative's
	/// layout and timing can be judged here; its look can't, the letters and the buttons being Unity's.
	/// What it leaves out: playables (they need a web view), the blur behind what doesn't fill the screen, pictures in
	/// WebP (Unity reads JPEG and PNG), caps, resting, languages and the mix (the share is the catalogue's own, what a
	/// studio owes left out), and it sends nothing to the ingest. With no video to show, a rewarded placement gets a
	/// card that counts down, as a phone with no ad ready does, and an interstitial nothing.
	/// Two buttons under its label are for whoever is testing: the ad's end now, and "nothing was shown".
	///
	/// Compiled only in the Editor, and only where the Video, IMGUI and UnityWebRequest modules are in the project
	/// (pictures need Image Conversion too).
	/// IndieAds takes it where neither the game's own web view nor NativeWebView is to be had (IndieAds.EnsurePage).
	/// </summary>
	class EditorAds : MonoBehaviour, IIndieAdsWebView
	{
		public event Action<string> MessageReceived;
#pragma warning disable 67   // never raised here: the Editor has no back button, and no process to lose
		public event Action BackPressed;
		public event Action Lost;
#pragma warning restore 67

		const float HoldSecs = 3f;           // an interstitial's video left by Skip: how long its end stands before ✕
		const float SkipSecs = 5f, SkipMost = 15f;   // an interstitial's least time where no one says, and the most it may be (core/pick.js)
		const float SkipBy = SkipMost - HoldSecs;    // the latest Skip is shown, so that ✕, HoldSecs after it, is never later than SkipMost

		// The shape of the Game view, as a creative says its own.
		static string Shape => Screen.width > Screen.height ? "16:9" : "9:16";
		const float Slack = 0.05f;           // two times this near are the same time (core/pick.js SLACK)
		const float StillCardSecs = 5f;      // what a rewarded placement with no video counts down
		const float CatalogueWait = 4f;      // how long a Show waits on the catalogue before going without
		static bool said;

		public static EditorAds Create()
		{
			GameObject go = new GameObject("IndieAds (Editor stand-in)");
			DontDestroyOnLoad(go);
			if (!said)
			{
				said = true;
				Debug.Log("[IndieAds] In the Editor ads are a stand-in: the catalogue's videos, played by Unity, with no caps and nothing counted. Playables and the real player are on a device.");
			}
			EditorAds made = go.AddComponent<EditorAds>();
			made.useGUILayout = false;   // nothing here is laid out by GUILayout
			made.enabled = false;
			return made;
		}

		// ---- what IndieAds asks of a web view ----

		public void LoadHtml(string html, string baseUrl)
		{
			StartCoroutine(SayLoaded());
		}

		IEnumerator SayLoaded()
		{
			yield return null;   // as a page does: after LoadHtml has returned
			MessageReceived?.Invoke("{\"items\":[{\"type\":\"loaded\"}]}");
		}

		public void SetVisible(bool visible)
		{
			if (!visible)
			{
				Clear();   // the ad is over, whoever ended it
			}
		}

		public void Dispose()
		{
			Clear();
			if (this != null)
			{
				Destroy(gameObject);
			}
		}

		// "indieAdsHost.show(3,"FreeCoins",null,false,"en")": what the page would be asked, answered here.
		public void Evaluate(string javascript)
		{
			const string prefix = "indieAdsHost.";
			int open = javascript.IndexOf('(');
			if (!javascript.StartsWith(prefix) || open < 0 || !javascript.EndsWith(")"))
			{
				return;
			}
			string function = javascript.Substring(prefix.Length, open - prefix.Length);
			List<object> args;
			try
			{
				args = (List<object>)Json.Parse("[" + javascript.Substring(open + 1, javascript.Length - open - 2) + "]");
			}
			catch (Exception e)
			{
				Debug.LogWarning("[IndieAds] Editor stand-in: " + function + " not understood: " + e.Message);
				return;
			}
			switch (function)
			{
				case "start": Begin(args[0] as Dictionary<string, object>); break;
				case "test": test = args.Count > 0 && args[0] is bool testing && testing; SayDemand(); break;
				case "offered": if (args.Count > 0) SayEvent("offer", args[0] as string, null, 0f); break;
				case "show": StartCoroutine(Show(Convert.ToInt32(args[0]), args[1] as string, args[2] as string, args[3] is bool muted && muted)); break;
				case "back": if (ad != null) Close(ad.started); break;
			}
		}

		// ---- the catalogue ----

		string key, host, rating, catalogueUrl;
		bool test, loading;
		Dictionary<string, object> placements, catalogue;

		void Begin(Dictionary<string, object> config)
		{
			key = Json.Str(config, "key");
			host = Json.Str(config, "host");
			rating = Json.Str(config, "rating");
			catalogueUrl = Json.Str(config, "catalogue");
			test = Json.Bool(config, "test");
			placements = Json.Dict(config, "placements") ?? new Dictionary<string, object>();
			catalogue = Json.Dict(config, "shipped");
			StartCoroutine(Fetch());
		}

		IEnumerator Fetch()
		{
			if (string.IsNullOrEmpty(catalogueUrl))
			{
				SayDemand();
				yield break;
			}
			loading = true;
			string url = catalogueUrl + (catalogueUrl.Contains("?") ? "&" : "?") + "host=" + UnityWebRequest.EscapeURL(host ?? "");
			using (UnityWebRequest request = UnityWebRequest.Get(url))
			{
				request.timeout = 6;
				yield return request.SendWebRequest();
				if (request.result == UnityWebRequest.Result.Success)
				{
					try
					{
						if (Json.Parse(request.downloadHandler.text) is Dictionary<string, object> fetched && Json.Dict(fetched, "apps") != null)
						{
							catalogue = fetched;
						}
					}
					catch (Exception e)
					{
						Debug.LogWarning("[IndieAds] Editor stand-in: the server's catalogue couldn't be read: " + e.Message);
					}
				}
				else if (IndieAds.Logging)
				{
					Debug.LogWarning("[IndieAds] Editor stand-in: no catalogue from " + url + " (" + request.error + "): going by the one shipped, if any");
				}
			}
			loading = false;
			// the page of the games this one shows, for a button of the game's own (IndieAds.GetMoreGamesURL): its address, or none
			string more = Json.Str(catalogue, "more");
			Say("{\"type\":\"more\",\"link\":{\"url\":" + IndieAds.Quote(more != null ? more + UnityWebRequest.EscapeURL(host ?? "") : null) + "}}");
			SayDemand();
		}

		static int AgeOf(string r)
		{
			int n = 0;
			for (int i = 0; r != null && i < r.Length && char.IsDigit(r[i]); i++)
			{
				n = n * 10 + (r[i] - '0');
			}
			return n;
		}

		// The videos this placement could be shown: another game's (the game's own too in test mode), rated no higher
		// than the game, and no longer than the placement takes.
		List<Dictionary<string, object>> Videos(string placement)
		{
			List<Dictionary<string, object>> found = new List<Dictionary<string, object>>();
			Dictionary<string, object> apps = Json.Dict(catalogue, "apps"), place = Json.Dict(placements, placement);
			if (apps == null || place == null || !(Json.Get(catalogue, "creatives") is List<object> creatives))
			{
				return found;
			}
			double maxSecs = Json.Num(place, "maxSecs", 0);
			bool interstitial = Json.Str(place, "format") == "interstitial";
			float least = Least(placement);
			foreach (object each in creatives)
			{
				Dictionary<string, object> c = each as Dictionary<string, object>, app = Json.Dict(apps, Json.Str(c, "app"));
				if (app == null || Json.Str(c, "kind") != "video" || string.IsNullOrEmpty(Json.Str(c, "src")) || (!test && Json.Str(c, "app") == host))
				{
					continue;
				}
				if (rating != null && (AgeOf(Json.Str(app, "rating")) > AgeOf(rating) || AgeOf(Json.Str(c, "rating")) > AgeOf(rating)))
				{
					continue;
				}
				// cut for one shape of screen and kept to it (`aspectOnly`): not for a screen the other way up
				if (Json.Bool(c, "aspectOnly") && Json.Str(c, "aspect") != null && Json.Str(c, "aspect") != Shape)
				{
					continue;
				}
				// as core/pick.js: an interstitial's time is the game's, so one not to be left before a later second isn't shown there;
				// and one longer than the placement takes is shown only if it may be left by then, or may run on
				double skipFrom = Json.Num(c, "skipFrom", -1);
				if (interstitial && skipFrom > least + Slack)
				{
					continue;
				}
				if (maxSecs > 0 && Json.Num(c, "secs", 0) > maxSecs + Slack && !Json.Bool(c, "overrun") && !(skipFrom >= 0 && skipFrom <= maxSecs + Slack))
				{
					continue;
				}
				found.Add(c);
			}
			return found;
		}

		// The least time a placement holds the player to an ad (core/pick.js leastOf): what the catalogue says for it by name,
		// else what it says for the game's ads of that kind, else the game's code. An interstitial's is 5 s unsaid (`skipAfter`, as it was called), 15 at most; a rewarded one's is
		// -1 where no one has said, and its creative's own time rules.
		float Least(string placement)
		{
			Dictionary<string, object> place = Json.Dict(placements, placement), said = Json.Dict(Own, "placements");
			string format = Json.Str(place, "format") == "interstitial" ? "interstitial" : "rewarded";
			double min = Json.Num(Json.Dict(said, placement), "minSecs", -1);
			if (min < 0)   // the game's, for ads of this kind
			{
				min = Json.Num(Json.Dict(Own, "minSecs"), format, -1);
			}
			if (min < 0)
			{
				min = Json.Num(place, "minSecs", -1);
			}
			if (format != "interstitial")
			{
				return (float)min;
			}
			double before = Json.Num(place, "skipAfter", -1);
			return Mathf.Min(SkipMost, (float)(min >= 0 ? min : before >= 0 ? before : SkipSecs));
		}

		// What the catalogue says of this game alone: its part of the exchange's settings.
		Dictionary<string, object> Own => Json.Dict(Json.Dict(Json.Dict(catalogue, "exchange"), "hosts"), host);

		// The share the catalogue asks of a placement, as it stands with nothing owed: the placement's own, the game's, or the network's.
		float Share(string placement)
		{
			Dictionary<string, object> exchange = Json.Dict(catalogue, "exchange"), own = Own, place = Json.Dict(Json.Dict(own, "placements"), placement);
			return Mathf.Clamp01((float)Json.Num(place, "share", Json.Num(own, "share", Json.Num(exchange, "share", 0))));
		}

		void SayDemand()
		{
			if (placements == null)
			{
				return;
			}
			StringBuilder rows = new StringBuilder();
			foreach (string placement in placements.Keys)
			{
				int available = Videos(placement).Count;
				rows.Append(rows.Length > 0 ? "," : "").Append("{\"placement\":").Append(IndieAds.Quote(placement)).Append(",\"share\":").Append((available > 0 ? Share(placement) : 0f).ToString(CultureInfo.InvariantCulture))
					.Append(",\"available\":").Append(available).Append("}");
			}
			Say("{\"type\":\"demand\",\"demand\":[" + rows + "]}");
		}

		// ---- saying things, as the page does ----

		void Say(string item)
		{
			MessageReceived?.Invoke("{\"k\":" + IndieAds.Quote(key) + ",\"items\":[" + item + "]}");
		}

		void SayEvent(string name, string placement, Ad of, float secs)
		{
			Say("{\"type\":\"event\",\"e\":{\"event\":" + IndieAds.Quote(name) + ",\"placement\":" + IndieAds.Quote(placement) + ",\"creative\":" + IndieAds.Quote(of?.creative) + ",\"app\":" + IndieAds.Quote(of?.app)
				+ ",\"kind\":" + IndieAds.Quote(of?.kind) + ",\"secs\":" + secs.ToString("0.#", CultureInfo.InvariantCulture) + "}}");
		}

		// ---- an ad ----

		// What a video ends on, as the player has it (core/player.js): its card; the store button alone, over its loop or
		// over the card of its own it rests on (`ownCard`); or nothing of the player's at all (`ownEndCard`, as was).
		enum Ends { Card, Bare, Own }

		class Ad
		{
			public int n;
			public string placement, creative, app, kind, name, line, store, reward;
			public bool rewarded, started, granted, ended, muted;
			public float rewardAt, cardStarted, length;
			// an interstitial's video (core/player.js): Skip is there at `skipAt`, the game's time (SkipBy in at the latest); Skip takes it to its end,
			// where ✕ is `hold` seconds later. One that reaches its end by itself has ✕ at once. `leftAt`: where it was skipped from
			public float skipAt, hold, leftAt = -1f;
			public bool rests;   // it ends on a card of its own (`ownCard`), and rests on its last frame
			// how the creative asks to be shown (CREATIVES.md, "Dressing the end card, and how a video is shown")
			public Ends ends;
			public bool modern, matching, during = true, darken = true, ctaFade;
			public string ctaType, artShape;
			public float endSecs = 3f, endedAt, ctaShownAt = -1f;
			public Dictionary<string, object> arts;
			public Texture2D icon;
			public Texture2D art, picture;                     // the end card's art, and the store button as a picture
			public Dictionary<string, object> button;          // `storeButton`: where it sits for each shape of screen
			public float pulseSecs, pulseScale = 1f;
			public float fade, loopFrom = -1f, buttonFrom, wholeFrom = float.PositiveInfinity;
		}

		Ad ad;
		VideoPlayer video;

		// a second of the video, or 'end': never while it plays
		static float From(object when, float otherwise) => when is double secs ? (float)secs : when as string == "end" ? float.PositiveInfinity : otherwise;

		static bool ForAndroid => UnityEditor.EditorUserBuildSettings.activeBuildTarget == UnityEditor.BuildTarget.Android;

		IEnumerator Show(int n, string placement, string reward, bool muted)
		{
			Dictionary<string, object> place = Json.Dict(placements, placement);
			Ad next = new Ad { n = n, placement = placement, rewarded = Json.Str(place, "format") != "interstitial", reward = reward ?? Json.Str(place, "reward"), muted = muted };
			for (float waited = 0f; loading && waited < CatalogueWait; waited += Time.unscaledDeltaTime)
			{
				yield return null;
			}
			Clear();
			ad = next;
			enabled = true;
			float least = Least(placement);   // once the catalogue is in: it may say the time
			ad.skipAt = Mathf.Clamp(least, 0f, SkipBy);   // core/pick.js skipAtOf: at the game's time, SkipBy in at the latest
			List<Dictionary<string, object>> videos = Videos(placement);
			if (videos.Count == 0)
			{
				NothingToPlay();
				yield break;
			}
			// the screen's own shape first, if there is one of it
			string shape = Shape;
			List<Dictionary<string, object>> fits = videos.FindAll(v => Json.Str(v, "aspect") == shape);
			List<Dictionary<string, object>> pool = fits.Count > 0 ? fits : videos;
			Dictionary<string, object> c = pool[UnityEngine.Random.Range(0, pool.Count)], app = Json.Dict(Json.Dict(catalogue, "apps"), Json.Str(c, "app"));
			ad.creative = Json.Str(c, "id");
			ad.app = Json.Str(c, "app");
			ad.kind = "video";
			ad.name = Json.Str(app, "name");
			ad.line = Json.Str(c, "line") ?? Json.Str(app, "line");
			ad.store = StoreOf(app);
			ad.length = (float)Json.Num(c, "secs", 15);
			// the reward: at the game's time, where it says one, or the creative's own earliest (`skipFrom`), and with both the later;
			// with neither at its end, or at the placement's longest for one marked `overrun`
			double skipFrom = Json.Num(c, "skipFrom", -1), maxSecs = Json.Num(place, "maxSecs", 0);
			ad.rewardAt = Mathf.Min(ad.length, skipFrom >= 0 ? Mathf.Max(least, (float)skipFrom) : least >= 0 ? least : Json.Bool(c, "overrun") && maxSecs > 0 ? (float)maxSecs : ad.length);
			Dress(c);
			string iconPath = Json.Str(app, "icon");
			Ad iconAd = ad;
			if (ad.modern && iconPath != null) StartCoroutine(Picture(iconPath, "app icon", t => { if (ad == iconAd) iconAd.icon = t; else Destroy(t); }));

			video = gameObject.AddComponent<VideoPlayer>();
			video.playOnAwake = false;
			video.source = VideoSource.Url;
			video.url = At(Json.Str(c, "src"));
			video.renderMode = VideoRenderMode.APIOnly;
			video.isLooping = false;
			video.skipOnDrop = true;
			video.audioOutputMode = VideoAudioOutputMode.Direct;
#if UNITY_2022_2_OR_NEWER
			video.timeUpdateMode = VideoTimeUpdateMode.UnscaledGameTime;   // a game may stop its own clock under an ad
#endif
			Ad mine = ad;
			video.prepareCompleted += player =>
			{
				if (ad != mine)
				{
					return;
				}
				if (player.length > 0)
				{
					mine.length = (float)player.length;
				}
				Mute(mine.muted);
				player.Play();
				mine.started = true;
				SayEvent("show", mine.placement, mine, 0f);
			};
			video.errorReceived += (player, message) =>
			{
				if (ad != mine || mine.started)
				{
					return;
				}
				Debug.LogWarning("[IndieAds] Editor stand-in: " + mine.creative + " wouldn't play (" + message + ")");
				DropVideo();
				NothingToPlay();
			};
			video.loopPointReached += player =>
			{
				if (ad != mine)
				{
					return;
				}
				if (!mine.ended)
				{
					End();
				}
				else if (mine.loopFrom >= 0f)
				{
					Again();
				}
			};
			video.Prepare();
		}

		// a file the catalogue names is beside the catalogue
		string At(string path) => new Uri(new Uri(catalogueUrl), path).AbsoluteUri;

		// How the creative asks to be shown: what it ends on, its card's art, where its store button sits and what it
		// looks like, and when things happen.
		void Dress(Dictionary<string, object> c)
		{
			Dictionary<string, object> tap = Json.Dict(c, "tap"), loop = Json.Dict(c, "loop"), arts = Json.Dict(c, "endCard");
			ad.matching = Json.Str(c, "endCardMode") == "orientation";
			Dictionary<string, object> cta = Json.Dict(c, "endCardCta");
			ad.modern = ad.matching || cta != null || Json.Get(c, "endCardSecs") != null;
			ad.endSecs = Mathf.Clamp((float)Json.Num(c, "endCardSecs", 3), 0f, 30f);
			ad.ctaType = Json.Str(cta, "type");
			ad.during = Json.Get(cta, "during") == null || Json.Bool(cta, "during");
			ad.darken = Json.Get(cta, "darken") == null || Json.Bool(cta, "darken");
			ad.ctaFade = Json.Bool(cta, "fade") || Json.Num(cta, "fade", 0) > 0;
			ad.button = cta != null ? ad.ctaType == "custom" ? cta : null : Json.Dict(c, "storeButton");
			ad.arts = arts;
			ad.loopFrom = (float)Json.Num(loop, "from", -1);
			ad.rests = Json.Bool(c, "ownCard");
			ad.ends = Json.Bool(c, "ownEndCard") ? Ends.Own : ad.loopFrom >= 0f || ad.rests ? Ends.Bare : Ends.Card;
			ad.fade = Mathf.Clamp((float)Json.Num(c, "fade", 0), 0f, 5f);
			ad.buttonFrom = From(Json.Get(tap, "button"), 0f);
			ad.wholeFrom = ad.ends == Ends.Own ? 0f : From(Json.Get(tap, "whole"), float.PositiveInfinity);
			object pulse = Json.Get(ad.button, "pulse");
			if (pulse is Dictionary<string, object> || (pulse is bool on && on))
			{
				ad.pulseSecs = Mathf.Max(0.1f, (float)Json.Num(pulse as Dictionary<string, object>, "secs", 1));
				ad.pulseScale = ad.ctaType == "custom" ? (float)Json.Num(pulse as Dictionary<string, object>, "maxSize", 105) / 100f : (float)Json.Num(pulse as Dictionary<string, object>, "scale", 1.05);
			}
			RefreshArt();
			string picture = ad.ctaType == "custom" ? Json.Str(cta, "image") : Json.Str(ad.button, ForAndroid ? "android" : "ios");
			Ad mine = ad;
			if (picture != null)
			{
				StartCoroutine(Picture(picture, "button picture", t => { if (ad == mine) mine.picture = t; else Destroy(t); }));
			}
		}

		void RefreshArt()
		{
			string shape = Screen.width > Screen.height ? "landscape" : "portrait";
			if (ad.artShape == shape) return;
			ad.artShape = shape;
			Destroy(ad.art); ad.art = null;
			string path = Json.Str(ad.arts, shape) ?? (ad.matching ? null : Json.Str(ad.arts, shape == "portrait" ? "landscape" : "portrait"));
			if (path == null || ad.ends != Ends.Card) return;
			Ad mine = ad;
			StartCoroutine(Picture(path, "end card art", t => { if (ad == mine && mine.artShape == shape) mine.art = t; else Destroy(t); }));
		}

		// A picture the creative names, as a texture. Unity reads JPEG and PNG: one in WebP is left out, and said.
		IEnumerator Picture(string path, string what, Action<Texture2D> got)
		{
			using (UnityWebRequest request = UnityWebRequest.Get(At(path)))
			{
				request.timeout = 10;
				yield return request.SendWebRequest();
				if (request.result != UnityWebRequest.Result.Success)
				{
					Debug.LogWarning("[IndieAds] Editor stand-in: the " + what + " couldn't be fetched (" + request.error + "): shown without");
					yield break;
				}
				byte[] bytes = request.downloadHandler.data;
				bool webp = bytes.Length > 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F' && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
				Texture2D texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
#if INDIEADS_HAS_IMAGES
				if (!webp && texture.LoadImage(bytes, true))
				{
					got(texture);
					yield break;
				}
#endif
				Destroy(texture);
				Debug.LogWarning("[IndieAds] Editor stand-in: the " + what + (webp ? " is WebP, which Unity can't read" : " couldn't be read") + ": shown without here. A device shows it.");
			}
		}

		void Mute(bool muted)
		{
			for (ushort track = 0; video != null && track < video.audioTrackCount; track++)
			{
				video.SetDirectAudioMute(track, muted);
			}
		}

		static string StoreOf(Dictionary<string, object> app)
		{
			Dictionary<string, object> ios = Json.Dict(app, "ios"), android = Json.Dict(app, "android"), web = Json.Dict(app, "web");
			string apple = Json.Get(ios, "id") != null ? "https://apps.apple.com/app/id" + Convert.ToString(Json.Get(ios, "id"), CultureInfo.InvariantCulture) : null;
			string google = Json.Str(android, "package") != null ? "https://play.google.com/store/apps/details?id=" + UnityWebRequest.EscapeURL(Json.Str(android, "package")) : null;
			return (ForAndroid ? google ?? apple : apple ?? google) ?? Json.Str(web, "url");
		}

		// No video to play: a rewarded placement gets the still card, and an interstitial shows nothing.
		void NothingToPlay()
		{
			if (ad.rewarded)
			{
				StillCard();
			}
			else
			{
				Close(false);
			}
		}

		// What a rewarded placement shows with no ad ready: a card, and the reward when it has counted down.
		void StillCard()
		{
			ad.kind = "card";
			ad.name = "No ad to show";
			ad.line = "A device shows a still card here, and gives the reward all the same.";
			ad.rewardAt = ad.length = StillCardSecs;
			ad.cardStarted = Time.unscaledTime;
			ad.started = true;
			SayEvent("show", ad.placement, ad, 0f);
		}

		// How far into the ad the player is: a video past its end (resting, or going round its loop) stays at its length.
		float Watched => ad == null || !ad.started ? 0f : ad.kind == "card" ? Mathf.Min(Time.unscaledTime - ad.cardStarted, ad.length) : ad.ended || video == null ? (ad.leftAt >= 0f ? ad.leftAt : ad.length) : (float)video.time;

		// How far the card has come up over the video's last seconds (`fade`): 0 to 1.
		float Faded => ad == null || ad.kind != "video" || ad.ended || ad.fade <= 0f ? 0f : Mathf.Clamp01((Watched - (ad.length - ad.fade)) / ad.fade);

		void Update()
		{
			if (ad == null || !ad.started)
			{
				return;
			}
			if (ad.rewarded && !ad.granted && Watched >= ad.rewardAt - 0.05f)
			{
				Grant();
			}
			if (ad.kind == "card" && !ad.ended && Watched >= ad.length)
			{
				ad.ended = true;
			}
			if (ad.hold > 0f && (!ad.modern || Application.isFocused))
			{
				ad.hold = Mathf.Max(0f, ad.hold - Time.unscaledDeltaTime);
			}
			float faded = Faded;
			for (ushort track = 0; faded > 0f && video != null && track < video.audioTrackCount; track++)
			{
				video.SetDirectAudioVolume(track, 1f - faded);   // the sound goes down as the card comes up
			}
		}

		void Grant()
		{
			ad.granted = true;
			SayEvent("complete", ad.placement, ad, Watched);
			SayEvent("reward", ad.placement, ad, Watched);
		}

		// The video is over: it rests on its last frame, under its card or the button alone, or goes round its loop.
		// `skipped`: left for its end before it got there (an interstitial's Skip, or a reward claimed early): from where is kept,
		// it's put at its last frame, and an interstitial's ✕ waits HoldSecs.
		void End(bool skipped = false)
		{
			if (ad == null || ad.ended)
			{
				return;
			}
			if (skipped)
			{
				ad.leftAt = Watched;
				SayEvent("skip", ad.placement, ad, ad.leftAt);
				ad.hold = ad.rewarded ? 0f : HoldSecs;
				if (video != null && ad.loopFrom < 0f)
				{
					video.time = Mathf.Max(0f, ad.length - 0.05f);
				}
			}
			ad.ended = true;
			ad.endedAt = Time.unscaledTime;
			if (ad.modern) ad.hold = ad.endSecs;
			if (ad.rewarded && !ad.granted)
			{
				Grant();
			}
			if (ad.loopFrom >= 0f)
			{
				Again();
			}
			else if (video != null && video.isPlaying)
			{
				video.Pause();
			}
		}

		// Round its loop: from there, silent.
		void Again()
		{
			if (video == null)
			{
				return;
			}
			Mute(true);
			video.time = Mathf.Clamp(ad.loopFrom, 0f, Mathf.Max(0f, ad.length - 0.1f));
			video.Play();
		}

		void OpenStore()
		{
			SayEvent("store_open", ad.placement, ad, Watched);
			Application.OpenURL(ad.store);
		}

		// The ad is closed, by its ✕ or because nothing could be shown. `shown`: whether anything was put up.
		void Close(bool shown)
		{
			if (ad == null)
			{
				return;
			}
			Ad was = ad;
			float watched = Watched;
			Clear();
			if (shown)
			{
				SayEvent(was.rewarded && !was.granted ? "exit_early" : "exit_kept", was.placement, was, watched);
			}
			else
			{
				SayEvent("fail", was.placement, was, 0f);
			}
			Say("{\"type\":\"done\",\"n\":" + was.n + ",\"shown\":" + (shown ? "true" : "false") + ",\"granted\":" + (shown && was.granted ? "true" : "false") + ",\"creative\":" + IndieAds.Quote(was.creative)
				+ ",\"app\":" + IndieAds.Quote(was.app) + ",\"kind\":" + IndieAds.Quote(was.kind) + ",\"watchedSecs\":" + watched.ToString("0.##", CultureInfo.InvariantCulture) + "}");
		}

		void DropVideo()
		{
			if (video != null)
			{
				video.Stop();
				Destroy(video);
				video = null;
			}
		}

		void Clear()
		{
			if (ad != null)
			{
				Destroy(ad.art);
				Destroy(ad.picture);
				Destroy(ad.icon);
			}
			ad = null;
			DropVideo();
			enabled = false;   // nothing to draw or count between ads: a game being profiled isn't charged for it
		}

		// ---- drawn over the Game view ----

		GUIStyle label, small, title, button, smallButton, pill;
		int styledFor;

		void Styles(int unit)
		{
			if (label != null && styledFor == unit)
			{
				return;
			}
			styledFor = unit;
			label = new GUIStyle(GUI.skin.label) { fontSize = unit, alignment = TextAnchor.MiddleCenter, wordWrap = true, normal = { textColor = Color.white } };
			small = new GUIStyle(label) { fontSize = Mathf.RoundToInt(unit * 0.75f) };
			title = new GUIStyle(label) { fontSize = Mathf.RoundToInt(unit * 1.6f), fontStyle = FontStyle.Bold };
			button = new GUIStyle(GUI.skin.button) { fontSize = unit, fontStyle = FontStyle.Bold };
			smallButton = new GUIStyle(button) { fontSize = small.fontSize };
			pill = new GUIStyle(label) { fontStyle = FontStyle.Bold, wordWrap = false, clipping = TextClipping.Clip };
		}

		static void Fill(Rect r, Color colour)
		{
			Color was = GUI.color;
			GUI.color = colour;
			GUI.DrawTexture(r, Texture2D.whiteTexture);
			GUI.color = was;
		}

		static readonly Color Blue = new Color(0.12f, 0.44f, 0.84f);   // the player's store button

		// Where the creative puts its store button on a screen this shape (core/player.js `dress`): lengths in 1/720 of the
		// screen's shorter side; set against an edge it's that far in from it, against a centre that far from it. Left
		// out: bottom centre, 360 wide, 128 up. `tall`: its height for each of its width.
		Rect Placed(int w, int h, float tall)
		{
			Dictionary<string, object> at = ad.ctaType == "custom" ? ad.button : Json.Dict(ad.button, w > h ? "landscape" : "portrait");
			string[] anchor = (Json.Str(at, "anchor") ?? "bottom-center").Split('-');
			string row = anchor[0], col = anchor.Length > 1 ? anchor[1] : "center";
			float u = Mathf.Min(w, h) / 720f, width = (float)Json.Num(at, "width", 360) * u, height = width * tall, x = (float)Json.Num(at, "x", 0) * u, y = (float)Json.Num(at, "y", 128) * u;
			float left = col == "left" ? x : col == "right" ? w - x - width : w / 2f + x - width / 2f;
			float top = row == "top" ? y : row == "bottom" ? h - y - height : h / 2f + y - height / 2f;
			return new Rect(left, top, width, height);
		}

		// The store button: `picture`, the creative's own of it, or with none the player's in words. → it was pressed.
		bool StoreButton(Rect r, Texture2D picture, bool pulses)
		{
			if (pulses && ad.pulseSecs > 0f)
			{
				float swell = 1f + (ad.pulseScale - 1f) * 0.5f * (1f - Mathf.Cos(Time.unscaledTime / ad.pulseSecs * 2f * Mathf.PI));
				r = new Rect(r.center.x - r.width * swell / 2f, r.center.y - r.height * swell / 2f, r.width * swell, r.height * swell);
			}
			if (picture != null)
			{
				GUI.DrawTexture(r, picture, ScaleMode.StretchToFill);
			}
			else
			{
				Fill(r, ad.modern ? new Color(Blue.r, Blue.g, Blue.b, GUI.color.a) : Blue);
				pill.fontSize = Mathf.Max(14, Mathf.RoundToInt(r.width / 9f));
				GUI.Label(r, "Get " + ad.name, pill);
			}
			return GUI.Button(r, GUIContent.none, GUIStyle.none);
		}

		void OnGUI()
		{
			if (ad == null)
			{
				return;
			}
			GUI.depth = -32000;   // over the game's own IMGUI
			int w = Screen.width, h = Screen.height, unit = Mathf.Max(12, Mathf.Min(w, h) / 32), pad = unit;
			Styles(unit);
			if (ad.modern) RefreshArt();
			Rect all = new Rect(0, 0, w, h);
			Fill(all, Color.black);
			if (video != null && video.texture != null)
			{
				GUI.DrawTexture(all, video.texture, ScaleMode.ScaleToFit);
			}
			if (!ad.started)
			{
				GUI.Label(all, "Loading the ad…", label);
			}
			float watched = Watched;
			bool still = ad.kind == "card", over = ad.ended && !still;

			// the end card: the creative's art, whole, or the game's name and line. Coming up over a fade; not for a video that ends on anything else
			float card = still ? 1f : ad.ends != Ends.Card ? 0f : over ? 1f : Faded;
			if (card > 0f)
			{
				float shade = ad.modern && (ad.ctaType != null || ad.art != null) ? 0f : ad.art != null ? 1f : 0.7f;
				Fill(all, new Color(0f, 0f, 0f, shade * card));
				if (ad.art != null)
				{
					Color was = GUI.color;
					GUI.color = new Color(1f, 1f, 1f, card);
					GUI.DrawTexture(all, ad.art, ScaleMode.ScaleToFit);
					GUI.color = was;
				}
				else if (ad.ctaType == null)
				{
					GUI.Label(new Rect(pad, h * 0.24f, w - 2 * pad, unit * 3), ad.name ?? "", title);
					GUI.Label(new Rect(pad * 2, h * 0.24f + unit * 3.2f, w - 4 * pad, unit * 5), ad.line ?? "", label);
				}
			}

			// the store button: as the video plays, the player's own at the foot, from when the creative says; past its end,
			// where the creative puts it. A video that is its own end card (`ownEndCard`) has none.
			bool pressed = false;
			if (ad.ctaType != null && ad.started && ad.store != null && !still)
			{
				pressed = ModernAction(w, h, unit, over, watched);
			}
			else if (ad.started && ad.store != null && !still && ad.ends != Ends.Own)
			{
				if (over)
				{
					pressed = StoreButton(Placed(w, h, ad.picture != null ? (float)ad.picture.height / ad.picture.width : 0.3f), ad.picture, true);
				}
				else if (watched >= ad.buttonFrom)
				{
					float bw = Mathf.Min(w - 2 * pad, 360f * Mathf.Min(w, h) / 720f);
					pressed = StoreButton(new Rect((w - bw) / 2f, h - pad - bw * 0.3f, bw, bw * 0.3f), null, false);   // while it plays the button is the player's, in words
				}
			}

			// top left: what this is, and for whoever is testing the ad's end now, or as if nothing had been shown
			Rect tag = new Rect(pad, pad, unit * 11, unit * 1.8f);
			Fill(tag, new Color(0f, 0f, 0f, 0.55f));
			GUI.Label(tag, "Ad · Editor stand-in", small);
			bool skip = ad.started && !ad.ended && GUI.Button(new Rect(pad, tag.yMax + unit * 0.4f, tag.width, unit * 1.8f), "Test: skip to its end", smallButton);
			bool nothing = GUI.Button(new Rect(pad, tag.yMax + unit * 2.6f, tag.width, unit * 1.8f), "Test: nothing was shown", smallButton);

			// top right: the countdown, then the way out
			// A rewarded ad: the reward's countdown and a way to leave without it; the reward in, ✓, which takes a video with more to
			// play to its end card first, and from there ✕. An interstitial's video: Skip, at the game's time, which takes
			// it to its end, where ✕ is HoldSecs later; one that got to its end by itself has ✕ at once.
			Rect corner = new Rect(w - pad - unit * 9, pad, unit * 9, unit * 2.4f);
			bool leave = false, close = false, toEnd = false;
			bool playing = !still && !ad.ended, canEnd = ad.ends == Ends.Card || ad.loopFrom >= 0f;   // one that rests on its own card, or is one, has no end to go to
			float left = ad.rewarded ? ad.rewardAt - watched : ad.hold > 0f ? ad.hold : playing ? Mathf.Min(ad.skipAt, ad.length) - watched : 0f;
			if (ad.modern)
			{
				left = Mathf.Max(ad.hold, ad.rewarded && !ad.granted ? ad.rewardAt - watched : playing && !ad.rewarded ? Mathf.Min(ad.skipAt, ad.length) - watched : 0f);
				if (ad.started && left > 0f) { Fill(corner, new Color(0f, 0f, 0f, 0.55f)); GUI.Label(corner, Mathf.CeilToInt(left).ToString(), small); }
				else if (ad.started && playing) toEnd = GUI.Button(corner, "Skip  ▸", button);
				else if (ad.started) close = GUI.Button(corner, "✕  Close", button);
			}
			else if (!ad.started)
			{
				// nothing to press until there's something to leave
			}
			else if (left > 0f && !ad.granted)
			{
				Fill(corner, new Color(0f, 0f, 0f, 0.55f));
				GUI.Label(corner, (ad.rewarded ? (string.IsNullOrEmpty(ad.reward) ? "Reward" : ad.reward) + " in " : ad.hold > 0f ? "Close in " : "Skip in ") + Mathf.CeilToInt(left), small);
				leave = ad.rewarded && GUI.Button(new Rect(corner.x, corner.yMax + unit * 0.4f, corner.width, unit * 2f), "✕  Leave, no reward", smallButton);
			}
			else if (playing && !ad.rewarded)
			{
				toEnd = GUI.Button(corner, "Skip  ▸", button);
			}
			else if (playing && canEnd)
			{
				toEnd = GUI.Button(corner, "✓  Reward earned", button);
			}
			else
			{
				close = GUI.Button(corner, ad.rewarded && !ad.ended ? "✓  Close" : "✕  Close", button);
			}

			// last, so every button above has the tap first: the video itself as a store button, from when the creative says
			bool whole = ad.started && ad.store != null && !still && watched >= ad.wholeFrom && GUI.Button(all, GUIContent.none, GUIStyle.none);

			if (leave || close)
			{
				Close(true);
			}
			else if (toEnd)
			{
				End(true);
			}
			else if (nothing)
			{
				Close(false);
			}
			else if (skip)
			{
				SkipToEnd();
			}
			else if (pressed || whole)
			{
				OpenStore();
			}
		}

		// The Editor uses Unity's controls; timing, style choice and visibility match the web player.
		bool ModernAction(int w, int h, int unit, bool over, float watched)
		{
			bool show = over || ad.during && watched >= ad.buttonFrom;
			if (!show) { ad.ctaShownAt = -1f; return false; }
			bool large = over && ad.ctaType == "large";
			if (large && ad.darken) Fill(new Rect(0, 0, w, h), new Color(0f, 0f, 0f, 0.55f));
			// Switching from the playback pill to the large panel starts its own fade.
			if (ad.ctaShownAt < 0f || large && ad.ctaShownAt < ad.endedAt) ad.ctaShownAt = Time.unscaledTime;
			Color was = GUI.color;
			float alpha = ad.ctaFade ? Mathf.Clamp01((Time.unscaledTime - ad.ctaShownAt) / 0.5f) : 1f;
			GUI.color = new Color(was.r, was.g, was.b, was.a * alpha);
			bool pressed;
			if (over && ad.ctaType == "custom" && ad.picture != null)
			{
				pressed = StoreButton(Placed(w, h, (float)ad.picture.height / ad.picture.width), ad.picture, true);
			}
			else if (large)
			{
				if (ad.icon != null) GUI.DrawTexture(new Rect(w / 2f - unit * 2, h * 0.12f, unit * 4, unit * 4), ad.icon, ScaleMode.ScaleToFit);
				GUI.Label(new Rect(unit, h * 0.28f, w - unit * 2, unit * 3), ad.name ?? "", title);
				GUI.Label(new Rect(unit * 2, h * 0.28f + unit * 3, w - unit * 4, unit * 4), ad.line ?? "", label);
				pressed = StoreButton(new Rect(w * 0.25f, h * 0.62f, w * 0.5f, unit * 3), null, false);
			}
			else
			{
				float bw = Mathf.Min(w - unit * 2, unit * 25);
				Rect pillRect = new Rect((w - bw) / 2f, h - unit * 4, bw, unit * 3);
				Fill(pillRect, new Color(1f, 1f, 1f, alpha));
				if (ad.icon != null) GUI.DrawTexture(new Rect(pillRect.x + unit * 0.3f, pillRect.y + unit * 0.3f, unit * 2.4f, unit * 2.4f), ad.icon, ScaleMode.ScaleToFit);
				Color textWas = GUI.contentColor; GUI.contentColor = Color.black;
				GUI.Label(new Rect(pillRect.x + unit * 3, pillRect.y, bw - unit * 12, unit * 3), ad.name ?? "", small);
				GUI.contentColor = textWas;
				pressed = StoreButton(new Rect(pillRect.xMax - unit * 8.5f, pillRect.y + unit * 0.3f, unit * 8, unit * 2.4f), null, false);
			}
			GUI.color = was;
			return pressed;
		}

		// For whoever is testing: the ad's end, now.
		void SkipToEnd()
		{
			if (ad == null || ad.ended)
			{
				return;
			}
			if (ad.kind == "card")
			{
				ad.cardStarted = Time.unscaledTime - ad.length;
			}
			else
			{
				End();
			}
		}

		// ---- JSON: read into dictionaries, lists, strings, doubles and bools; as much as a catalogue needs ----

		static class Json
		{
			public static object Get(Dictionary<string, object> d, string k) => d != null && k != null && d.TryGetValue(k, out object v) ? v : null;
			public static string Str(Dictionary<string, object> d, string k) => Get(d, k) as string;
			public static bool Bool(Dictionary<string, object> d, string k) => Get(d, k) is bool b && b;
			public static double Num(Dictionary<string, object> d, string k, double otherwise) => Get(d, k) is double n ? n : otherwise;
			public static Dictionary<string, object> Dict(Dictionary<string, object> d, string k) => Get(d, k) as Dictionary<string, object>;

			public static object Parse(string text)
			{
				int at = 0;
				object value = Value(text, ref at);
				Space(text, ref at);
				if (at != text.Length)
				{
					throw new FormatException("more after the JSON, at " + at);
				}
				return value;
			}

			static void Space(string s, ref int at)
			{
				while (at < s.Length && char.IsWhiteSpace(s[at]))
				{
					at++;
				}
			}

			static object Value(string s, ref int at)
			{
				Space(s, ref at);
				if (at >= s.Length)
				{
					throw new FormatException("the JSON ends early");
				}
				char c = s[at];
				if (c == '{')
				{
					Dictionary<string, object> d = new Dictionary<string, object>();
					at++;
					Space(s, ref at);
					if (s[at] == '}')
					{
						at++;
						return d;
					}
					while (true)
					{
						Space(s, ref at);
						string k = Text(s, ref at);
						Space(s, ref at);
						Expect(s, ref at, ':');
						d[k] = Value(s, ref at);
						Space(s, ref at);
						if (s[at] == ',')
						{
							at++;
							continue;
						}
						Expect(s, ref at, '}');
						return d;
					}
				}
				if (c == '[')
				{
					List<object> list = new List<object>();
					at++;
					Space(s, ref at);
					if (s[at] == ']')
					{
						at++;
						return list;
					}
					while (true)
					{
						list.Add(Value(s, ref at));
						Space(s, ref at);
						if (s[at] == ',')
						{
							at++;
							continue;
						}
						Expect(s, ref at, ']');
						return list;
					}
				}
				if (c == '"')
				{
					return Text(s, ref at);
				}
				if (Word(s, ref at, "true"))
				{
					return true;
				}
				if (Word(s, ref at, "false"))
				{
					return false;
				}
				if (Word(s, ref at, "null"))
				{
					return null;
				}
				int from = at;
				while (at < s.Length && (char.IsDigit(s[at]) || s[at] == '-' || s[at] == '+' || s[at] == '.' || s[at] == 'e' || s[at] == 'E'))
				{
					at++;
				}
				if (at == from)
				{
					throw new FormatException("unexpected '" + c + "' at " + at);
				}
				return double.Parse(s.Substring(from, at - from), CultureInfo.InvariantCulture);
			}

			static bool Word(string s, ref int at, string word)
			{
				if (string.CompareOrdinal(s, at, word, 0, word.Length) != 0)
				{
					return false;
				}
				at += word.Length;
				return true;
			}

			static void Expect(string s, ref int at, char c)
			{
				if (at >= s.Length || s[at] != c)
				{
					throw new FormatException("expected '" + c + "' at " + at);
				}
				at++;
			}

			static string Text(string s, ref int at)
			{
				Expect(s, ref at, '"');
				StringBuilder text = new StringBuilder();
				while (true)
				{
					if (at >= s.Length)
					{
						throw new FormatException("a string never ends");
					}
					char c = s[at++];
					if (c == '"')
					{
						return text.ToString();
					}
					if (c != '\\')
					{
						text.Append(c);
						continue;
					}
					char e = s[at++];
					switch (e)
					{
						case 'n': text.Append('\n'); break;
						case 't': text.Append('\t'); break;
						case 'r': text.Append('\r'); break;
						case 'b': text.Append('\b'); break;
						case 'f': text.Append('\f'); break;
						case 'u': text.Append((char)int.Parse(s.Substring(at, 4), NumberStyles.HexNumber)); at += 4; break;
						default: text.Append(e); break;   // \" \\ \/
					}
				}
			}
		}
	}
}
#endif
