// ALL the words of the Facilities screen live here. Edit freely; keep the quotes and commas. **double stars** make bold text.
// {n}, {m} are filled in by the game: leave them in place. After editing, restart the Modifier.
// (What the numbers of each building level are, e.g. "Gate $40K/month", comes from the game rules and is not written here.)
window.__lateTexts = {
  tab: 'Facilities',

  // difficulty mode (chosen once, then locked)
  modeIntro: 'Difficulty mode. It scales prices and upkeep. It cannot be changed later: choosing locks it, and so does your first build (Standard if you have not chosen).',
  modeLocked: 'locked for this career',
  modes: {
    relaxed: { name: 'Relaxed', text: 'Cheaper buildings (x0.8). Unpaid upkeep only pauses it.' },
    standard: { name: 'Standard', text: 'Normal prices. Unpaid upkeep halves a building\'s effect.' },
    ruthless: { name: 'Ruthless', text: 'Dearer buildings (x1.3). A year of unpaid upkeep costs every building a level.' },
  },
  popupTitle: 'Facilities unlocked',
  popupText: 'Your trophies have convinced the board: new facilities are open in Club → Facilities. Choose how hard it should be. This cannot be changed later; your first build also locks the current mode (Standard).',
  popupLater: 'Decide later',

  // the "how it works" box
  howTitle: 'How it works',
  how: [
    'Buildings sit on top of your headquarters: each needs a minimum **headquarters tier** to start.',
    'The price is charged when construction starts. **Two builds** can run at once, one level at a time.',
    'Every completed level adds **monthly upkeep**. If the budget cannot cover it, the mode decides what you lose.',
    'If your club is relegated, buildings are mothballed until you are back in Tier A.',
  ],

  // locked screens
  gateTitle: 'Facilities are locked',
  gateLines: [
    'The board opens the facility budget once your club has proven itself: win **2 majors** and **5 opens** in total.',
    'Wins are counted from the day you started playing with this version of the Modifier.',
    'Majors: {major} / {needMajor}   ·   Opens: {open} / {needOpen}',
  ],
  tierBTitle: 'Facilities are for Tier A clubs',
  tierBLines: [
    '**Reach Tier A** and win 2 majors and 5 opens to unlock the facility tree.',
    'Tier B clubs keep the game\'s own headquarters, at scaled prices.',
    'If a Tier A club is relegated, its buildings are mothballed (no upkeep, no effect) and nothing is lost.',
  ],
  sackedLines: ['The board has dismissed you. Facilities are paused.'],
  noCareerLines: ['Start a career to see facilities.'],
  loading: 'Loading…',

  // overview
  overview: 'Overview',
  statHq: 'Headquarters', statUpkeep: 'Upkeep per month', statBudget: 'Budget',
  queueTitle: 'Under construction',
  queueEmpty: 'Nothing is being built. You can run two builds at once.',
  buildingsTitle: 'Buildings',
  upkeepWarn: {
    relaxed: 'Upkeep could not be paid last month. On Relaxed this only pauses it.',
    standard: 'Upkeep could not be paid last month: buildings work at half strength until it is.',
    ruthless: 'Upkeep could not be paid last month. After a year unpaid, every building loses a level.',
  },

  // building cards. name = title, focus = small tag, what = one plain sentence about what it does
  buildings: {
    academy: { name: 'Youth Academy Campus', focus: 'Development', what: 'Your academy players train faster.' },
    scouting: { name: 'Scouting Network', focus: 'Development', what: 'Scouting jobs finish sooner.' },
    wellbeing: { name: 'Performance and Wellbeing Centre', focus: 'Development', what: 'Injuries and illness heal faster, and players lose less rating each season.' },
    analytics: { name: 'Analytics Lab', focus: 'Match edge', what: 'A small rating boost for your core players in matches (together with chemistry, never more than +3).' },
    arena: { name: 'Arena', focus: 'Revenue and fans', what: 'Monthly gate income, and your followers keep growing.' },
    fanzone: { name: 'Fan Zone and Merch', focus: 'Revenue and fans', what: 'Monthly merchandise income, and your followers keep growing.' },
    studio: { name: 'Streaming Studio', focus: 'Revenue and fans', what: 'Media and stream offers pay more.' },
    museum: { name: 'Trophy Hall and Museum', focus: 'Prestige', what: 'Visitors pay to see your trophies, and your fame grows.' },
  },
  // ---- Manager tab (your own career: clubs led, trophies, milestones; not tied to one club) ----
  manager: {
    tab: 'Manager',
    lifeTitle: 'Career', seasons: 'Seasons', series: 'Series', won: 'Series won', titles: 'Trophies', clubsLed: 'Clubs', points: 'Manager points',
    clubsTitle: 'Clubs led', clubsEmpty: 'Nothing recorded yet. Play a day and this fills in.',
    cClub: 'Club', cYears: 'Seasons', cSeries: 'Series', cTitles: 'Trophies', cEnd: 'Status',
    now: 'Current', moved: 'Moved on', sacked: 'Sacked', yearsFmt: 'S{a}–S{b}', yearFmt: 'S{a}',
    honoursTitle: 'Honours', honoursEmpty: 'No trophies yet.',
    kinds: { worlds: 'World Championship', major: 'Major', open: 'Open' },
    offersTitle: 'Job offers', offersEmpty: 'No offers right now. Clubs notice managers with a record: trophies and seasons raise your reputation.', repLine: 'Your reputation: {r} (offers start at {n}).', offerTierB: 'Offers come once you manage a Tier A club.',
    types: { giant: 'Failing giant', rebuild: 'Rebuild project', ambitious: 'Ambitious club' }, until: 'Answer by {d}', accept: 'Accept', decline: 'Decline', close: 'Close', season: 'S{n}', cSeason: 'Season', cTrophy: 'Trophy', cEvent: 'Event', cDate: 'Date', cPoints: 'Points', cPrize: 'Prize', honoursHint: 'Click a season or an event to open it.', tOverview: 'Overview', tHonours: 'Honours', tHof: 'Hall of Fame', tRecords: 'Records', spells: 'Spells', spellsTitle: 'Time at the club', spellLine: 'Seasons {n} · Trophies {t}',
    accepted: 'You are the new manager of {n}.', declined: 'Offer declined.', past: 'Earlier offers',
    msTitle: 'Milestones', msDone: 'Reached in S{s} with {c}', msOpen: 'Not yet', msReward: '+{p} points', msFans: ' · +{f}% followers',
  },
  // ---- Legacy tab (Hall of Fame, records, rivals) ----
  legacy: {
    tab: 'Legacy',
    lockedTitle: 'Legacy is locked',
    lockedLines: ['Legacy opens together with the facilities: win **2 majors** and **5 opens** in total.'],
    introTitle: 'Your club\'s history',
    intro: [
      'Retired players who gave the club **at least 2 seasons** and enough titles, MVPs and goals are inducted into the **Hall of Fame**.',
      '**Records** keep the best single season of each statistic and your longest series winning streak.',
      '**Rivals** counts every official series against every club, all-time. Scrims do not count.',
    ],
    since: 'Counted since {d}.',
    hofTitle: 'Hall of Fame', hofEmpty: 'Nobody has been inducted yet.', hofLine: '{seasons} seasons · titles {titles} · MVPs {mvps} · goals {goals} · peak {peak} · inducted S{season}',
    recordsTitle: 'Club records', recEmpty: 'Records appear after the first full season.',
    tabSeason: 'Seasonal', tabTotal: 'Total', totNote: 'Totals count completed seasons with the club.', totTitles: 'Titles won at the club', totSeasons: 'Seasons at the club',
    totGoals: 'Goals, all-time', totAssists: 'Assists, all-time', totMvps: 'MVPs, all-time', totSaves: 'Saves, all-time', totWins: 'Wins, all-time', totStops: 'Majors and opens won',
    recGoals: 'Goals in a season', recAssists: 'Assists in a season', recMvps: 'MVPs in a season', recSaves: 'Saves in a season', recWins: 'Wins in a season', recStreak: 'Longest series win streak', recTitles: 'Majors and opens won', recTitlesLine: '{major} majors · {open} opens',
    season: 'S{n}',
    rivalsTitle: 'Rivals, all-time', rivalsEmpty: 'No official series played yet.', series: 'Series', games: 'Games', last: 'Last', best: 'Biggest win', rival: 'Rival',
  },

  // card labels
  notBuilt: 'Not built', now: 'Now', next: 'Next level', daysFmt: '{n} days', levelFmt: 'level {n}', daysLeft: '{n} days left',
  buildBtn: 'Build level {n}', upgradeBtn: 'Upgrade to level {n}',
  whyFull: 'Fully built', whyBusy: 'Under construction', whyHq: 'Needs headquarters tier {need} (you have {have})', whyQueue: 'Two builds at a time', whyMoney: 'Not enough budget',
  toastMode: 'Difficulty set to {m}.', toastBuild: 'Construction started.', toastNo: 'That is not possible.',
  // ---- Hosting tab (own cup series / circuit) ----
  host: {
    tab: 'Hosting',
    lockedTitle: 'Hosting is locked',
    lockedLines: ['Hosting opens together with the facilities: win **2 majors** and **5 opens** in total.', 'Then build an **Arena to level 2** to run your own cup series.'],
    arenaTitle: 'Own cup series need an Arena',
    arenaLines: ['Build the **Arena to level 2** (Club → Facilities) to run your own circuit.', 'Your Arena is at level {n} now.'],
    introTitle: 'Your own cup series',
    intro: [
      'A circuit is **3 or 4 stops** (8-club Invitationals) plus a **Finals** for the top 8 by points.',
      'Each stop is **paid 14 days before it starts**. If you cannot pay, or too few clubs accept, the stop is cancelled and you lose followers.',
      'Every finished stop earns **TV rights** (more with a Streaming Studio). Hosted events keep **4 free days** from other events.',
    ],
    formTitle: 'Plan a circuit',
    fName: 'Name', fStops: 'Stops', stops3: '3 stops', stops4: '4 stops', fStopDate: 'Stop {n}', fFinals: 'Finals', fPrize: 'Prize pool per stop', fFinalsPrize: 'Finals prize pool', fPick: 'Pick a date', fRange: 'between {lo} and {hi}',
    create: 'Create circuit', creating: 'Circuit created.',
    runTitle: 'Circuit', stopsTitle: 'Schedule', pointsTitle: 'Points', cancel: 'Cancel circuit', cancelled: 'Circuit cancelled.',
    status: { planned: 'Planned', funding: 'Planned', live: 'Playing', done: 'Done', cancelled: 'Cancelled' },
    tvLine: 'TV rights so far: {m}', champion: 'Champion: {n}', noPoints: 'No points yet.',
    standTab: 'Circuit',
    official: {
      title: 'Host official events',
      lockedLines: ['Bid to host **Kick-Off Weekend**, the **Esports World Cup** or a **Major** once your Arena is at **level 3**.', 'Your Arena is at level {n} now.'],
      intro: [
        'The bid window opens **{open} days** before an event and closes **{close} days** before it. Pick a bid between the minimum and the maximum: a bigger bid raises your score.',
        'At closing, your score (followers, trophies, Arena, bid) is compared with 4 rival organisations. The fee is charged **only if you win**.',
        'Kick-Off Weekend and the Esports World Cup get your arena name. A Major only gets your arena as host label and you earn the income; the game runs the event itself.',
        'You can host **one** official event per season. Gate and sponsor income arrive when the event is over.',
      ],
      hosting: 'You host: {name}',
      none: 'No official event can be hosted right now.',
      status: { later: 'Window opens in {n} days', open: 'Window open', closed: 'Window closed', placed: 'Bid placed', won: 'You won it', lost: 'Lost', void: 'Void', paid: 'Done, paid' },
      range: 'Bid between {lo} and {hi}', odds: 'Chance: {a} (minimum bid) to {b} (maximum bid)', bid: 'Place bid', withdraw: 'Withdraw bid', yourBid: 'Your bid: {m}', placedOk: 'Bid placed.', withdrawn: 'Bid withdrawn.',
      pastTitle: 'Your bids', rivals: 'Score {s} against {r}', min: 'Min', max: 'Max',
    },
    pickTitle: 'Pick a date', pickClose: 'Close', pickFree: 'Free: your event can start here', pickBusy: 'Not available', pickMine: 'Your planned circuit date', pickNear: 'Too close to another event (hosted events need 4 free days around them)', pickMatch: 'You have a match here', pickOther: 'Other tournament (not in your calendar)',
    pickHelp: 'Green outlined days can start your event (3 days, with 4 free days around other events). Coloured days have events, like in Season → Calendar.',
  },
};
