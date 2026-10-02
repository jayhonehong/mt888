/**
 * The sporting catalogue: fictional clubs, leagues and market templates.
 *
 * Every team, league and competition below is invented. Nothing here maps to a
 * real organisation, and no real fixture data is used.
 */

export const SPORTS = [
  { key: 'football', name: 'Football', glyph: 'FB' },
  { key: 'basketball', name: 'Basketball', glyph: 'BB' },
  { key: 'hockey', name: 'Ice Hockey', glyph: 'IH' },
  { key: 'tennis', name: 'Tennis', glyph: 'TN' },
  { key: 'esports', name: 'Esports', glyph: 'ES' },
];

export const CLUBS = {
  football: [
    ['Northgate United', 'NGU', '#FFC53D'],
    ['Riverton FC', 'RIV', '#4EA8FF'],
    ['Baytown Athletic', 'BAY', '#3DDC97'],
    ['Ironport Rovers', 'IRO', '#FF6B6B'],
    ['Cedar Valley', 'CDV', '#C084FC'],
    ['Harbor City', 'HBC', '#38BDF8'],
    ['Marlow Rangers', 'MAR', '#F97316'],
    ['Kestrel Town', 'KES', '#FACC15'],
    ['Ashford Wanderers', 'ASH', '#94A3B8'],
    ['Dunmore Albion', 'DUN', '#FB7185'],
  ],
  basketball: [
    ['Vega Meteors', 'VEG', '#FFC53D'],
    ['Portside Pilots', 'PSP', '#4EA8FF'],
    ['Ridgeway Rush', 'RDG', '#3DDC97'],
    ['Cobalt Kings', 'CBK', '#818CF8'],
    ['Solaris Suns', 'SOL', '#FB923C'],
    ['Halcyon Hawks', 'HAL', '#F472B6'],
  ],
  hockey: [
    ['Glacier Wolves', 'GLW', '#67E8F9'],
    ['Frostpoint Bears', 'FPB', '#A5B4FC'],
    ['Aurora Blades', 'AUR', '#FDE047'],
    ['Tundra Foxes', 'TNF', '#FCA5A5'],
    ['Borealis Titans', 'BOR', '#34D399'],
    ['Steelhaven Kings', 'SHK', '#CBD5E1'],
  ],
  tennis: [
    ['M. Okafor', 'OKA', '#FFC53D'],
    ['L. Marchetti', 'MAR', '#4EA8FF'],
    ['S. Halvorsen', 'HAL', '#3DDC97'],
    ['R. Nakamura', 'NAK', '#F472B6'],
    ['A. Delacroix', 'DEL', '#C084FC'],
    ['T. Vasquez', 'VAS', '#FB923C'],
  ],
  esports: [
    ['Nova Legion', 'NVL', '#FFC53D'],
    ['Static Drift', 'STD', '#4EA8FF'],
    ['Obsidian Pact', 'OBP', '#A78BFA'],
    ['Ember Circuit', 'EMB', '#FB7185'],
    ['Void Syndicate', 'VDS', '#22D3EE'],
    ['Prism Order', 'PRS', '#FACC15'],
  ],
};

export const LEAGUES = {
  football: ['Atlantic Premier', 'Continental Cup', 'Coastal League'],
  basketball: ['Metro Hoops League', 'National Circuit'],
  hockey: ['Northern Ice Series', 'Continental Ice Cup'],
  tennis: ['Grand Circuit', 'Open Series'],
  esports: ['Nova Masters', 'Circuit Championship'],
};

/**
 * Market templates per sport.
 *
 * `line` marks the number a totals/spread market is settled against, so the
 * settlement engine can grade it without any hard-coded knowledge of the sport.
 * `kind` tells the simulator what a plausible starting price looks like.
 */
export const MARKET_TEMPLATES = {
  football: [
    {
      key: '1x2',
      name: 'Match Result',
      selections: [
        { key: 'home', name: 'Home', kind: 'fav' },
        { key: 'draw', name: 'Draw', kind: 'draw' },
        { key: 'away', name: 'Away', kind: 'dog' },
      ],
    },
    {
      key: 'ou25',
      name: 'Total Goals',
      line: 2.5,
      selections: [
        { key: 'over', name: 'Over 2.5', kind: 'even' },
        { key: 'under', name: 'Under 2.5', kind: 'even' },
      ],
    },
    {
      key: 'btts',
      name: 'Both Teams To Score',
      selections: [
        { key: 'yes', name: 'Yes', kind: 'even' },
        { key: 'no', name: 'No', kind: 'even' },
      ],
    },
  ],
  basketball: [
    {
      key: 'ml',
      name: 'Moneyline',
      selections: [
        { key: 'home', name: 'Home', kind: 'fav' },
        { key: 'away', name: 'Away', kind: 'dog' },
      ],
    },
    {
      key: 'total',
      name: 'Total Points',
      line: 218.5,
      selections: [
        { key: 'over', name: 'Over 218.5', kind: 'even' },
        { key: 'under', name: 'Under 218.5', kind: 'even' },
      ],
    },
    {
      key: 'spread',
      name: 'Handicap',
      line: -6.5,
      selections: [
        { key: 'home', name: 'Home -6.5', kind: 'even' },
        { key: 'away', name: 'Away +6.5', kind: 'even' },
      ],
    },
  ],
  hockey: [
    {
      key: '1x2',
      name: 'Match Result (60 min)',
      selections: [
        { key: 'home', name: 'Home', kind: 'fav' },
        { key: 'draw', name: 'Draw', kind: 'draw' },
        { key: 'away', name: 'Away', kind: 'dog' },
      ],
    },
    {
      key: 'ou55',
      name: 'Total Goals',
      line: 5.5,
      selections: [
        { key: 'over', name: 'Over 5.5', kind: 'even' },
        { key: 'under', name: 'Under 5.5', kind: 'even' },
      ],
    },
  ],
  tennis: [
    {
      key: 'ml',
      name: 'Match Winner',
      selections: [
        { key: 'home', name: 'Home', kind: 'fav' },
        { key: 'away', name: 'Away', kind: 'dog' },
      ],
    },
    {
      key: 'sets',
      name: 'Total Sets',
      line: 2.5,
      selections: [
        { key: 'over', name: 'Over 2.5', kind: 'even' },
        { key: 'under', name: 'Under 2.5', kind: 'even' },
      ],
    },
  ],
  esports: [
    {
      key: 'ml',
      name: 'Series Winner',
      selections: [
        { key: 'home', name: 'Home', kind: 'fav' },
        { key: 'away', name: 'Away', kind: 'dog' },
      ],
    },
    {
      key: 'maps',
      name: 'Total Maps',
      line: 2.5,
      selections: [
        { key: 'over', name: 'Over 2.5', kind: 'even' },
        { key: 'under', name: 'Under 2.5', kind: 'even' },
      ],
    },
    {
      key: 'handicap',
      name: 'Map Handicap',
      line: -1.5,
      selections: [
        { key: 'home', name: 'Home -1.5', kind: 'even' },
        { key: 'away', name: 'Away +1.5', kind: 'even' },
      ],
    },
  ],
};

/** How a sport's live clock behaves: [maxClock, minStep, maxStep]. */
export const CLOCK_PROFILE = {
  football: { max: 90, minStep: 3, maxStep: 6, label: 'min' },
  hockey: { max: 60, minStep: 2, maxStep: 5, label: 'min' },
  basketball: { max: 48, minStep: 2, maxStep: 4, label: 'min' },
  tennis: { max: 100, minStep: 4, maxStep: 9, label: 'pts' },
  esports: { max: 100, minStep: 5, maxStep: 11, label: 'pts' },
};
