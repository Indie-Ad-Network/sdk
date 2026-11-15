using System;

namespace HouseAdsNetwork
{
	/// <summary>
	/// The web view the ads play in. The package's own is NativeWebView, and a game need do nothing; one with a
	/// web view it would rather use gives it as this (HouseAdsConfig.createWebView).
	///
	/// What it must be: full screen, over the game, transparent where the page is; JavaScript on; media playing
	/// inline and without a tap (the tap was on the game's own button); not visible until SetVisible(true).
	/// </summary>
	public interface IHouseAdsWebView : IDisposable
	{
		/// The page called window.nativeWebView.postMessage(string): that string.
		event Action<string> MessageReceived;

		/// The device's back button, while the web view is up (Android).
		event Action BackPressed;

		/// The page is gone and won't answer (iOS ends a web view's process when memory is short).
		event Action Lost;

		/// Load this HTML as if it had come from baseUrl: its storage is that origin's, so it is the same from run to run.
		void LoadHtml(string html, string baseUrl);

		void Evaluate(string javascript);

		void SetVisible(bool visible);
	}
}
