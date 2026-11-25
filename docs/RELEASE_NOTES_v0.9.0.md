# Modifier v0.9.0 - Hosting and Legacy

Requires game beta.33+. Builds on v0.8.0 (Facilities); everything below needs the facilities unlock (2 majors and 5 opens won, as a Tier A manager).

## New: Hosting (Club -> Hosting)
- **Own cup series (Arena level 2).** Plan a circuit of 3 or 4 stops (8-club Invitationals) plus a Finals for the top 8 by points. Pick every date on a calendar that shows all events, with the free days outlined. Each stop is paid 14 days before it starts; if you cannot pay, too few clubs accept or no free date is left, the stop is cancelled and you lose followers. A planned date that stops being free moves to the next free day. Every finished stop pays TV rights (more with a Streaming Studio). Your circuit gets its own **Circuit tab** next to Tier A and Tier B in Standings.
- **Host official events (Arena level 3).** Bid to host Kick-Off Weekend, the Esports World Cup or a Major. The bid window opens 60 days before the event and closes 30 days before; you choose a bid, four rival organisations bid too, and the fee is charged only if you win. Kick-Off Weekend and the Esports World Cup carry your arena name; a Major only gets your arena as host label (the game runs it). Gate and sponsor income and followers arrive when the event is over. One hosted official event per season.
- **Calendar rule.** Hosted events keep 4 free days from every other event; scrims and streams keep 1. A scrim booked in the way blocks hosting until you cancel it.

## New: Legacy (Club -> Legacy)
- **Hall of Fame:** retired players with at least 2 seasons at the club and enough titles, MVPs and goals are inducted (inbox letter).
- **Club records:** best single season of goals, assists, MVPs, saves and wins, plus your longest series win streak.
- **Rivals:** all-time series and game record against every club, last result and biggest win (scrims are not counted).
- **Trophy Hall and Museum** can now be built: monthly ticket income and a few followers per level.
- History is counted from the day you start playing with v0.9.0 (the game keeps no club history).

## Other
- Build buttons and building cards have hover animations.
- Club records have two tabs, Seasonal (best single season) and Total (all-time leaders at the club).
- A Major bid is now $300K to $850K (Kick-Off and the Esports World Cup scale the same way).
- Fix: the calendar listed every season's Kick-Off Weekend and Esports World Cup (three of each after three seasons); it now shows only this season's.
- Texts of Facilities, Hosting and Legacy are in `src/ui/late-texts.js` (editable).
- Fixes: the Y threads UI is loaded again (it was skipped since the Facilities tab was added); hosted events can no longer be placed next to other events or on a booked scrim.

## Not in this version
Rival hunger and crises (written, switched off), feeder clubs, manager offers from other clubs.

## Notes for testers
All prices, rewards and scores are first guesses. Known edge: if your club is relegated or sacked, the late-game systems freeze, and a hosted event that ends meanwhile is not paid.
