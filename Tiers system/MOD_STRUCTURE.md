# MOD_STRUCTURE – Everything Needed to Build the Tier B System

Companion to `Tiers_system.md`. Status: **planning only – no implementation started.**
Rule: ask the user before any change; report anything missing or not fitting (see `../README.md`).

---

## 0. Known blockers / open questions (report to user first)

| # | Issue | Status |
|---|-------|--------|
| B1 | `engine/league.js` and `engine/events.js` are **not present** as plain files in the folder. The original app ships as `Original Mode/RL Career Hub/resources/app.asar`. | **MISSING – need the user to provide the files or approve extracting the asar to a separate copy** |
| B2 | Original files must not be modified. An asar can't be patched "by adding files". We need to decide how Tier B hooks in (see §1). | **Decision needed from user** |
| B3 | Renderer/UI files (Home Standings card, full Standings view, club-select screen, NEXT FIXTURES) are unknown until the asar is read. | Unknown |
| B4 | Real roster data for 224 teams must come from Liquipedia. Need internet access and the user's OK on sourcing; unverifiable entries must be flagged, not invented. | Decision needed |
| B5 | Tier A team list (for duplicate checks) is unknown until the source is read. | Unknown |
| B6 | Save format / versioning (to keep old saves loading) is unknown. | Unknown |

## 0b. Decisions made by the user (Phase 0)

- **Integration:** injector only; no original file is ever edited (the beta updates often). Main process via `NODE_OPTIONS=--require`, renderer via `--remote-debugging-port` (fuses checked, both allowed).
- **Tier B region id:** `eu_b` style (lowercase, matches game ids); `homeRegion` keeps `eu`.
- **Tier A size:** follow the real data per region (no padding/trimming). Promotion/relegation swaps keep sizes constant.
- **Other regions' Tier B:** simulated as shadow events; only the user's Tier B region plays full fixtures.
- **Beta gate:** injector runs only after the normal gate; the gate is never altered or bypassed.
- Analysis: see `analysis/ARCHITECTURE_SUMMARY.md`.

## 1. Integration strategy (DECIDED: injector, see 0b)

The README forbids editing original career files. The spec itself, however, requires changes to `league.js`, `events.js`, UI screens and `startNextSeason`. These conflict, so options are:

- **A. Patched copy:** extract `app.asar` into `Workspace/Tiers system/build/` (original untouched), modify the copy, repack to a new asar/launcher. Closest to the spec.
- **B. Wrapper/override layer:** new modules that wrap/monkey-patch exported functions at load time; original files untouched. Only feasible if the code is loadable that way (needs analysis).
- **C. Hybrid:** wrapper where possible, minimal patched copy for UI.

Recommendation: decide after reading the code (Phase 0). Nothing is done until the user picks.

## 2. Proposed workspace layout

```
Workspace/Tiers system/
  Tiers_system.md        task spec
  MOD_STRUCTURE.md       this file
  analysis/              Phase 0 notes (architecture summary, function map)
  src/                   new/changed code (modular, additive)
    engine/
      btier-teams.json   224-team database (editable by hand)
      btier-loader.js    load, validate, dedupe vs Tier A
      btier-points.js    Tier B points table (placeholder name)
      btier-cups.js      builds 6 cups/region via buildGsl + top-16 bracket
      btier-promotion.js promo playoff (BO7 x3) + season transition
    ui/                  division switch + Tier B views
  tests/                 isolated tests + temp test data (never real saves)
  build/                 patched copy / repack output (if option A or C)
  data-sources/          Liquipedia notes, verification flags
```

(Paths final only after B1/B2/B3 are resolved.)

## 3. Information needed from the original code (Phase 0 checklist)

From `engine/league.js`, `engine/events.js` and the rest of the project:

- Project structure, entry points, how modules are required, where JSON data lives.
- Team object and player object schemas (fields for ovr, contract, stats, wage, age, nationality, role).
- How `region`, tier, season and tournaments are represented in career state.
- `buildGsl` signature and behaviour; bracket builder(s); series/BO simulation functions.
- Points tables and standings computation.
- Season init and `startNextSeason`; where history/records are stored.
- RLCS Open Qualifier, Major and Worlds qualification + region filtering (must exclude `*_b`).
- Fixture generation and the `NEXT FIXTURES` data source.
- New career init: club select screen, Manager vs Player Career paths, starting budget, board expectations.
- Transfer market, training, scouting, stats pipelines – how they enumerate teams/players (to include Tier B).
- Save/load and migration (for old saves lacking Tier B).
- UI: Home Standings card, full-screen Standings view, their styling/components, state for selected division.

## 4. Build phases (each: build → test → user confirms → next)

| Phase | Content | Test gate |
|-------|---------|-----------|
| 0 | Resolve B1–B6; read code; write architectural summary; user picks strategy | User approves summary |
| 1 | `btier-teams.json` schema + loader + validation + dynamic dedupe (data for a pilot region first) | Validation script: 32 teams, 3 players, OVR 55–68, no Tier A dupes |
| 2 | Full 224-team database (region by region) with verification flags | Validation passes for all 7 regions |
| 3 | Load Tier B teams into game state (`tier`, `homeRegion`, `region: X_b`), exclude from Tier A competitions | Tier A competitions unchanged; no `_b` team leaks in. **STATUS: code + headless tests done; real-app launch test pending (user)** |
| 4 | Tier B Cup generation (8 GSL groups of 4 -> top 16 -> single-elim), 6/season/region | **DONE** (btier-cups.js, tests pass) |
| 4b | Cups running inside careers (fixtures, results, points, prizes ~30% of Open pool) | **DONE headless** (btier-season.js, tests pass); real-app test pending |
| 5 | Points + regional seasonal standings + history storage | **DONE** (engine.tierBStandings, tests pass) |
| 6 | Promotion playoff (#2–#5, BO7 SF/SF/Final) + #1 auto promotion | Playoff simulates correctly |
| 7 | Season transition (promote 2, relegate #15/#16, per region, exactly once, data preserved) | Each region ends 16 A / 32 B; no duplicates |
| 8 | Standings UI: TIER A / TIER B switch in Home card + full view; bracket; NEXT FIXTURES | Both locations switch correctly; Tier A unchanged |
| 9 | New career: division switch in club select; Manager + Player Career in Tier B | Both modes start and play |
| 10 | Transfers / training / scouting / stats / history integration | Each system works with Tier B players |
| 11 | Full regression + final report | All §11 checks pass |

## 5. Data schema draft – `btier-teams.json`

Final shape to be matched to the existing player/team structures once seen.

```json
{
  "version": 1,
  "teams": [
    {
      "name": "Example Org",
      "homeRegion": "EU",
      "tier": "B",
      "region": "EU_b",
      "needsVerification": false,
      "source": "liquipedia URL",
      "players": [
        { "name": "...", "ovr": 62, "needsVerification": false }
      ]
    }
  ]
}
```

Rules: exactly 3 players; OVR 55–68; names compared normalized (lowercase, trimmed, punctuation/whitespace stripped); unverified entries flagged, never invented.

## 6. Test plan

- Isolated test harness with temp/fixture data; never touch real saves (work on copies).
- Automated validators (DB, cups, standings, transition) plus manual UI checks.
- Regression list from §11 of `Tiers_system.md`.

## 7. Deliverables checklist

- [ ] Architectural summary (Phase 0)
- [ ] `btier-teams.json` (224 teams)
- [ ] Loader / validator / dedupe
- [ ] Cup generation + points + standings
- [ ] Promotion playoff + season transition
- [ ] UI switch (Home + Standings) + NEXT FIXTURES
- [ ] Career creation changes (both modes)
- [ ] System integrations (transfers, training, scouting, stats, history)
- [ ] Tests + final report
