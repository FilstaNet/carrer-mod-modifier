# Tiers System – Task Specification

> **WORKING METHOD (important):** This feature will NOT be built all at once.
> Build one part → test it → confirm with the user that it works → only then continue to the next part.
> Always ask the user before any change, and report anything that doesn't fit or is missing (see `../README.md`).
> Do not start implementation until the user says so.

---

# TASK: Implement a Complete Tier B League System in Rocket League Career Mode

## 1. PROJECT CONTEXT

You are working on an existing Rocket League Career Mode mod created by Nixus STA.
The mod already contains a functioning career simulation with:

* Multiple real-world RLCS regions.
* Existing Tier A teams and players.
* Transfer market, player contracts and negotiations.
* Player training and development.
* Scouting.
* RLCS tournaments, Open Qualifiers, Majors and World Championship.
* Season progression and historical records.
* Team standings and tournament brackets.
* Manager Career and Player Career modes.
* Existing UI for team management, standings, fixtures and other career features.

Your task is to implement a complete second competitive division called Tier B, integrated into the existing career system.
This is an extension of the existing game, NOT a standalone replacement.

**Critical requirement:** Preserve all existing Tier A functionality. Existing career mechanics, tournaments, player management, transfers, statistics and UI must continue working as before.
Do not rewrite functioning systems unnecessarily.

## 2. CODEBASE ANALYSIS – BEFORE IMPLEMENTATION

Two important engine files have already been provided:

* `engine/league.js`
* `engine/events.js`

Both files are complete and contain their full `module.exports` blocks.
However, do not assume these are the only files that need modification.

Before writing code:

1. Inspect the entire project structure.
2. Read `engine/league.js` and `engine/events.js` completely.
3. Identify how teams, players, regions, tiers, seasons and tournaments are currently represented.
4. Find the existing season initialization and `startNextSeason` functions.
5. Understand how RLCS Open Qualifiers, standings, tournament brackets and fixtures are generated.
6. Find where new careers are initialized and where the player selects their starting team.
7. Identify both Manager Career and Player Career initialization paths.
8. Locate the two existing Standings UI components:
   * The Standings card on the main Home screen.
   * The full-screen Standings view.
9. Understand how the `NEXT FIXTURES` panel is populated.
10. Identify how transfers, player ratings, statistics and historical records are stored.

Follow the existing architecture, naming conventions and coding style.
Do not introduce duplicate implementations of systems that already exist.
If an existing function can be extended safely, prefer extending it over creating an independent parallel system.

Before implementation, provide a short architectural summary explaining which files and systems need modification.
Then proceed with the implementation.

## 3. TIER B TEAM DATABASE

Create a separate JSON database: `btier-teams.json`
Place it next to the relevant engine script, using a path that works reliably in the existing project structure.

The database must contain 32 real esports organisations for EACH of the following seven regions:

* EU
* NA
* SAM
* OCE
* MENA
* APAC
* SSA

This results in: 7 regions × 32 organisations = 224 Tier B teams.

Each team must contain:

* Organisation name.
* Region.
* Tier.
* Three real players.
* Player information compatible with the existing player data structure.
* Initial player ratings between 55 and 68 OVR.

Use real organisations and rosters from Liquipedia, focusing on:

* Open Qualifier teams.
* RLCS Contenders.
* Bubble scene organisations.
* Teams that are not already represented in the existing Tier A database.

**IMPORTANT DATA RULES:**

* Do not duplicate organisations already present in Tier A.
* The game must also check for duplicates dynamically when initializing a new career.
* Team names should be compared consistently to avoid duplicates caused by different capitalisation or formatting.
* Each team must have exactly three players.
* Player ratings must initially fall within 55–68 OVR.
* Preserve the existing player object structure so that players can participate in transfers, training, scouting and statistics.

If reliable real-world roster information is unavailable, do not fabricate real player identities. Clearly mark incomplete entries for manual verification.
The JSON file must be easy to edit manually, allowing organisations and players to be added, removed or replaced without modifying engine code.

## 4. TIER SYSTEM AND REGIONAL STRUCTURE

Every region must have two independent divisions.

### Tier A
Each region contains 16 teams.
Team properties:
* `tier: 'A'`
* `region: '<REGION>'`

Examples: EU, NA, SAM, OCE, MENA, APAC, SSA

Tier A must preserve the existing RLCS competitive structure.

### Tier B
Each region contains 32 teams.
Team properties:
* `tier: 'B'`
* `homeRegion: '<REGION>'`
* `region: '<REGION>_b'`

Examples:
* EU teams use `region: 'EU_b'`.
* NA teams use `region: 'NA_b'`.

The separate region identifier is essential.
Tier B teams must NOT participate in:

* RLCS Open Qualifiers.
* RLCS Majors.
* World Championship.
* Other Tier A-only competitions.

They must still participate in:

* Tier B competitions.
* Transfer market.
* Player development.
* Scouting-related systems where applicable.
* Other existing systems that should be available to lower-division organisations.

Ensure that all existing tournament qualification and regional filtering logic respects the new region identifiers.
Do not accidentally allow Tier B teams into Tier A competitions.

## 5. STARTING A NEW CAREER – TEAM SELECTION

Modify the existing club selection screen during new career creation.
Add a division switch: `[ TIER A | TIER B ]`
The player should be able to switch between divisions before selecting their starting organisation.

When Tier A is selected:
* Display the existing Tier A organisations.
* Preserve the current selection behaviour.

When Tier B is selected:
* Display the 32 Tier B organisations belonging to the selected region.
* Allow the player to select any of them.

The selection must work in BOTH career modes:

### Manager Career
The player starts as the manager of a Tier B organisation.
* Existing manager mechanics must work.
* Board expectations must reflect the lower division.
* Starting budget must be appropriate for Tier B.
* Existing transfer and player management systems must remain functional.

### Player Career
The player starts their professional career as a young player in a Tier B organisation.
* Existing Player Career mechanics must remain functional.
* The selected organisation must be a valid Tier B team.
* The player must be able to progress through the lower division and eventually reach Tier A through the promotion system.

Do not create separate, incompatible implementations of the two career modes.

## 6. TIER B COMPETITION SYSTEM

Each of the seven regions must have its own independent Tier B competition.
There will be six B-Tier Cup tournaments per season.
These competitions run in parallel with the six existing RLCS Open tournaments:

* Three tournaments in Split 1.
* Three tournaments in Split 2.

Each B-Tier Cup contains all 32 Tier B teams from its region.

### Tournament format
Use the existing `buildGsl` implementation for group generation.
Each tournament consists of:

**Group Stage**
* 8 groups.
* 4 teams per group.
* GSL format.
* The two best teams from each group advance.

This produces 16 playoff teams.

**Playoffs**
* Single-elimination TOP 16 bracket.
* Existing bracket infrastructure should be reused wherever possible.

### Standings and points
Each tournament awards points according to final placement.
Placements from 1st to 32nd must contribute to the regional Tier B seasonal standings.
Use the existing points and standings architecture wherever possible.
If there is no suitable existing points table for these competitions, create a separate, clearly defined Tier B points allocation without modifying Tier A scoring.
All six tournaments must contribute to the same regional Tier B seasonal table.
At the end of the season, the standings determine promotion and relegation.

**IMPORTANT:**
* Each region must have its own independent tournament history.
* Each region must have its own standings.
* No Tier B team should appear in another region's competition.
* Tournament results must be stored correctly in career data.

## 7. END-OF-SEASON PROMOTION AND RELEGATION

At the end of every season, each region must process promotion and relegation independently.

### Tier B promotion
The first-place Tier B team receives automatic promotion to Tier A.
Teams finishing positions 2–5 qualify for a promotion playoff.
The playoff consists of:

* **Semifinal 1 – BO7:** Seed 1 (#2 in standings) vs Seed 4 (#5 in standings).
* **Semifinal 2 – BO7:** Seed 2 (#3 in standings) vs Seed 3 (#4 in standings).
* **Promotion Final – BO7:** Winner of Semifinal 1 vs Winner of Semifinal 2.

The winner of the final receives promotion to Tier A.
The BO7 format must use the existing match simulation or series infrastructure wherever possible.
The promotion playoff must be represented in the UI as a proper tournament bracket.

### Tier A relegation
The two teams finishing in positions 15 and 16 in Tier A are relegated to Tier B.

### Season transition
During `startNextSeason`, automatically process all seven regions.
For each region:

1. Identify the Tier B champion.
2. Identify the Tier B promotion playoff winner.
3. Identify the two relegated Tier A teams.
4. Move both promoted teams to Tier A.
5. Move both relegated teams to Tier B.
6. Update their `tier` properties.
7. Update their `region` properties.
8. Preserve their `homeRegion` information.
9. Ensure their players, contracts, ratings, statistics and organisation data remain intact.

After the transition, every region must have:
* 16 Tier A teams.
* 32 Tier B teams.

The next season must generate competitions using the updated division structure.
Do not reset team rosters or player development when promotion or relegation happens.
Prevent duplicate promotions, duplicate relegations or teams appearing in both divisions.
Ensure the transition is processed exactly once per season.

## 8. STANDINGS UI – TIER A / TIER B SWITCH

This is one of the most important visual requirements.
Add two buttons: `TIER A`, `TIER B`
They must appear in EXACTLY TWO existing locations.

### Location 1 – Home screen Standings card
Add the buttons next to the existing `STANDINGS` heading on the Home screen card.
The buttons must match the existing UI style.
The default selection should be TIER A to preserve the current experience.
When switching to TIER B, the card must display the relevant regional Tier B standings.

### Location 2 – Full-screen Standings view
Add the same buttons next to the existing red `STANDINGS` heading in the full-screen Standings view.
The buttons must visually match the Home screen implementation.
When switching divisions, update all relevant content:

* Standings table.
* Team rankings.
* Player statistics associated with the selected division.
* Promotion playoff bracket (when available).
* `NEXT FIXTURES` panel on the right.

The Tier B view must display Tier B data exclusively.
The Tier A view must preserve the original behaviour.

**IMPORTANT UI REQUIREMENTS:**
* Use the existing components and styling conventions.
* Do not redesign the entire Standings interface.
* Preserve the current layout and spacing.
* Make the buttons visually consistent with the existing interface.
* Clearly indicate which division is currently selected.
* Switching divisions must not reload the entire career.
* Avoid unnecessary duplicated UI code.
* Keep the Home card and full-screen view synchronised where appropriate.

When a Tier B promotion playoff has not yet been generated, do not display fabricated bracket data.
Use an appropriate empty state or existing placeholder conventions.

## 9. NEXT FIXTURES INTEGRATION

The `NEXT FIXTURES` panel must respect the currently selected division.

When TIER A is selected:
* Display the existing Tier A fixtures.

When TIER B is selected:
* Display the upcoming B-Tier Cup fixtures for the relevant region.
* Show the correct teams and tournament information.
* Do not mix Tier A and Tier B matches.

The panel must update immediately when the user switches divisions.
Preserve existing fixture navigation and interaction behaviour.

## 10. COMPATIBILITY WITH EXISTING SYSTEMS

The new division must integrate with the existing career simulation.

**Transfers**
* Tier A organisations can buy Tier B players.
* Tier B organisations can buy players from other Tier B organisations, subject to existing transfer rules.
* Tier B players must appear in the transfer market.
* Transfer operations must preserve player data.
* Promotion and relegation must not break existing contracts.

**Training**
* Tier B players must be trainable.
* Player ratings must develop using the existing training system.

**Scouting**
* Tier B players should be discoverable through existing scouting mechanics where appropriate.

**Statistics**
* Tier B matches must generate statistics.
* Player statistics must be stored correctly.
* Statistics must remain associated with the correct player across transfers and season transitions.

**Historical data**
* Preserve Tier B tournament results.
* Preserve previous seasonal standings.
* Record promotion and relegation history.
* Ensure that historical results do not change when a team moves between divisions.

**Career progression**
* Manager Career must support Tier B.
* Player Career must support Tier B.
* Both modes must continue working after promotion and relegation.

## 11. TESTING AND VALIDATION

Do not consider the task complete simply because the code compiles.
Test the entire system. At minimum, verify:

**Database**
* All seven regions contain exactly 32 Tier B teams.
* No Tier A duplicates exist.
* Every team has exactly three players.
* Player ratings are within the specified range.

**Tournament generation**
* Six B-Tier Cups are generated per region.
* Every tournament contains 32 teams.
* There are exactly eight groups of four teams.
* Exactly 16 teams qualify for playoffs.
* The playoff bracket works correctly.

**Standings**
* Points are awarded correctly.
* All six tournaments contribute to seasonal standings.
* Regional standings remain independent.

**Promotion and relegation**
* Tier B #1 receives direct promotion.
* Tier B #2–#5 enter the promotion playoff.
* BO7 semifinals and final work correctly.
* The playoff winner receives promotion.
* Tier A #15 and #16 are relegated.
* All seven regions process transitions correctly.
* Each region ends with 16 Tier A and 32 Tier B teams.

**UI**
* Both Standings locations contain the division switch.
* Switching divisions updates the relevant data.
* NEXT FIXTURES updates correctly.
* Existing Tier A UI remains functional.

**Career modes**
* New Manager Career can start in Tier B.
* New Player Career can start in Tier B.
* Existing Tier A careers still work.
* Existing save data is not corrupted.

**Regression testing**
* Existing RLCS tournaments still work.
* Existing transfer market still works.
* Existing training and scouting still work.
* Existing match simulation still works.
* Existing season progression still works.

Use tests or temporary isolated test data where possible. Do not damage real career saves while testing.

## 12. IMPLEMENTATION RULES

1. Do not rewrite unrelated systems.
2. Do not remove existing functionality.
3. Do not hardcode Tier B teams directly into engine logic.
4. Keep team data in `btier-teams.json`.
5. Reuse existing tournament, bracket and simulation systems.
6. Avoid duplicated code.
7. Maintain compatibility with existing saves wherever possible.
8. Handle missing or invalid data gracefully.
9. Do not introduce unnecessary external dependencies.
10. Follow the project's existing JavaScript conventions.
11. Do not silently change existing Tier A scoring or tournament rules.
12. Do not leave unfinished placeholder implementations while reporting the feature as complete.

If you encounter an architectural limitation or an ambiguity that could significantly change the implementation, explain it before making an irreversible design decision.

## 13. FINAL REPORT

After implementation, provide a clear summary containing:

1. All files created.
2. All files modified.
3. What was implemented in each file.
4. How Tier B integrates with the existing career system.
5. What tests were performed and their results.
6. Any remaining limitations or incomplete features.
7. Any manual steps required to use the new system.

Do not claim that a feature works unless it has actually been implemented and verified.
The final result should feel like a natural extension of the existing Rocket League Career Mode, with Tier B functioning as a fully integrated second division rather than a separate, disconnected game mode.
