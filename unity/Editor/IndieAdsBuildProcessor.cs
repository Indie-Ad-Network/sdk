using System.IO;
using UnityEditor;
#if UNITY_IOS
using UnityEditor.Callbacks;
using UnityEditor.iOS.Xcode;
#endif
#if UNITY_ANDROID
using System.Xml;
using UnityEditor.Android;
#endif

namespace IndieAdNetwork
{
	/// <summary>
	/// What a build needs. iOS gets the two frameworks the native side uses. Nothing is written for asking what else
	/// is on a device, which the package doesn't do. (A project built by appending to one an older release made keeps
	/// that release's LSApplicationQueriesSchemes, and a manifest kept by hand its queries: take them out.)
	///
	/// On Android the game's activity is made hardware accelerated. Unity's manifest turns that off, and a web
	/// view in an unaccelerated window draws in software: a playable's canvas stays blank and a video shows one
	/// frame while its sound plays on. Unity draws to its own surface either way.
	/// </summary>
	public static class IndieAdsBuildProcessor
	{
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
		}
#endif
	}
}
