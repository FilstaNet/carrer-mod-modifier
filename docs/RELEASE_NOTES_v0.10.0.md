# Modifier v0.10.0 - Manager career

Requires game beta.33+. Builds on v0.9.0 (Hosting and Legacy).

## New: Manager tab (Club -> Manager)
Your own career, separate from any one club. It works in every manager career, including Tier B, and needs no facilities.
- **Career:** seasons, series record, trophies, clubs led, manager points.
- **Clubs led:** one row per club with seasons, series record, trophies and how it ended. Click a club for its full history window.
- **Honours:** every title won while you were in charge, as a table: season, trophy, event, date, points and prize. Click a season to open it in the game's Season history, or an event to open its results.
- **Milestones:** eleven one-off rewards (trophies, series wins, seasons, trophies with three clubs), each giving manager points, followers for your club and an inbox letter.
- **Club history window:** Overview, Honours, and (for clubs you managed with Legacy tracking) Hall of Fame and Records. Close it with the X or by clicking outside.

## New: Job offers and changing clubs
- Once your manager reputation is high enough (seasons, world titles, majors, opens, milestones), other Tier A clubs can offer you the job: a failing giant, a rebuild project or an ambitious club. Up to two offers a season, 45 days to answer, shown in Club -> Manager and as inbox mail.
- **Accepting moves you to the new club.** Your trophies and record come with you. The old club goes to the AI and keeps its budget and facilities; if you ever return, your facilities, board record and Academy eligibility are back.
- **Grace period:** in your first season at a new club the board expects a little less and cannot dismiss you; a bad season-end verdict becomes a final warning.
- One move per season. Tier B managers and sacked managers get no offers.
- After a move the save is renamed to "<club> (ST)" (Switched Teams). Rename it yourself afterwards if you like; it is not changed again.
- Fix: Academy eligibility belonged to the career, so a new club could use the old club's results. It now belongs to the club.

## New: Fast sim
- **Menu -> Fast sim** (a switch under Dark mode). On: "Sim match" plays the whole series at once and shows the Full time screen, like the quick sim before beta.33. Off: the game's game-by-game Sim match window. "Play match" and a series you already started game by game are not affected. The setting is kept on this computer.

## Changed: places for clubs that go out in the Swiss stage
- A club that does not get through the Swiss stage of an Open no longer counts as 17th. Going out 2-3 is 22nd, 1-3 is 28th and 0-3 is 32nd (a tie shares the worst place of its band). These clubs are now also listed in the Open's final standings (no points, no prize), and the board sees the new place.

## Changed: a fairer start for clubs
- **No dismissal in the first two seasons of a new career.** If the board's verdict would sack you, it becomes a final warning instead. (Careers that are already running are not changed.)
- **Lower Open expectations for clubs outside the best 16 of a 32-club region.** Those clubs must get through the Swiss stage before they can play the Open, but the game's board expected a top-12 finish in two of three Opens as if every club played them. They now get the lowest level: one good Open of three per split.
- **"Top 22 once a split" for the weakest clubs.** The 8 weakest clubs of a 32-club region (by squad strength) are judged against 22nd place instead of 12th in that Open: getting through the Swiss stage, or going out 2-3 (22nd), counts. 1-3 is 28th and 0-3 is 32nd. The board window shows the real place and the target 22.

## Fix
- The series length setting now reaches Tier B cups and Swiss stages immediately (the mod kept its own copies of the best-of values).

## Not in this version
Feeder clubs, rival hunger and crises (written, switched off), offers for a dismissed manager, scouts, staff and hosted events following the manager.

## Notes for testers
All reputation limits, milestone rewards and the grace period are first guesses. Moving clubs has only been tried in tests and the UI preview, not yet in the real game: please report any screen that looks wrong after a move. The Manager tab counts history from the day you start playing with this version; earlier seasons give titles only.
