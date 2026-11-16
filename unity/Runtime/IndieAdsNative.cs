using System;
using UnityEngine;
#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace IndieAdNetwork
{
	/// <summary>
	/// What the device is asked, on the page's behalf: whether the network costs the player, and to open a store.
	/// What else is on the device is never asked: a game's daily cap and its rest are what spare a player who has it.
	///
	/// iOS (Plugins/iOS/IndieAdsNative.mm): the store is the App Store sheet over the game.
	/// Android: the store is Google Play, by market://.
	/// </summary>
	public static class IndieAdsNative
	{
#if UNITY_IOS && !UNITY_EDITOR
		[DllImport("__Internal")] static extern bool _IndieAds_IsMetered();
		[DllImport("__Internal")] static extern bool _IndieAds_StoreSheetIsUp();
		[DllImport("__Internal")] static extern void _IndieAds_OpenStore(string id, string ct, string pt, string url, string fallback, string listener);
		[DllImport("__Internal")] static extern void _IndieAds_StoreBanner(string id, string ct, string pt);
#endif

		/// The App Store sheet is over the game (iOS): the game hasn't left the front, but the store is open.
		public static bool StoreSheetIsUp
		{
			get
			{
#if UNITY_IOS && !UNITY_EDITOR
				return _IndieAds_StoreSheetIsUp();
#else
				return false;
#endif
			}
		}

		/// What a consent platform has kept of the player's answer, by the IAB framework's names, where the framework says
		/// they're kept: Android's default preferences, and on iOS the standard defaults, which are PlayerPrefs' own.
		/// IABTCF_gdprApplies is 1 where the law asks for consent; IABTCF_PurposeConsents has a character a purpose, "1"
		/// first where storing on the device is agreed. → true (agreed, or needn't be asked), false, or null: no platform has said.
		const string Applies = "IABTCF_gdprApplies", Purposes = "IABTCF_PurposeConsents";

		public static bool? CmpConsent()
		{
#if UNITY_EDITOR
			return null;
#elif UNITY_ANDROID
			try
			{
				using (AndroidJavaClass manager = new AndroidJavaClass("android.preference.PreferenceManager"))
				using (AndroidJavaObject activity = Activity())
				using (AndroidJavaObject kept = manager.CallStatic<AndroidJavaObject>("getDefaultSharedPreferences", activity))
				{
					if (!kept.Call<bool>("contains", Applies))
					{
						return null;
					}
					return Agreed(kept.Call<int>("getInt", Applies, 0), kept.Call<string>("getString", Purposes, ""));
				}
			}
			catch (AndroidJavaException)   // kept as something else than the framework says: as if no platform had said
			{
				return null;
			}
#else
			if (!PlayerPrefs.HasKey(Applies))
			{
				return null;
			}
			return Agreed(PlayerPrefs.GetInt(Applies, 0), PlayerPrefs.GetString(Purposes, ""));
#endif
		}

		static bool Agreed(int applies, string purposes)
		{
			return applies == 0 || (!string.IsNullOrEmpty(purposes) && purposes[0] == '1');
		}

		/// Mobile data, a hotspot, a metered Wi-Fi network, Low Data Mode: creatives aren't downloaded ahead on one.
		public static bool IsMetered()
		{
#if UNITY_IOS && !UNITY_EDITOR
			return _IndieAds_IsMetered();
#elif UNITY_ANDROID && !UNITY_EDITOR
			try
			{
				using (AndroidJavaObject connectivity = Activity().Call<AndroidJavaObject>("getSystemService", "connectivity"))
				{
					return connectivity != null && connectivity.Call<bool>("isActiveNetworkMetered");
				}
			}
			catch (AndroidJavaException)   // no ACCESS_NETWORK_STATE permission
			{
				return Application.internetReachability == NetworkReachability.ReachableViaCarrierDataNetwork;
			}
#else
			return Application.internetReachability == NetworkReachability.ReachableViaCarrierDataNetwork;
#endif
		}

		/// The App Store's own banner for the game `id` (with `ct`, `pt`), at the foot of the screen, over the ad's end
		/// card: its icon, its name and a Get button that installs it where the player is (SKOverlay, iOS 14 and up).
		/// No id: the banner away. Nothing anywhere else: the end card has its own button.
		public static void StoreBanner(string id, string ct, string pt)
		{
#if UNITY_IOS && !UNITY_EDITOR
			_IndieAds_StoreBanner(id ?? "", ct ?? "", pt ?? "");
#endif
		}

		/// `id` (with `ct`, `pt`): the App Store sheet, on iOS; `listener` is the GameObject sent NativeStoreClosed
		/// when it's put away. Otherwise `url`, then `fallback`, outside the game.
		public static void OpenStore(string id, string ct, string pt, string url, string fallback, string listener)
		{
#if UNITY_IOS && !UNITY_EDITOR
			_IndieAds_OpenStore(id ?? "", ct ?? "", pt ?? "", url ?? "", fallback ?? "", listener);
#elif UNITY_ANDROID && !UNITY_EDITOR
			if (!View(url) && !View(fallback) && IndieAds.Logging)
			{
				Debug.LogWarning("[IndieAds] nothing on this device opens " + fallback);
			}
#else
			Application.OpenURL(string.IsNullOrEmpty(fallback) ? url : fallback);
#endif
		}

#if UNITY_ANDROID && !UNITY_EDITOR
		const string PlayStore = "com.android.vending";
		const int FlagActivityNewTask = 0x10000000;

		static AndroidJavaObject Activity()
		{
			using (AndroidJavaClass player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
			{
				return player.GetStatic<AndroidJavaObject>("currentActivity");
			}
		}

		static bool View(string url)
		{
			if (string.IsNullOrEmpty(url))
			{
				return false;
			}
			try
			{
				using (AndroidJavaClass uriClass = new AndroidJavaClass("android.net.Uri"))
				using (AndroidJavaObject uri = uriClass.CallStatic<AndroidJavaObject>("parse", url))
				using (AndroidJavaObject intent = new AndroidJavaObject("android.content.Intent", "android.intent.action.VIEW", uri))
				{
					intent.Call<AndroidJavaObject>("addFlags", FlagActivityNewTask).Dispose();
					if (url.StartsWith("market://", StringComparison.Ordinal))
					{
						intent.Call<AndroidJavaObject>("setPackage", PlayStore).Dispose();   // Google Play itself, not a chooser
					}
					Activity().Call("startActivity", intent);
					return true;
				}
			}
			catch (AndroidJavaException)   // no Play Store on this device, or nothing that opens the link
			{
				return false;
			}
		}
#endif
	}
}
