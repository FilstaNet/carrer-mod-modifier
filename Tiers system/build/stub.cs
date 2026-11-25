// Tiers Mod launcher stub. One file: carries the mod (launcher + engine hooks + UI + Tier B data) and a private Node runtime
// as an embedded zip. On start it unpacks them once into %LOCALAPPDATA%, then starts the ORIGINAL "RL Career Hub.exe" that sits
// next to this file, through launcher/start.js (which attaches to the game in memory; no game file is changed).
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    const string Title = "RL Career Hub - Tiers Mod";

    static string self;

    [STAThread]
    static int Main()
    {
        self = Application.ExecutablePath; // read before an update renames this running exe
        int rc = Run();
        if (rc == 75) { Process.Start(new ProcessStartInfo(self) { UseShellExecute = false }); return 0; } // updated itself: start the new copy (mutex is free by now)
        return rc;
    }

    static int Run()
    {
        bool first;
        using (var mutex = new Mutex(true, "RLCareerHubTiersModLauncher", out first))
        {
            if (!first) { MessageBox.Show("The Tiers Mod launcher is already running.\nPass the game's start screen, then it finishes by itself.", Title); return 0; }
            try
            {
                string dir = AppDomain.CurrentDomain.BaseDirectory;
                string game = Path.Combine(dir, "RL Career Hub.exe");
                if (!File.Exists(game))
                {
                    MessageBox.Show("Put this file in the same folder as \"RL Career Hub.exe\" and start it from there.\n\nLooked for:\n" + game, Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return 1;
                }

                var asm = Assembly.GetExecutingAssembly();
                long size;
                using (var s = asm.GetManifestResourceStream("mod.zip")) size = s.Length;
                string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RLCareerHubTiersMod", size.ToString());
                string node = Path.Combine(root, "node.exe");
                if (!File.Exists(node))
                {
                    string tmpDir = root + ".tmp";
                    if (Directory.Exists(tmpDir)) Directory.Delete(tmpDir, true);
                    Directory.CreateDirectory(Path.GetDirectoryName(root));
                    string zip = Path.Combine(Path.GetTempPath(), "tiersmod-" + Guid.NewGuid().ToString("N") + ".zip");
                    using (var s = asm.GetManifestResourceStream("mod.zip")) using (var f = File.Create(zip)) s.CopyTo(f);
                    ZipFile.ExtractToDirectory(zip, tmpDir);
                    File.Delete(zip);
                    if (Directory.Exists(root)) Directory.Delete(root, true);
                    Directory.Move(tmpDir, root);
                }

                var psi = new ProcessStartInfo(node, "\"" + Path.Combine(root, "launcher", "start.js") + "\" \"" + game + "\"")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = root
                };
                psi.EnvironmentVariables["TIERSMOD_EXE"] = self;
                using (var p = Process.Start(psi))
                {
                    p.WaitForExit(); // returns once the mod is attached (after the game's start screen) or failed
                    if (p.ExitCode == 75) return 75;
                    if (p.ExitCode != 0)
                    {
                        string log = Path.Combine(Path.GetTempPath(), "btier-injector.log");
                        MessageBox.Show("The mod could not attach to the game (is another copy of the game already open?).\n\nClose the game and try again.\nLog: " + log, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return 1;
                    }
                }
                return 0;
            }
            catch (Exception e)
            {
                MessageBox.Show("Could not start:\n" + e.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
