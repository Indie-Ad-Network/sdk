using System;
using UnityEngine;
#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace IndieAdNetwork
{
	/// <summary>
	/// A web view laid over the game: the system's own (WKWebView on iOS, android.webkit.WebView on Android), with
	/// nothing of a third party's in between. It's what the ads play in, and plain enough for a game's other
	/// pages (help, news): a URL or HTML in, a frame, and what the page says back.
	///
	///   NativeWebView view = NativeWebView.Create();          // null where there's no web view: the Editor, other platforms
	///   view.SetFrame(NativeWebView.UnitRectOf(panel));       // or leave it full screen
	///   view.PageFinished += url => view.SetVisible(true);
	///   view.LoadUrl("https://example.com/help");
	///   …
	///   view.Dispose();
	///
	/// A page talks to the game with window.nativeWebView.postMessage(string) (MessageReceived), and the game to
	/// the page with Evaluate. On Android any frame of the page can post: a listener that acts on what it hears
	/// must be able to tell its own page from a frame inside it.
	///
	/// It starts hidden, full screen and transparent where the page is. Links other than http(s) (mailto:, a store's)
	/// are handed to the system.
	/// </summary>
	public class NativeWebView : MonoBehaviour, IIndieAdsWebView
	{
		public static bool IsSupported
		{
			get
			{
#if (UNITY_IOS || UNITY_ANDROID) && !UNITY_EDITOR
				return true;
#else
				return false;
#endif
			}
		}

		public event Action<string> MessageReceived;
		public event Action<string> PageStarted;
		public event Action<string> PageFinished;
		/// The page couldn't be had: a network error's code, or an HTTP status of 400 or more, and what it says.
		public event Action<int, string> PageFailed;
		public event Action BackPressed;
		public event Action Lost;

		/// Whether a view made from now on writes its page's console to the device log (logcat; iOS never does).
		/// Off by default: a released game leaves no logs. IndieAds.Init sets it from IndieAdsConfig.log.
		public static bool LogConsole;

		static int count;
		static readonly Vector3[] corners = new Vector3[4];

		public static NativeWebView Create()
		{
			if (!IsSupported)
			{
				return null;
			}
			GameObject go = new GameObject("NativeWebView" + (++count));   // the name is the native side's address for this view
			DontDestroyOnLoad(go);
			NativeWebView view = go.AddComponent<NativeWebView>();
			view.CreateNative();
			return view;
		}

		/// A RectTransform's place on screen as SetFrame takes it: fractions of the screen, from the top left.
		public static Rect UnitRectOf(RectTransform rectTransform)
		{
			Canvas canvas = rectTransform.GetComponentInParent<Canvas>();
			return UnitRectOf(rectTransform, canvas != null && canvas.renderMode != RenderMode.ScreenSpaceOverlay ? canvas.worldCamera : null);
		}

		/// The same, for a caller that has its canvas's camera to hand (null for a Screen Space Overlay canvas):
		/// nothing is looked up, so it's fit to call every frame.
		public static Rect UnitRectOf(RectTransform rectTransform, Camera camera)
		{
			rectTransform.GetWorldCorners(corners);   // bottom left, top left, top right, bottom right
			Vector2 bottomLeft = RectTransformUtility.WorldToScreenPoint(camera, corners[0]);
			Vector2 topRight = RectTransformUtility.WorldToScreenPoint(camera, corners[2]);
			float width = Screen.width, height = Screen.height;
			return new Rect(bottomLeft.x / width, 1f - topRight.y / height, (topRight.x - bottomLeft.x) / width, (topRight.y - bottomLeft.y) / height);
		}

#if UNITY_IOS && !UNITY_EDITOR
		[DllImport("__Internal")] static extern IntPtr _HAWebView_Create(string listener);
		[DllImport("__Internal")] static extern void _HAWebView_Destroy(IntPtr view);
		[DllImport("__Internal")] static extern void _HAWebView_LoadUrl(IntPtr view, string url);
		[DllImport("__Internal")] static extern void _HAWebView_LoadHtml(IntPtr view, string html, string baseUrl);
		[DllImport("__Internal")] static extern void _HAWebView_Evaluate(IntPtr view, string javascript);
		[DllImport("__Internal")] static extern void _HAWebView_Stop(IntPtr view);
		[DllImport("__Internal")] static extern void _HAWebView_SetFrame(IntPtr view, float left, float top, float width, float height);
		[DllImport("__Internal")] static extern void _HAWebView_SetVisible(IntPtr view, bool visible);
		[DllImport("__Internal")] static extern void _HAWebView_SetAlpha(IntPtr view, float alpha);

		IntPtr native;
		bool HasNative => native != IntPtr.Zero;

		void CreateNative() { native = _HAWebView_Create(gameObject.name); }
		void DestroyNative() { _HAWebView_Destroy(native); native = IntPtr.Zero; }
		public void LoadUrl(string url) { if (HasNative) { _HAWebView_LoadUrl(native, url); } }
		public void LoadHtml(string html, string baseUrl) { if (HasNative) { _HAWebView_LoadHtml(native, html, baseUrl); } }
		public void Evaluate(string javascript) { if (HasNative) { _HAWebView_Evaluate(native, javascript); } }
		public void Stop() { if (HasNative) { _HAWebView_Stop(native); } }
		void ApplyFrame(Rect unit) { if (HasNative) { _HAWebView_SetFrame(native, unit.x, unit.y, unit.width, unit.height); } }
		void ApplyVisible(bool visible) { if (HasNative) { _HAWebView_SetVisible(native, visible); } }
		void ApplyAlpha(float alpha) { if (HasNative) { _HAWebView_SetAlpha(native, alpha); } }
		void ApplyPaused(bool paused) { }   // iOS stops a page's timers and media with the app
#elif UNITY_ANDROID && !UNITY_EDITOR
		AndroidJavaObject native;
		bool HasNative => native != null;

		void CreateNative()
		{
			using (AndroidJavaClass player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
			using (AndroidJavaObject activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
			{
				native = new AndroidJavaObject("com.indieadnetwork.sdk.NativeWebView", activity, gameObject.name, LogConsole);
			}
		}
		void DestroyNative() { native.Call("destroy"); native.Dispose(); native = null; }
		public void LoadUrl(string url) { if (HasNative) { native.Call("loadUrl", url); } }
		public void LoadHtml(string html, string baseUrl) { if (HasNative) { native.Call("loadHtml", html, baseUrl); } }
		public void Evaluate(string javascript) { if (HasNative) { native.Call("evaluate", javascript); } }
		public void Stop() { if (HasNative) { native.Call("stop"); } }
		void ApplyFrame(Rect unit) { if (HasNative) { native.Call("setFrame", unit.x, unit.y, unit.width, unit.height); } }
		void ApplyVisible(bool visible) { if (HasNative) { native.Call("setVisible", visible); } }
		void ApplyAlpha(float alpha) { if (HasNative) { native.Call("setAlpha", alpha); } }
		void ApplyPaused(bool paused) { if (HasNative) { native.Call("setPaused", paused); } }
#else
		bool HasNative => false;

		void CreateNative() { }
		void DestroyNative() { }
		public void LoadUrl(string url) { }
		public void LoadHtml(string html, string baseUrl) { }
		public void Evaluate(string javascript) { }
		public void Stop() { }
		void ApplyFrame(Rect unit) { }
		void ApplyVisible(bool visible) { }
		void ApplyAlpha(float alpha) { }
		void ApplyPaused(bool paused) { }
#endif

		Rect frame = new Rect(0f, 0f, 1f, 1f);
		bool visible;
		float alpha = 1f;

		public bool IsVisible => visible;

		/// Where it is, as fractions of the screen from the top left (UnitRectOf): (0, 0, 1, 1) is all of it.
		/// Cheap to call every frame: the native view is only told of a change.
		public void SetFrame(Rect unit)
		{
			if (unit != frame)
			{
				frame = unit;
				ApplyFrame(unit);
			}
		}

		public void SetVisible(bool show)
		{
			if (show != visible)
			{
				visible = show;
				ApplyVisible(show);
			}
		}

		public void SetAlpha(float value)
		{
			value = Mathf.Clamp01(value);
			if (!Mathf.Approximately(value, alpha))
			{
				alpha = value;
				ApplyAlpha(value);
			}
		}

		public void Dispose()
		{
			if (this != null)
			{
				Destroy(gameObject);
			}
		}

		void OnDestroy()
		{
			if (HasNative)
			{
				DestroyNative();
			}
		}

		void OnApplicationPause(bool paused)
		{
			ApplyPaused(paused);
		}

		// ---- from the native side (UnitySendMessage) ----

		void NativeMessage(string message) { MessageReceived?.Invoke(message); }
		void NativePageStarted(string url) { PageStarted?.Invoke(url); }
		void NativePageFinished(string url) { PageFinished?.Invoke(url); }
		void NativeBack(string unused) { BackPressed?.Invoke(); }
		void NativeLost(string unused) { Lost?.Invoke(); }

		void NativePageFailed(string codeAndMessage)
		{
			int bar = codeAndMessage.IndexOf('|');
			int code;
			int.TryParse(bar > 0 ? codeAndMessage.Substring(0, bar) : codeAndMessage, out code);
			PageFailed?.Invoke(code, bar >= 0 ? codeAndMessage.Substring(bar + 1) : "");
		}
	}
}
