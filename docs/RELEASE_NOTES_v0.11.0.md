# Modifier v0.11.0 - Showmatches and event views

Requires game beta.33+. Builds on v0.10.0 (Manager career).

## New: Showmatches (Tier A)
- Host exhibition matches in 3v3, 2v2 or 1v1 (Club -> Events -> Showmatches): up to 4 matches per event, each best of 1, 3, 5 or 7, with a prize pool, sponsors, broadcast income and followers. Pick the date on a calendar; the player picker is searchable A-Z.
- **Invitations:** about every 26 days a club asks you (Tier A and Tier B) to play one showmatch, through the inbox. Taking part pays a fee, a win pays a prize, plus bonuses for a clean sweep and an upset. Followers either way.

## New: Scouts (engine only; the screen came in v0.11.1)
- Scouts have a skill that sets how fast scouting jobs run, and can be hired and fired. Tier B careers start with 1 scout and a wage budget that fits. This version had no screen for hiring: see v0.11.1.

## Changed: every match you can play has an event view
- Showmatches and showdowns were skipped silently when your player was benched. They are now a normal "Watch match" / "Play match" on the day.
- The Tier B promotion group, showdowns, Invitationals and circuit stops get the event layout on the Home (standings big, news small).
- The event view lasts one day longer than the event, so you can read the finished bracket.
- The match card names the event ("Esports World Cup", "Test Invitational", "Promotion group") instead of "RLCS".
- The Esports World Cup and Kick-Off Weekend hand you the next match at once; no skipping a day between matches.
- The promotion group is drawn right after the last event of the season, so it matches the dates on the calendar.
- Promotion table: clubs on the left, top 2 with a green bar, your club highlighted.
- Circuit: its own tab with Standings and the Bracket of the running stop (no Invitational tab for circuit stops); points table scrolls, logo next to the name, hover on rows.

## Changed: Inbox
- Opening a message marks only that message as read, not the whole inbox.
- Important messages have a yellow ring and "!" in every tab; unread ones are filled yellow.

## Notes for testers
Event views and the new tabs were checked in tests and scripts, not by eye in the real game: please report any layout that looks wrong. The showdown event view could not be reproduced as a bug; tell me if it still shows the normal Home.
