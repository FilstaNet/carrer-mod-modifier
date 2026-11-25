# Phase 0 – Architecture Summary (RL Career Hub 0.2.0-beta.31)

Status: analysis only. Nothing in the original app was modified. Deobfuscated read-only copies are in `analysis/deobf/` (webcrack output; function and property names survive, local variable names do not).

## 1. App layout (Electron)

| Part | File | Notes |
|------|------|-------|
| Entry | `bootstrap.js` -> `beta/gate` -> `main.js` | Beta access gate runs first. **The injector must not touch or bypass it.** |
| Main process | `main.js` (~200 KB) | All `ipcMain.handle(...)` endpoints (`new-career`, `advance`, `start-next-season`, `list-clubs`, `make-offer`, ...). Calls `engine.*`. |
| Bridge | `preload.js` | Exposes `window.hub.*` -> IPC. |
| Engine | `engine/league.js` (700 KB), `events.js` (21 KB) + helpers | All career logic, plain `module.exports` objects. |
| Renderer | `renderer/app.js` (855 KB), `season-history.js` | Builds HTML strings. CSP: `script-src 'self'` (no inline scripts). |
| Data | `data/rlcs.json`, `rlcs-eu.json`, `rlcs-2027.json`, `free-agents*.json`, `player-starts.json`, ... | Real orgs/rosters per roster year. |

## 2. How the game models what Tier B needs

- **One state object** holds the whole world: `state.teams`, `state.players`, `state.regions`, `state.userRegion`, `state.events`, `state.fixtures`, `state.ranking`, `state.splitRanking`, `state.regionEvents`, `state.regionResults`, `state.honours`.
- **Region** is a field on each team: `team.region` (`'eu'`, `'na'`, `'sam'`, `'oce'`, `'mena'`, `'apac'`, `'ssa'` - lowercase). `regionTeams(state, regionId)` filters by it. Spec's `EU_b` style ids must match this lowercase convention (e.g. `eu_b`) - **to confirm**.
- **No tier concept exists.** `REGION_TIER` in league.js is a prestige table for transfers, unrelated. There is no relegation/promotion code.
- **Events** (`state.events`): per season 10 events from `SEASON_LAYOUT_RLCS` (events.js): 6 Opens, 2 Majors, LCQ, Worlds. `buildSeasonPlan()` creates them.
- **User's region plays a full event**; **other regions are simulated as "shadow" events** (`shadowRegions` / `playShadowEvent`, results in `state.regionEvents[regionId]`, last 10 kept, `state.regionResults`). Tier B for non-user regions can follow this same shadow pattern.
- **Open field** is chosen by `eventField()`: the top `EVENT_FIELD = 16` teams of the region by ranking points. This is why a 32-team region is ambiguous: today only 16 per region are in an Open.
- **Event format** (`seedEvent`): 16 teams -> 2 groups of 8 (`buildGsl8`), 4 qualify per group, then `buildPlayoff` (8-team double elimination). Smaller fields use `buildGsl` (4-team GSL, 5 matches, top 2 advance). Series length via `SERIES_LENGTHS` (`group/regional/international/worldsFinal`).
- **Points**: `OPEN_POINTS` / `MAJOR_POINTS` tables cover places 1-16 only; `pointsFor(kind, place)`; banked by `bankPoints` into `state.ranking` and `state.splitRanking`. Prize tables `PRIZE`/`PRIZE_REAL` also stop at 16th.
- **Season rollover**: `startNextSeason(state, rand)` (league.js ~15838): awards, archive (`seasonHistory.archive`, `archiveSeason`), ages players, contracts, retirements, board, new events. No region/tier transition step.
- **New career**: renderer `listClubs` -> main `list-clubs` -> `engine.clubPreview(real)`; then `new-career` -> `engine.generateLeague({... real, mode: 'player'|undefined})`. Player Career uses `startPlayerCareer` (league.js ~4551).
- **UI**: Home Standings card at `renderer/app.js` ~5403 (`standViewsNow`, `standViewNow`, `standBodyHtml`, tabs via `panelTabsHtml`); full Standings view with `Next fixtures` at ~5715 (`standFixturesHtml`).

## 3. Mismatches with `Tiers_system.md` (to decide)

1. **Tier A is not 16 per region.** Region sizes come from `data/rlcs*.json`. Need to count real teams per region (open question until checked).
2. **Only 16 teams per Open event, 10 events per season, 6 Opens.** Spec's "6 B-Tier Cups, 32 teams, 8 groups of 4 (GSL), top-16 single-elim" needs: `buildGsl` x 8 (exists), but **no single-elimination top-16 builder exists** (`buildPlayoff` = 8-team double elim). New builder required, using the same slot format (`a/b` refs, `winnerOf`).
3. **Points/prizes tables end at place 16**; the spec needs 1st-32nd -> separate Tier B table (allowed by spec).
4. **Region ids** are lowercase (`eu`); spec uses `EU` / `EU_b`.
5. **Everything in a region lives in one `state.teams`**; many systems call `regionTeams(state, region)` and fall back to **all teams** if the region has none. A new `*_b` region must not trigger that fallback or leak into Tier A queries (`majorRaceOrder`, `eventField`, ranking, news, transfers filters).
6. **Promotion/relegation** has no hook; must run as an extra step around `startNextSeason`.
7. League.js internal calls (e.g. `advance` -> `startNextSeason`) cannot be wrapped from outside; only exported functions called by `main.js` can.

## 4. Injection approach (no edits to original files)

Because core files are obfuscated and change every beta, the injector must hook by **stable exported names**, not by line/variable.

- **Main process / engine hook:** a launcher starts the original exe and loads our script early (Node `-r`/`NODE_OPTIONS`, or a hook on `Module._load` for `./engine/league`). Our script wraps exported functions on the `engine` object that `main.js` calls (`generateLeague`, `startNextSeason`, `advance`, `clubPreview`, `computeTable`, `makeOffer`...) and adds Tier B state/logic around them. Wrapping works only for functions invoked through `engine.<name>` (not internal calls).
- **Renderer hook:** inject JS/CSS into the page after load (Chrome DevTools Protocol via `--remote-debugging-port` bypasses the page CSP) to add the TIER A/B buttons and Tier B views. Renderer code is not exported, so buttons are added by DOM observation (find "Standings" heading text) and Tier B data is fetched via a new IPC channel we register.
- **Data:** `btier-teams.json` lives with our injector, not in the app's `data/`.
- **Feasibility CHECKED (read-only, user-approved):** Electron fuses of `RL Career Hub.exe` = `1 0 1 1 0 0 0 1`: RunAsNode ON, CookieEncryption off, **NodeOptionsEnvironmentVariable ON**, **NodeCliInspectArguments ON**, AsarIntegrityValidation off, OnlyLoadAppFromAsar off, V8Snapshot off, FileProtocolExtraPrivileges ON. So both `NODE_OPTIONS=--require <injector>` (main process) and `--remote-debugging-port` (renderer via CDP) are allowed. No exe or asar modification is needed.

> UPDATE 2026-11-18 (launch test): NODE_OPTIONS=--require is ignored by the exe in normal launch; the working route is --inspect + attach (see launcher/start.js and PROGRESS_LOG.md). The CDP/renderer route (remote-debugging-port) is still available for the UI phase.

## 5. Open questions for the user

1. Allow me to read the Electron fuse bytes of `RL Career Hub.exe` (read-only) to confirm injection by flags is possible?
2. Region id convention for Tier B: `eu_b` (matching the game's lowercase) instead of `EU_b`?
3. How many Tier A teams per region exist now (spec says 16)? If not 16, should Tier A be padded/trimmed, or should Tier A size follow the real data?
4. Should the Tier B region the user is **not** playing be simulated as shadow events (cheap, matches game design) while only the user's Tier B region plays full fixtures? (Recommended.)
5. The anti-tamper beta gate: confirm the injector runs only after the user has passed the normal gate and never alters it.

## 6. Proposed next step (Phase 1)

Create `btier-teams.json` schema + loader/validator + dynamic duplicate check against Tier A names, tested standalone with Node on a pilot region. No engine hooks yet.
