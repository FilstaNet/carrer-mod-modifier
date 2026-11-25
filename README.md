# Career Mode Modifier

Open-source mod for the Rocket League **Career Mode** (RL Career Hub, Electron app by Nixus STA). Adds a Tier B league, Swiss stages and majors, scrims, the Y social feed, Academy, facilities, hosting, legacy and more. Features and history: [docs/CHANGELOG.md](docs/CHANGELOG.md), release notes: [docs](docs/).

# How to install and start the Modifier

You need the game (**RL Career Hub**) already installed. The Modifier is one small file that you put next to the game. It never changes the game itself, so you can always play the normal game too.

## 1. Download the Modifier
1. Open the releases page: https://github.com/FilstaNet/carrer-mod-modifier/releases
2. At the top is the newest version (it says **Latest**). Under it, click **Assets** if the list is hidden.
3. Click the file that ends in **.exe** (`RL Career Hub - Modifier.exe`). It downloads like any other file, usually to your **Downloads** folder.

You do not need a GitHub account.

## 2. Put it in the game folder
1. Find your game folder. Easiest way: right-click the game's icon on your desktop or in the Start menu, then **Open file location**. (Start menu: you may need to right-click once more on the entry that opens.)
   Usual place: `C:\Users\<your name>\AppData\Local\Programs\RL Career Hub`
2. In that folder you will see **RL Career Hub.exe**.
3. Move (or copy) **RL Career Hub - Modifier.exe** from Downloads into **this same folder**, next to it.

## 3. Start the game with the Modifier
1. Close the game if it is open.
2. Double-click **RL Career Hub - Modifier.exe** (not the normal game icon).
   Tip: right-click it, **Send to**, **Desktop (create shortcut)**, to start it from the desktop.
3. The game opens as usual. Pass the beta screen. The Modifier attaches by itself; there is nothing to click.
4. Start a **new Manager Career**. On the club-select screen use the **TIER A / TIER B** buttons at the top left.

Every time you want the Modifier features, start the game with the Modifier file. The normal game icon gives you the normal game.

## Updating
When a new version is out, a window appears in the game asking **Update now** or **Later**. Nothing is installed unless you click **Update now**.

If the update fails (this can happen when the game is in `C:\Program Files`, where Windows blocks changes), download the new **.exe** from the releases page and replace the old one in the game folder.

## If something goes wrong
| Problem | What to do |
|---|---|
| Windows says "Windows protected your PC" | The file is not signed. Click **More info**, then **Run anyway**. |
| "Put this file in the same folder as RL Career Hub.exe" | The Modifier is not in the game folder. See step 2. |
| "The mod could not attach to the game" | Another copy of the game is open. Close every copy and try again. |
| "The Tiers Mod launcher is already running" | Close the Modifier and the game, wait a few seconds, start again. If it still shows, restart the PC. |
| No TIER A / TIER B buttons | The career is old. Start a **new** career. |
| Something looks wrong | Close everything and start the game with the normal icon. The original game is untouched. |

## Good to know
- Old saves still open but have no Tier B. Saves made with the Modifier should be played with the Modifier.
- To remove the Modifier: delete the **.exe**, and the folder `%LOCALAPPDATA%\RLCareerHubTiersMod` (about 90 MB; paste that into the File Explorer address bar).
- Player Career is not available; Tier B is played as Manager Career.



## How it works
The mod never edits the game. A launcher starts the game, attaches through the Node/Chromium debug ports, injects the code in memory, and detaches. Closing the game removes everything. See [Tiers system/LAUNCH_TUTORIAL.md](Tiers%20system/LAUNCH_TUTORIAL.md) and [Tiers system/MOD_STRUCTURE.md](Tiers%20system/MOD_STRUCTURE.md).

## Layout (`Tiers system/`)
| Path | What |
|---|---|
| `src/engine` | game logic and data |
| `src/ui` | screens |
| `src/injector` | main/renderer hooks |
| `src/teams_logos` | team logos |
| `launcher/start.js` | starts the game and injects |
| `tests/` | tests |
| `tools/` | data builders, test-save and preview tools |
| `data-sources/` | curated team/player data |
| `build/` | exe build (`build-exe.ps1`) |
| `analysis/` | architecture summary |

## Develop
Needs Node.js 22+.
```
cd "Tiers system"
node tests/run-all.js     # full suite (several minutes)
node launcher/start.js "C:\path\to\RL Career Hub.exe"
```
Exe build (Windows): `build/build-exe.ps1`.

## License
MIT, see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
