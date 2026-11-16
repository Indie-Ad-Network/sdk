using System;
using System.Collections.Generic;
using IndieAdNetwork;

// The package's names before 0.6.0, when HouseAds became IndieAds: each is its new one under the old name, so a
// game written for 0.5 compiles as it is and is told, as warnings, what to rename. Gone in the release after.
namespace HouseAdsNetwork
{
	static class Renamed
	{
		internal const string To = "Renamed in 0.6.0: the namespace is IndieAdNetwork, and HouseAd(s) in each name is IndieAd(s).";
	}

	[Obsolete(Renamed.To)]
	public static class HouseAdFormat
	{
		public const IndieAdFormat Rewarded = IndieAdFormat.Rewarded, Interstitial = IndieAdFormat.Interstitial;
	}

	[Serializable, Obsolete(Renamed.To)]
	public class HouseAdPlacement : IndieAdPlacement { }

	[Obsolete(Renamed.To)]
	public class HouseAdsConfig : IndieAdsConfig { }

	[Obsolete(Renamed.To)]
	public interface IHouseAdsWebView : IIndieAdsWebView { }

	[Obsolete(Renamed.To)]
	public struct HouseAdDemand
	{
		public float share;
		public int available;
		public static implicit operator HouseAdDemand(IndieAdDemand d) => new HouseAdDemand { share = d.share, available = d.available };
	}

	[Obsolete(Renamed.To)]
	public struct HouseAdResult
	{
		public bool shown, granted;
		public string creative, app, kind;
		public float watchedSecs;
		public static implicit operator HouseAdResult(IndieAdResult r) => new HouseAdResult { shown = r.shown, granted = r.granted, creative = r.creative, app = r.app, kind = r.kind, watchedSecs = r.watchedSecs };
	}

	[Serializable, Obsolete(Renamed.To)]
	public struct HouseAdEvent
	{
		public string @event, placement, creative, app, kind, why, via, step;
		public float secs;
		public static implicit operator HouseAdEvent(IndieAdEvent e) => new HouseAdEvent { @event = e.@event, placement = e.placement, creative = e.creative, app = e.app, kind = e.kind, why = e.why, via = e.via, step = e.step, secs = e.secs };
	}

#pragma warning disable 618   // the old names below are each other's
	[Obsolete(Renamed.To)]
	public static class HouseAds
	{
		// A handler asked for by its old type, and what was given to IndieAds for it: to take the same one away.
		static readonly Dictionary<Action<HouseAdEvent>, Action<IndieAdEvent>> handlers = new Dictionary<Action<HouseAdEvent>, Action<IndieAdEvent>>();

		public static event Action<HouseAdEvent> OnEvent
		{
			add { if (value == null || handlers.ContainsKey(value)) return; Action<IndieAdEvent> h = e => value(e); handlers[value] = h; IndieAds.OnEvent += h; }
			remove { if (value != null && handlers.TryGetValue(value, out Action<IndieAdEvent> h)) { IndieAds.OnEvent -= h; handlers.Remove(value); } }
		}
		public static event Action OnShown { add { IndieAds.OnShown += value; } remove { IndieAds.OnShown -= value; } }
		public static event Action OnHidden { add { IndieAds.OnHidden += value; } remove { IndieAds.OnHidden -= value; } }
		public static event Action OnDemandChanged { add { IndieAds.OnDemandChanged += value; } remove { IndieAds.OnDemandChanged -= value; } }

		public static bool IsInitialised => IndieAds.IsInitialised;
		public static bool IsShowing => IndieAds.IsShowing;
		public static string LoadShippedCatalogue() => IndieAds.LoadShippedCatalogue();
		public static void Init(IndieAdsConfig config) => IndieAds.Init(config);
		public static HouseAdDemand Demand(string placement) => IndieAds.Demand(placement);
		public static bool Wants(string placement) => IndieAds.Wants(placement);
		public static void SetTest(bool on) => IndieAds.SetTest(on);
		public static void SetConsent(bool agreed) => IndieAds.SetConsent(agreed);
		public static bool? CmpConsent() => IndieAds.CmpConsent();
		public static void Offered(string placement) => IndieAds.Offered(placement);
		public static bool Show(string placement, Action<HouseAdResult> done, string reward = null) =>
			IndieAds.Show(placement, done == null ? (Action<IndieAdResult>)null : r => done(r), reward);
	}
#pragma warning restore 618
}
