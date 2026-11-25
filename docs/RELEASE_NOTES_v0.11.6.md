# Modifier v0.11.6 - board targets, free-agent residency, Tier B event view, Open buttons

Requires game beta.33+. Builds on v0.11.5.

## Fixed
- **Board targets for weak clubs.** In a 32-club region the board now asks for top 22 in the Open from the 8 weakest clubs (squad ranks 25-32) and top 16 from ranks 17-24. It showed top 12 in a new career until you advanced the first day; it now shows from day one.
- **Free agents from your own region are no longer counted as imports.** A Portuguese free agent signing for a European Tier B club was refused as an import when the club had one player from outside Europe.
- **Player search by region.** Picking Europe now also lists free agents who live in Europe (before, only players with a club showed).
- **"There is no result to show"** flashing after a fast-simulated showmatch or scrim: the match stays available for 2 days.
- **Clubs led:** the club logo now sits to the left of the name.
- **Tier B event view** opens 2 days before the cup, not a week before.

## Changed
- A Y message from a creator in the inbox has an **Open** button that goes straight to the chat.
- Showmatch messages no longer list every possible payout (only the fee for taking part).

## Known
- Tier B clubs only receive showmatch invitations; they cannot host showmatches (that tab is Tier A only).
- Searching with a rating filter only lists players whose rating you know (free agents and scouted players), as in the game.

## Notes for testers
Checked in tests, not by eye in the real game.
