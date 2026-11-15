using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;
#if UNITY_IOS
using UnityEditor.Callbacks;
using UnityEditor.iOS.Xcode;
#endif
#if UNITY_ANDROID
using System.Xml;
using UnityEditor.Android;
#endif

namespace HouseAdsNetwork
{
	/// <summary>
	/// What a build needs before Android will say whether a game is installed (so it isn't advertised to someone
	/// who has it): each package in the manifest's queries element, from the catalogue the game ships
	/// (Resources/house-ads-catalogue.json), so a game that joins the catalogue later is asked about from the next
	/// release. Entries already there are left as they are. iOS isn't asked which games are installed (HouseAdsNative),
	/// and nothing is written to its Info.plist: it gets only the two frameworks the native side uses. (A project
	/// built by appending to one an older release made keeps that release's LSApplicationQueriesSchemes: take them out.)
	///
	/// On Android the game's activity is also made hardware accelerated. Unity's manifest turns that off, and a web
	/// view in an unaccelerated window draws in software: a playable's canvas stays blank and a video shows one
	/// frame while its sound plays on. Unity draws to its own surface either way.
	/// </summary>
	public static class HouseAdsBuildProcessor
	{
		// The catalogue's "package" values. It's read by pattern, not parsed: the key means
		// one thing wherever it is (schema/catalogue.schema.json), and the Editor needs no JSON library for it.
		static List<string> Values(string key)
		{
			List<string> values = new List<string>();
			string shipped = HouseAds.LoadShippedCatalogue();
			if (shipped == null)
			{
				Debug.LogWarning("[HouseAds] no Resources/house-ads-catalogue.json: installed games won't be recognised, and will be advertised to players who have them");
				return values;
			}
			foreach (Match m in Regex.Matches(shipped, "\"" + key + "\"\\s*:\\s*\"([^\"]+)\""))
			{
				if (!values.Contains(m.Groups[1].Value))
				{
					values.Add(m.Groups[1].Value);
				}
			}
			return values;
		}

#if UNITY_IOS
		[PostProcessBuild(950)]
		public static void OnPostProcessBuild(BuildTarget target, string path)
		{
			if (target != BuildTarget.iOS)
			{
				return;
			}
			string projectPath = PBXProject.GetPBXProjectPath(path);
			PBXProject project = new PBXProject();
			project.ReadFromFile(projectPath);
			string framework = project.GetUnityFrameworkTargetGuid();
			project.AddFrameworkToProject(framework, "StoreKit.framework", false);
			project.AddFrameworkToProject(framework, "Network.framework", false);
			project.WriteToFile(projectPath);
		}
#endif

#if UNITY_ANDROID
		class Manifest : IPostGenerateGradleAndroidProject
		{
			const string AndroidNs = "http://schemas.android.com/apk/res/android";

			public int callbackOrder => 950;

			public void OnPostGenerateGradleAndroidProject(string unityLibraryPath)
			{
				string manifestPath = Path.Combine(unityLibraryPath, "src/main/AndroidManifest.xml");
				if (!File.Exists(manifestPath))
				{
					return;
				}
				XmlDocument manifest = new XmlDocument();
				manifest.Load(manifestPath);
				XmlElement root = manifest.DocumentElement;
				Accelerate(root);
				AddQueries(manifest, root);
				manifest.Save(manifestPath);
			}

			// The web view draws in the activity's window, so the window must be accelerated: an activity that says
			// otherwise is made to say so.
			static void Accelerate(XmlElement root)
			{
				foreach (XmlNode node in root.GetElementsByTagName("activity"))
				{
					XmlElement activity = (XmlElement)node;
					if (activity.GetAttribute("hardwareAccelerated", AndroidNs) == "false")
					{
						activity.SetAttribute("hardwareAccelerated", AndroidNs, "true");
					}
				}
			}

			static void AddQueries(XmlDocument manifest, XmlElement root)
			{
				List<string> packages = Values("package");
				packages.Remove(Application.identifier);
				if (packages.Count == 0)
				{
					return;
				}
				XmlElement queries = root["queries"];
				if (queries == null)
				{
					queries = manifest.CreateElement("queries");
					root.AppendChild(queries);
				}
				foreach (string package in packages)
				{
					bool listed = false;
					foreach (XmlNode node in queries.ChildNodes)
					{
						XmlElement element = node as XmlElement;
						listed |= element != null && element.Name == "package" && element.GetAttribute("name", AndroidNs) == package;
					}
					if (!listed)
					{
						XmlElement entry = manifest.CreateElement("package");
						entry.SetAttribute("name", AndroidNs, package);
						queries.AppendChild(entry);
					}
				}
			}
		}
#endif
	}
}
