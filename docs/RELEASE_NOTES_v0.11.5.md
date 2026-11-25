# Modifier v0.11.5 - updates ask first, scrims stay out of the table, better Y replies

Requires game beta.33+. Builds on v0.11.4.

## Fixed
- **Updates never install on their own.** With "Check for Modifier updates at launch" ticked, a popup appears once you are in the game: Update now / Later. Nothing is installed before you click. If Windows does not let the Modifier write to its folder (for example Program Files), the message now says so and tells you to replace the .exe by hand.
- **Scrims no longer count in the RLCS standings.** A scrim you played gave the clubs played games, points and a ranking place until the next day. The table now ignores scrims and showdowns.
- **Y replies read what you wrote.** Comments under your own reply no longer assume you were being friendly (an opinion like "time to sell X" used to get "respect").

## Changed
- "Y mood" is now **Y opinion**.
- A reply that is an opinion ("sell", "bench", "keep", "should") gets opinion-style answers.
- Far fewer repeated comments in a thread, and fan names are more varied (handle-style names, not only "[club] Nation").

## Known
- Until you advance a day, a played scrim can still count in "series won", win streak and press-conference lines. The game computes those itself.

## Notes for testers
Checked in tests, not by eye in the real game: a played scrim not changing the standings, and the update popup.
