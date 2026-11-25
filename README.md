# Career Mode Modifier

Open-source mod for the Rocket League **Career Mode** (RL Career Hub, Electron app by Nixus STA). Adds a Tier B league, Swiss stages and majors, scrims, the Y social feed, Academy, facilities, hosting, legacy and more. Features and history: [docs/CHANGELOG.md](docs/CHANGELOG.md), release notes: [docs](docs/).

**Players:** download the `.exe` from [Releases](https://github.com/FilstaNet/carrer-mod-modifier/releases) and follow the steps there.

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
