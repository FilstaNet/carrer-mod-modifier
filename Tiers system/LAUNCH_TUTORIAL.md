# How to launch the game with the Tiers system

The mod never edits the game. A small launcher starts the original `RL Career Hub.exe`, attaches to it for a moment, adds the Tier B code in memory, and detaches. Closing the game removes everything.

## Requirements
- Node.js 22 or newer . Check: `node -v`
- The original game at your installed `RL Career Hub.exe`
- Close any running copy of RL Career Hub first (otherwise the inspector port is busy).

## Start
Open PowerShell and run:

```powershell
cd "<path to this repo>\Tiers system"
node launcher/start.js
```

1. The game window opens. Pass the normal beta gate as usual. The launcher never touches the gate.
2. The terminal prints `Tier B injector is active. You can start a new career.` The launcher then exits; the game keeps running.
3. **Start a NEW career** (Manager Career). In the club-select screen use the `TIER A` / `TIER B` buttons at the top left to pick a Tier B club. (a career saved before the mod has no Tier B data).
4. Open Home → Standings: you should see `TIER A` / `TIER B` next to the heading. Click `TIER B`.

Different game location:

```powershell
node launcher/start.js "C:\path\to\RL Career Hub.exe"
```

## Check that it worked
Read the log (everything the mod does is written here):

```powershell
Get-Content "$env:TEMP\btier-injector.log" -Tail 20
```

Good signs: `hooked engine`, `selfcheck: teams 336, tier B teams 224`, `ui hook installed`.

Diagnostics only (injects nothing):

```powershell
node launcher/start.js --probe
```

## Every time
You must start the game through the launcher, not the normal shortcut. A normal start gives the original game with no Tier B.

## Troubleshooting
| Problem | Fix |
|---|---|
| `inspector port did not open` | Another copy is running or port 9339 is busy. Close the game, or set another port: `$env:BTIER_PORT=9400; node launcher/start.js` |
| `Game exe not found` | Pass the exe path as an argument (see above). |
| Launcher waits and prints nothing new | You have not passed the beta gate yet; it waits up to 20 minutes. |
| No TIER A/B buttons | The career is old. Start a new career. Also check the log for `ui hook failed`. |
| Something looks wrong | Close the game and start it normally: the original game is untouched. |

## Known limits (see PROGRESS_LOG.md)
Player Career is not available in this build, so Tier B can only be played as Manager Career. Tier B team names outside Europe are mostly unverified amateur teams.
