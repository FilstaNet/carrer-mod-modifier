# Modifier v0.11.3 - fix for v0.11.1 / v0.11.2

Requires game beta.33+. Builds on v0.11.2.

## Fixed
- **Fast sim switch (Menu) was missing in v0.11.1 and v0.11.2.** Adding the Staff tab shifted the list of UI files the mod injects into the game by one place, so the last file (fast sim) was dropped and some late-game UI files were loaded in the wrong slot. They are injected correctly again, and a test now checks that the list and its variables stay in step.

## Notes for testers
Please check that the Fast sim switch is back under Dark mode in the menu. The series length setting (Tier B cups and Swiss stages follow it) was reported as not adjusting in v0.11.2; the code for it is unchanged and its test passes, so check whether it works again now. If it still does not, tell me.
