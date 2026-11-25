# Modifier v0.8.2 - Promotion playoff as a calendar event

Requires game beta.33+.

## Changed
- **Promotion playoff is now a group of 4.** Tier B places 1 and 2 are still promoted directly. Places 3 to 6 play one group, everyone against everyone (6 best-of-7 series over 3 days). The **top 2 of the group are promoted too** (4 up and 4 down per region, as before).
- **It shows on the Tier B calendar** as its own event ("Promotion playoff", with the group table and the matchdays) once it is drawn at the end of the season. The Promotion tab of the Tier B standings shows the same table.
- Group order: series won, then games won minus lost, then the position in the regional table.
- Saves that are in the middle of the old semi-final/final playoff finish it in the old format.

## Known / not found
- A report that a Tier B club in 1st place was not promoted could not be reproduced (new careers in all 7 regions promote correctly). If it happens again, send the save and `%TEMP%\btier-injector.log`.
