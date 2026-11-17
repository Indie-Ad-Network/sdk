// A managed bridge harness: production IndieAds.cs, with Unity and native boundaries replaced.
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text.Json;
namespace UnityEngine
{
    public class TooltipAttribute : Attribute { public TooltipAttribute(string text) {} }
    public class MonoBehaviour
    {
        public GameObject gameObject;
        public bool enabled = true;
        protected static void DontDestroyOnLoad(GameObject obj) {}
        protected static void Destroy(GameObject obj) { GameObject.Pending.Add(obj); }
    }
    public class GameObject
    {
        public static readonly List<GameObject> Pending = new();
        public readonly string name;
        public MonoBehaviour component;
        public GameObject(string name) { this.name = name; }
        public T AddComponent<T>() where T : MonoBehaviour, new()
        { var result = new T { gameObject = this }; component = result; return result; }
        public void DestroyNow()
        { component.GetType().GetMethod("OnDestroy", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(component, null); }
    }
    public class TextAsset { public string text = "{}"; }
    public static class Resources { public static T Load<T>(string name) where T : new() => new T(); }
    public static class Time { public static float realtimeSinceStartup; }
    public static class Random { public static float value => 0; }
    public enum RuntimePlatform { Android, IPhonePlayer }
    public static class Application
    {
        public static RuntimePlatform platform;
        public static readonly List<string> opened = new();
        public static void OpenURL(string url) { opened.Add(url); }
    }
    public static class Screen { public static int width = 400, height = 800, sleepTimeout = 30; }
    public static class SleepTimeout { public const int NeverSleep = -1; }
    public static class Debug { public static void Log(object value) {} public static void LogWarning(object value) {} }
    public static class JsonUtility
    {
        public static T FromJson<T>(string json) => JsonSerializer.Deserialize<T>(json, new JsonSerializerOptions { IncludeFields = true });
    }
}
namespace IndieAdNetwork
{
    public class NativeWebView : IIndieAdsWebView
    {
        public static bool LogConsole;
        public static NativeWebView next;
        public static NativeWebView Create() { var result = next; next = null; return result; }
        public event Action<string> MessageReceived;
        public event Action BackPressed;
        public event Action Lost;
        public event Action<int, string> PageFailed;
        public bool visible, disposed;
        public string url;
        public void LoadHtml(string html, string origin) {}
        public void LoadUrl(string value) { url = value; }
        public void Evaluate(string js) {}
        public void SetVisible(bool value) { visible = value; }
        public void Dispose() { disposed = true; }
        public bool Detached => MessageReceived == null && BackPressed == null && Lost == null && PageFailed == null;
        public void Emit(string message) { MessageReceived?.Invoke(message); }
        public Action CaptureMessage(string message) { var callback = MessageReceived; return () => callback?.Invoke(message); }
        public Action CaptureFailure() { var callback = PageFailed; return () => callback?.Invoke(500, "late failure"); }
    }
    public static class IndieAdsNative
    {
        public static string closedListener, listener, banner;
        public static bool StoreSheetIsUp => false;
        public static bool IsMetered() => false;
        public static bool? CmpConsent() => null;
        public static void StoreBanner(string id, string ct, string pt) { banner = id; }
        public static void OpenStore(string id, string ct, string pt, string url, string fallback, string name) { listener = name; }
        internal static void CloseStore(string name) { closedListener = name; }
    }
}
