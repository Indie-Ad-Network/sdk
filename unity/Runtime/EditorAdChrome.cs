#if UNITY_EDITOR && INDIEADS_HAS_VIDEO && INDIEADS_HAS_IMGUI && INDIEADS_HAS_WEBREQUEST
using System;
using UnityEngine;
using UnityEditor;

namespace IndieAdNetwork
{
    // Editor-only preview of the web player's controls; uses the same offline icon assets.
    sealed class EditorAdChrome : IDisposable
    {
        Texture2D skip, close, tag, info;
        GUIStyle tagBackground;
        Font controlFont;
        bool loaded;
        void Load()
        {
            if (loaded) return;
            loaded = true;
            controlFont = Resources.Load<Font>("IndieAds/Cairo-Black");
#if INDIEADS_HAS_IMAGES
            skip = Read(EditorAdAssets.Skip); close = Read(EditorAdAssets.Close); tag = Read(EditorAdAssets.Tag); info = Read(EditorAdAssets.Info);
#endif
            tagBackground = new GUIStyle { border = new RectOffset((int)EditorAdAssets.TagSlice, (int)EditorAdAssets.TagSlice, (int)EditorAdAssets.TagSlice, (int)EditorAdAssets.TagSlice), normal = { background = tag } };
        }
#if INDIEADS_HAS_IMAGES
        static Texture2D Read(string bytes)
        {
            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
            texture.LoadImage(Convert.FromBase64String(bytes), true);
            return texture;
        }
#endif
        public bool About(Rect rect, GUIStyle text, GUIStyle infoText)
        {
            Load();
            text.font = infoText.font = controlFont;
            text.fontStyle = infoText.fontStyle = FontStyle.Normal; // Black weight is in the font file.
            float size = rect.height;
            var labelRect = new Rect(rect.x, rect.y, size * 1.4f, size);
            if (Event.current.type == EventType.Repaint) tagBackground.Draw(labelRect, GUIContent.none, false, false, false, false);
            GUI.Label(labelRect, "AD", text);
            var infoRect = new Rect(labelRect.xMax + size * EditorAdAssets.AboutGap / EditorAdAssets.AboutSize, rect.y, size, size);
            if (info != null) GUI.DrawTexture(infoRect, info);
            GUI.Label(infoRect, "i", infoText);
            return GUI.Button(new Rect(rect.x, rect.y, infoRect.xMax - rect.x, size), GUIContent.none, GUIStyle.none);
        }
        public bool Timer(Rect rect, float progress, bool ready, bool closing, int seconds, GUIStyle text)
        {
            Load();
            text.font = controlFont;
            text.fontStyle = FontStyle.Normal;
            // Inset the original RocketJump background beneath the ring to prevent outer-edge bleed.
            float backgroundSize = rect.width * EditorAdAssets.TimerBackgroundSize / EditorAdAssets.Size;
            if (info != null) GUI.DrawTexture(new Rect(rect.center.x - backgroundSize / 2,
                rect.center.y - backgroundSize / 2, backgroundSize, backgroundSize), info);
            if (Event.current.type == EventType.Repaint)
            {
                Handles.BeginGUI();
                Color was = Handles.color;
                var center = new Vector3(rect.center.x, rect.center.y, 0);
                float radius = rect.width * EditorAdAssets.Radius / EditorAdAssets.Size;
                var points = new Vector3[97];
                for (int i = 0; i < points.Length; i++)
                {
                    float angle = (closing ? (float)i / 96 : Mathf.Lerp(Mathf.Clamp01(progress), 1, (float)i / 96)) * Mathf.PI * 2;
                    points[i] = center + new Vector3(Mathf.Sin(angle), -Mathf.Cos(angle), 0) * radius;
                }
                Handles.color = Color.white;
                Handles.DrawAAPolyLine(EditorAdAssets.Stroke * rect.width / EditorAdAssets.Size, points);
                Handles.color = was;
                Handles.EndGUI();
            }
            Texture2D icon = closing ? close : skip;
            if (ready && icon != null)
            {
                float size = rect.width * EditorAdAssets.IconSize / EditorAdAssets.Size;
                GUI.DrawTexture(new Rect(rect.center.x - size / 2, rect.center.y - size / 2, size, size), icon);
            }
            else GUI.Label(rect, ready ? closing ? "×" : "▸" : seconds.ToString(), text);
            return ready && GUI.Button(rect, GUIContent.none, GUIStyle.none);
        }
        public void Dispose()
        {
            UnityEngine.Object.DestroyImmediate(skip); UnityEngine.Object.DestroyImmediate(close);
            UnityEngine.Object.DestroyImmediate(tag); UnityEngine.Object.DestroyImmediate(info);
        }
    }
}
#endif
