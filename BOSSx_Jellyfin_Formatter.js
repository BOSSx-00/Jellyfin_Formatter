#!/usr/bin/env node
'use strict';

/*
 * BOSSx - Jellyfin Formatter
 * A toolkit for a movie and TV library: rename to Jellyfin standards, give
 * stray files a folder, find duplicates, write custom season names, undo runs.
 * Plain Node.js, built-in modules only, no packages to install.
 *
 * Run:  node BOSSx_Jellyfin_Formatter.js
 * Self test:  node BOSSx_Jellyfin_Formatter.js --selftest
 * Version:  node BOSSx_Jellyfin_Formatter.js --version
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// ANSI color helpers (no color library, raw escape codes)
// ---------------------------------------------------------------------------
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const gray = (t) => `\x1b[90m${t}\x1b[0m`;
const dim = (t) => `\x1b[38;5;245m${t}\x1b[0m`;
const bold = (t) => `\x1b[1m${t}\x1b[0m`;
const underline = (t) => `\x1b[4m${t}\x1b[0m`;
// Brand accent used for headers, menus and prompts (#a20000).
const brand = (t) => `\x1b[38;2;162;0;0m${t}\x1b[0m`;
const linkText = (t) => `\x1b[38;2;162;0;0m\x1b[4m${t}\x1b[0m`;

// Bump this on every change and add a matching entry to CHANGELOG.md.
// Shown in grey under the title art.
const VERSION = '1.10.0-beta';

// A row of key hints:  ↑/↓ = MOVE     │     Enter = SELECT     │     Ctrl+C = EXIT
function keyHints(pairs) {
  return '  ' + pairs
    .map(([k, label]) => dim(k) + gray(' = ' + label.toUpperCase()))
    .join(gray('     │     '));
}

// 24 bit color helpers for the title art. Terminals that do not support
// truecolor fall back to their nearest color, the art still renders.
const RESET = '\x1b[0m';

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function fg(r, g, b) {
  return `\x1b[38;2;${r};${g};${b}m`;
}

// Paint every line of a block one solid hex color.
function solidBlock(text, hex) {
  const [r, g, b] = hexToRgb(hex);
  return text
    .split('\n')
    .map((line) => fg(r, g, b) + line + RESET)
    .join('\n');
}

// Draw a left block with a left to right gradient and a right block in one
// solid color, side by side on the same lines with a two space gap.
function renderSideBySide(leftText, rightText, startHex, endHex, solidHex) {
  const [r1, g1, b1] = hexToRgb(startHex);
  const [r2, g2, b2] = hexToRgb(endHex);
  const [sr, sg, sb] = hexToRgb(solidHex);
  const leftLines = leftText.split('\n');
  const rightLines = rightText.split('\n');
  const rows = Math.max(leftLines.length, rightLines.length);
  const leftWidth = Math.max(1, ...leftLines.map((l) => l.length));

  const out = [];
  for (let i = 0; i < rows; i++) {
    const l = leftLines[i] || '';
    let line = '';
    for (let c = 0; c < l.length; c++) {
      const t = leftWidth > 1 ? c / (leftWidth - 1) : 0;
      line += fg(
        Math.round(r1 + (r2 - r1) * t),
        Math.round(g1 + (g2 - g1) * t),
        Math.round(b1 + (b2 - b1) * t)
      ) + l[c];
    }
    line += RESET;
    const r = rightLines[i] || '';
    if (r) {
      line += ' '.repeat(leftWidth - l.length + 2) + fg(sr, sg, sb) + r + RESET;
    }
    out.push(line);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// ASCII art title, three blocks that render on one screen.
// Paste your own art between the String.raw backticks below. String.raw keeps
// every backslash exactly as typed so the art is never altered. Do not remove
// the String.raw prefix.
//   asciiArtTop       solid red (#a20000)                  reads "BOSSx"
//   asciiArtJelly     left to right gradient               reads "Jellyfin"
//                     (#AA5CC3 to #00A4DC)
//   asciiArtFormatter solid red (#a20000)                  reads "Formatter"
// asciiArtJelly and asciiArtFormatter are drawn side by side on the same
// lines, so keep them the same line count. A GAP of two spaces is added
// between them at render time.
// ---------------------------------------------------------------------------
const TOP_COLOR = '#a20000';
const BOTTOM_GRADIENT_START = '#AA5CC3';
const BOTTOM_GRADIENT_END = '#00A4DC';

// TODO: paste the "BOSSx" ASCII art here
const asciiArtTop = String.raw` _______    ______    ______    ______
/       \  /      \  /      \  /      \
$$$$$$$  |/$$$$$$  |/$$$$$$  |/$$$$$$  |__    __
$$ |__$$ |$$ |  $$ |$$ \__$$/ $$ \__$$//  \  /  |
$$    $$< $$ |  $$ |$$      \ $$      \$$  \/$$/
$$$$$$$  |$$ |  $$ | $$$$$$  | $$$$$$  |$$  $$<
$$ |__$$ |$$ \__$$ |/  \__$$ |/  \__$$ |/$$$$  \
$$    $$/ $$    $$/ $$    $$/ $$    $$//$$/ $$  |
$$$$$$$/   $$$$$$/   $$$$$$/   $$$$$$/ $$/   $$/`;

// TODO: paste the "Jellyfin" ASCII art here (drawn with the gradient)
const asciiArtJelly = String.raw`    _____            __  __             ______   __
   /     |          /  |/  |           /      \ /  |
   $$$$$ |  ______  $$ |$$ | __    __ /$$$$$$  |$$/  _______
      $$ | /      \ $$ |$$ |/  |  /  |$$ |_ $$/ /  |/       \
 __   $$ |/$$$$$$  |$$ |$$ |$$ |  $$ |$$   |    $$ |$$$$$$$  |
/  |  $$ |$$    $$ |$$ |$$ |$$ |  $$ |$$$$/     $$ |$$ |  $$ |
$$ \__$$ |$$$$$$$$/ $$ |$$ |$$ \__$$ |$$ |      $$ |$$ |  $$ |
$$    $$/ $$       |$$ |$$ |$$    $$ |$$ |      $$ |$$ |  $$ |
 $$$$$$/   $$$$$$$/ $$/ $$/  $$$$$$$ |$$/       $$/ $$/   $$/
                            /  \__$$ |
                            $$    $$/
                             $$$$$$/`;

// TODO: paste the "Formatter" ASCII art here (drawn solid red)
const asciiArtFormatter = String.raw`________
/        |
$$$$$$$$/______    ______   _____  ____    ______   _$$ |_  _$$ |_     ______    ______
$$ |__  /      \  /      \ /     \/    \  /      \ / $$   |/ $$   |   /      \  /      \
$$    |/$$$$$$  |/$$$$$$  |$$$$$$ $$$$  | $$$$$$  |$$$$$$/ $$$$$$/   /$$$$$$  |/$$$$$$  |
$$$$$/ $$ |  $$ |$$ |  $$/ $$ | $$ | $$ | /    $$ |  $$ | __ $$ | __ $$    $$ |$$ |
$$ |   $$ \__$$ |$$ |      $$ | $$ | $$ |/$$$$$$$ |  $$ |/  |$$ |/  |$$$$$$$$/ $$ |
$$ |   $$    $$/ $$ |      $$ | $$ | $$ |$$    $$ |  $$  $$/ $$  $$/ $$       |$$ |
$$/     $$$$$$/  $$/       $$/  $$/  $$/  $$$$$$$/    $$$$/   $$$$/   $$$$$$$/ $$/`;

// ---------------------------------------------------------------------------
// Paths for config and log, kept next to this script so it stays portable
// ---------------------------------------------------------------------------
const SCRIPT_DIR = __dirname;
const CONFIG_PATH = path.join(SCRIPT_DIR, 'config.json');
const LOG_PATH = path.join(SCRIPT_DIR, 'rename-log.txt');

const DEFAULT_CONFIG = {
  defaultPath: '',
  settings: {
    addResolution: false,
    addBossx: true,
    addSource: false,
    addCodec: false,
  },
};

// ---------------------------------------------------------------------------
// Tag reference data, grouped by category.
// Add a new tag later by dropping a string into the right array. Nothing in
// the core logic needs to change. Values are sorted longest first when the
// regex is built so "WEB-DL" wins over "WEB", "HDR10+" over "HDR10", etc.
// ---------------------------------------------------------------------------
const TAG_GROUPS = {
  resolution: ['4320p', '2160p', '1080p', '720p', '576p', '480p', 'UHD', '8K', '4K'],
  source: ['WEB-DL', 'WEBRip', 'WEB', 'BluRay', 'BDRip', 'BRRip', 'HDTV', 'DVDRip', 'DVDScr', 'CAM', 'TS'],
  videoCodec: ['x265', 'x264', 'H.265', 'H.264', 'H265', 'H264', 'HEVC', 'AVC', 'XviD', 'AV1'],
  audio: ['DTS-HD', 'DTS', 'DDP5.1', 'DD5.1', 'DDP', 'DD', 'EAC3', 'AAC', 'AC3', 'TrueHD', 'Atmos', 'FLAC', 'MP3'],
  hdr: ['HDR10+', 'HDR10', 'HDR', 'Dolby.Vision', 'Dolby Vision', 'DoVi', 'SDR'],
  extra: ['PROPER', 'REPACK', 'EXTENDED', 'UNRATED', 'REMASTERED', 'DIRECTORS.CUT', 'DIRECTORS CUT', 'IMAX', 'LIMITED', 'INTERNAL', 'REMUX'],
};

const SEP_CLASS = '[\\s._\\-\\[\\]()]';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Make each letter match either case, so the whole regex can run WITHOUT the
// /i flag. That matters because /i also folds the right-edge [A-Z] check, which
// would let "TS" match inside "Tsst" or "WEB" inside "Webster".
function caseInsensitive(re) {
  return re.replace(/[A-Za-z]/g, (ch) => '[' + ch.toLowerCase() + ch.toUpperCase() + ']');
}

// Turn one tag value into a pattern where its internal separators may be any
// separator or none, e.g. "WEB-DL" also matches "WEB.DL", "WEB DL", "WEBDL".
function tokenToPattern(tok) {
  return tok
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => caseInsensitive(escapeRe(part)))
    .join(SEP_CLASS + '*');
}

// Build one regex for a whole category. No /i flag, see caseInsensitive above.
// Left edge:  start of string, a separator, or a digit/letter transition.
// Right edge: end of string, a separator, a digit, or an uppercase letter
//             (so a stuck-on following tag still lines up).
function buildGroupRegex(values) {
  const alt = values
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(tokenToPattern)
    .join('|');
  const left = '(?:^|(?<=' + SEP_CLASS + ')|(?<=[0-9])(?=[A-Za-z])|(?<=[A-Za-z])(?=[0-9]))';
  const right = '(?=$|' + SEP_CLASS + '|[0-9]|[A-Z])';
  return new RegExp(left + '(?:' + alt + ')' + right, 'g');
}

const GROUP_REGEX = {};
for (const key of Object.keys(TAG_GROUPS)) {
  GROUP_REGEX[key] = buildGroupRegex(TAG_GROUPS[key]);
}

// Split tags that are jammed together with no separator so the regex above can
// see them, e.g. "1080pWEB-DLx264" becomes "1080p WEB-DL x264". The regex right
// edge already handles a tag followed by an uppercase tag, so these rules only
// need to cover lowercase-start joins that would otherwise be missed. They are
// deliberately narrow so multi case tag names like "BluRay" or "XviD" stay whole.
function splitStuck(s) {
  return s
    .replace(/(\d{3,4}p)([A-Za-z])/gi, '$1 $2')
    .replace(/([A-Za-z])(x26[45])\b/gi, '$1 $2')
    .replace(/([0-9])(?!bit\b)([A-Za-z]{3,})/gi, '$1 $2');
}

// Bit depth, channel layout and a few other loose junk tokens that are not
// full tag groups. Written to survive separators so "10Bit", "10 bit" and
// "10-bit" all match, likewise "5.1" / "5 1" and "Hi10P".
function stripLooseJunk(s) {
  return s
    .replace(/(?<![A-Za-z0-9])(?:10|8|12)[ ._-]*bits?(?![A-Za-z])/gi, ' ')
    .replace(/(?<![A-Za-z0-9])hi[ ._-]*10[ ._-]*p?(?![A-Za-z0-9])/gi, ' ')
    .replace(/(?<![A-Za-z0-9])(?:2\.0|2 0|5\.1|5 1|7\.1|7 1)(?![0-9])/g, ' ')
    .replace(/(?<![A-Za-z0-9])(?:dual[ ._-]*audio|multi)(?![A-Za-z])/gi, ' ')
    // subtitle flags: ESubs, MSub, HC-Subs, Forced Subs, Subbed, Subtitles.
    // Bare singular "Sub" is left alone so it does not eat real words.
    .replace(/(?<![A-Za-z0-9])(?:(?:[emx]|hc|forced|multi)[ ._-]*subs?|subtitles?|subs|subbed|dubbed|hardsubs?)(?![A-Za-z])/gi, ' ')
    // Streaming service tags. The 4+ letter ones are safe case-insensitively;
    // the 2 letter ones stay case sensitive so "NF" does not clip "NFL".
    .replace(/(?<![A-Za-z0-9])(?:AMZN|DSNP|ATVP|HMAX|HULU|PCOK|PMTP|iPlayer|STAN|CRAV|CRiT|PMTP|ROKU|iTunes)(?![A-Za-z0-9])/gi, ' ')
    .replace(/(?<![A-Za-z0-9])(?:NF|iP)(?![A-Za-z0-9])/g, ' ')
    // Container names used as scene tags, e.g. "... xvid mp3 avi GROUP".
    .replace(/(?<![A-Za-z0-9])(?:avi|mkv|mp4|mov|wmv|webm|mpe?g)(?![A-Za-z0-9])/gi, ' ')
    .replace(/(?<![A-Za-z0-9])(?:uncensored|uncut|repack|internal|readnfo)(?![A-Za-z0-9])/gi, ' ')
    // File size and old rip-source tags, e.g. "450MB", "WS", "DSR", "PDTV".
    .replace(/(?<![A-Za-z0-9])\d{2,4}(?:\.\d+)?\s?[MG]B(?![A-Za-z])/gi, ' ')
    .replace(/(?<![A-Za-z0-9])(?:WS|DSR|PDTV|DSRip|SDTV|DTHD|HR|DVDR|DVDRip)(?![A-Za-z0-9])/gi, ' ')
    // Trailing site suffix, e.g. "ShAaNiG.com" leftover ".com".
    .replace(/(?<=[A-Za-z0-9])\.(?:com|net|org|tv|to|me|se|nz)(?![A-Za-z])/gi, ' ')
    // Named release / anime fansub groups, in brackets anywhere in the name.
    .replace(/[\s._-]*[\[({](?:RUBaDUB|Anime[ ._-]?Time|Anime[ ._-]?Land|AnimeRG|Erai[ ._-]?raws|HorribleSubs|SubsPlease|EMBER|Judas|Cleo|Commie|Golumpa|Yameii|ASW|KaiDubs|Underwater|Coalgirls|DeadFish|puyero|Toonshub|pahe(?:\.(?:in|ph))?)[\])}]/gi, ' ')
    // ... and the distinctive ones without brackets too.
    .replace(/(?<![A-Za-z0-9])(?:RUBaDUB|Erai[ ._-]?raws|HorribleSubs|SubsPlease|AnimeRG)(?![A-Za-z0-9])/gi, ' ');
}

// Remove every junk tag from a string. Runs repeatedly until nothing else
// changes so newly exposed tags also get cleared.
function stripJunk(s) {
  let out = splitStuck(s);
  for (let i = 0; i < 8; i++) {
    const before = out;
    for (const key of Object.keys(GROUP_REGEX)) {
      out = out.replace(GROUP_REGEX[key], ' ');
    }
    out = stripLooseJunk(out);
    if (out === before) break;
  }
  return out;
}

// Honorifics that keep their trailing period when a name follows, so
// "Mr.Griffin" and "Mr. Griffin" both end up as "Mr. Griffin".
const HONORIFIC_DOT =
  /\b(Mr|Mrs|Ms|Mx|Dr|Prof|Sr|Jr|St|Ste|Fr|Rev|Hon|Sen|Rep|Gov|Pres|Sgt|Lt|Lieut|Capt|Cpl|Cmdr|Col|Gen|Adm|Maj|Messrs|Esq)\.[ ]*(?=[A-Za-z])/gi;

// A byte that will not appear in a name, used to shield periods that must
// survive the "dots become spaces" step below.
const KEEP_DOT = String.fromCharCode(1);

// Collapse leftover separators and stray empty brackets down to clean spacing,
// then trim any dangling separator or bracket characters from the ends.
function cleanName(s) {
  return s
    .replace(/[_]+/g, ' ')
    .replace(HONORIFIC_DOT, '$1' + KEEP_DOT + ' ')
    .replace(/\b([A-Za-z])\.(?=[A-Za-z]\.)/g, '$1' + KEEP_DOT)
    .replace(/\.+/g, ' ')
    .split(KEEP_DOT).join('.')
    .replace(/\[\s*\]|\(\s*\)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-_.]+/, '')
    .replace(/[\s\-_.]+$/, '')
    .replace(/\s*[([]\s*$/, '')  // stray unclosed bracket, e.g. "Movie ("
    .replace(/^\s*[)\]]\s*/, '') // stray leading bracket, e.g. "] Title"
    .trim();
}

// True when a string clearly contains scene tags, used to decide whether a
// trailing token is a release group rather than part of the title.
const HAS_TAGS_RE =
  /(?:^|[\s._-])(?:1080p|720p|480p|576p|2160p|4320p|x26[45]|h\.?26[45]|hevc|xvid|av1|web-?dl|web-?rip|web|bluray|b[dr]rip|hdtv|dvd-?rip|dvd-?scr|remux|proper|repack|amzn|nf|dsnp|atvp|hmax|ddp?(?:5\.?1)?|dts(?:-hd)?|aac|ac3|eac3|truehd|atmos|flac|hdr10?\+?|10bit|8bit|hi10p?|[emx]?-?subs?|subbed|subtitles?|dubbed|uncensored|ws|dsr|pdtv)(?:$|[\s._-])/i;

// Scene release groups that show up as a bare trailing token with no scene
// tags around them, so they need a name list rather than a heuristic.
const KNOWN_GROUPS =
  /^(?:MTC|RARBG|YIFY|YTS|ETTV|EZTV|GalaxyTV|GalaxyRG|ION10|KILLERS|FLUX|PSA|TGx|NTb|NTG|MeGusta|SuccessfulCrab|EDITH|d3g|EVO|FQM|LOL|AFG|SVA|CAKES|GGEZ|GGWP|HETeam|Silence|TrollHD|CtrlHD|playWEB|BAE|TEPES|SMURF|CasStudio|MZABI|NOSiViD|monkee|Kitsune|ShAaNiG|NIT158|OMiCRON|SYS|xRipp3rx|DIMENSION|FoV|2HD|IMMERSE|ASAP|BATV|W4F|DEFLATE|POIASD|NeoNoir|TiZU|RUBaDUB|AnimeRG|Judas|EMBER|Cleo|Yameii|ASW|puyero|Toonshub)$/i;

// Remove a trailing release group. Fires on a "-GROUP" tail, a ".Group" tail
// when the text before it has scene tags, or a " - GROUP" tail when GROUP is a
// known scene group or an all caps blob following scene tags. Plain episode
// titles such as "The Coup - Part Two" are left alone.
function looksLikeGroupToken(t) {
  return KNOWN_GROUPS.test(t) ||
    (/\d/.test(t) && /[a-z]/.test(t) && /[A-Z]/.test(t)); // e.g. xRipp3rx
}

function stripReleaseGroup(region) {
  let s = region;
  // The whole remaining string is just a group name, not a title.
  if (KNOWN_GROUPS.test(s.trim())) return '';

  // "... junk GROUP - Real Title" where the group sits before the title with a
  // dash, e.g. "uncensored xvid NIT158 - Insheeption". Keep the title.
  const gt = s.match(/^(.*?[\s._-])([A-Za-z][A-Za-z0-9]{1,14}) - (.{2,})$/);
  if (gt) {
    const g = gt[2];
    const grouplike = KNOWN_GROUPS.test(g) || /^[A-Z0-9]{3,8}$/.test(g) ||
      (/\d/.test(g) && /[A-Za-z]/.test(g));
    if (grouplike && (HAS_TAGS_RE.test(gt[1]) || KNOWN_GROUPS.test(g))) {
      return stripReleaseGroup(gt[3].trim());
    }
  }

  // Peel trailing bracket groups, "-GROUP" tails, and dot/space separated
  // trailing group tokens, repeating so "... 450MB ShAaNiG com" fully unwinds.
  for (let i = 0; i < 5; i++) {
    const before = s;
    s = s.replace(/[\s._-]*[\[(][A-Za-z0-9 ._-]{2,30}[\])]\s*$/g, '');
    const dash = s.match(/^(.*)-([A-Za-z0-9.]{2,20})$/);
    if (dash && HAS_TAGS_RE.test(dash[1]) && !HAS_TAGS_RE.test(' ' + dash[2] + ' ')) {
      s = dash[1];
    }
    const tok = s.match(/^(.+?)[\s._-]+([A-Za-z][A-Za-z0-9]{1,19})$/);
    if (tok && !HAS_TAGS_RE.test(' ' + tok[2] + ' ') &&
        (HAS_TAGS_RE.test(tok[1]) || looksLikeGroupToken(tok[2]))) {
      s = tok[1];
    }
    if (s === before) break;
  }

  const spaced = s.match(/^(.+?) - ([A-Za-z][A-Za-z0-9]{1,14})$/);
  if (spaced) {
    const g = spaced[2];
    const roman = /^(?:I{1,3}|IV|VI{0,3}|IX|XI{0,3})$/.test(g);
    if (!roman && (KNOWN_GROUPS.test(g) ||
        (/^[A-Z0-9]{2,6}$/.test(g) && HAS_TAGS_RE.test(spaced[1])))) {
      s = spaced[1];
    }
  }
  // "GROUP - Real Title" order, where GROUP mixes digits and capitals (NIT158).
  const lead = s.match(/^([A-Za-z][A-Za-z0-9]{2,14}) - (.{2,})$/);
  if (lead && /\d/.test(lead[1]) && /[A-Z]/.test(lead[1])) {
    s = lead[2];
  }
  return s;
}

// ---------------------------------------------------------------------------
// Title casing
// ---------------------------------------------------------------------------
const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into',
  'nor', 'of', 'on', 'onto', 'or', 'over', 'the', 'to', 'with', 'vs', 'via',
]);

// Fix casing without fighting a library that is already tidy. A word that is
// already capitalised is left exactly as it is, so "Children Of The Corn" stays
// put. Only all lower or all upper words get touched.
function titleCase(s) {
  const words = s.split(/\s+/).filter(Boolean);
  const cased = words.map((w, i) => {
    if (/^[0-9]+$/.test(w)) return w;
    const letters = w.replace(/[^A-Za-z]/g, '');
    if (!letters) return w;
    const allCaps = letters === letters.toUpperCase();
    const allLower = letters === letters.toLowerCase();

    // Already mixed / deliberately cased (iOS, McCoy, "Of", "The") -> leave it.
    if (!allCaps && !allLower) return w;

    if (allCaps) {
      // Short run is an acronym (US, NCIS, CSI). Longer is shouting, calm it.
      if (letters.length <= 4) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }

    // All lower: keep small joining words lower unless first or last.
    if (i !== 0 && i !== words.length - 1 && SMALL_WORDS.has(w.toLowerCase())) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
  return cased.replace(/-([a-z])/g, (m, c) => '-' + c.toUpperCase());
}

// Strip characters that are illegal in Windows file and folder names.
function sanitize(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[ .]+$/g, '')
    .trim();
}

// Remove a leading tracker/site prefix like "www.Site.com - " and outer wrap,
// and turn underscores into spaces so word boundaries behave everywhere.
function preClean(base) {
  let s = base;
  s = s.replace(/^\s*(?:www\.)?[\w-]+\.(?:com|net|org|to|se|tv|me|cc|io|nz|ru|link|app)\s*[-_.]\s*/i, '');
  s = s.replace(/^\[[^\]]*\]\s*/, ''); // leading [group]
  s = s.replace(/_/g, ' ');
  return s;
}

// ---------------------------------------------------------------------------
// Tag collection for re-adding user selected tags
// ---------------------------------------------------------------------------
function firstMatch(region, values) {
  const rx = buildGroupRegex(values);
  const m = region.match(rx);
  return m ? m[0] : null;
}

function canonResolution(s) {
  const k = s.toLowerCase().replace(/[\s._-]/g, '');
  if (k === 'uhd' || k === '4k') return '2160p';
  if (k === '8k') return '4320p';
  return k;
}

function canonSource(s) {
  const k = s.toLowerCase().replace(/[\s._-]/g, '');
  const map = {
    webdl: 'WEB-DL', web: 'WEB', webrip: 'WEBRip', bluray: 'BluRay',
    bdrip: 'BDRip', brrip: 'BRRip', hdtv: 'HDTV', dvdrip: 'DVDRip',
    dvdscr: 'DVDScr', cam: 'CAM', ts: 'TS',
  };
  return map[k] || s;
}

function canonCodec(s) {
  const k = s.toLowerCase().replace(/[\s._-]/g, '');
  if (['x265', 'h265', 'hevc'].includes(k)) return 'x265';
  if (['x264', 'h264', 'avc'].includes(k)) return 'x264';
  if (k === 'av1') return 'AV1';
  if (k === 'xvid') return 'XviD';
  return s;
}

function collectTags(region, opts) {
  const r = splitStuck(region);
  const out = [];
  if (opts.addResolution) {
    const hit = firstMatch(r, TAG_GROUPS.resolution);
    if (hit) out.push(canonResolution(hit));
  }
  if (opts.addSource) {
    const hit = firstMatch(r, TAG_GROUPS.source);
    if (hit) out.push(canonSource(hit));
  }
  if (opts.addCodec) {
    const hit = firstMatch(r, TAG_GROUPS.videoCodec);
    if (hit) out.push(canonCodec(hit));
  }
  return out;
}

function buildBracket(tags, opts) {
  const parts = tags.slice();
  if (opts.addBossx) parts.push('BOSSx');
  return parts.length ? ' [' + parts.join(' ') + ']' : '';
}

// ---------------------------------------------------------------------------
// TV detection and parsing
// ---------------------------------------------------------------------------
// Group 3, when present, is the last episode of a multi episode file such as
// S02E13E14, S02E13-E14, S02E13-14, S02E13+E14 or 2x13-2x14.
const TV_PATTERNS = [
  /\bS(\d{1,2})[ ._]?E[Pp]?(\d{1,3})(?:[ ._]*(?:[-+&]|-?E[Pp]?|\.E[Pp]?)[ ._]*E?[Pp]?(\d{1,3}))?\b/i,
  /\b(\d{1,2})x(\d{2,3})(?:[ ._]*[-+&][ ._]*(?:\d{1,2}x)?(\d{2,3}))?\b/i,
  /\bSeason[ ._]?(\d{1,2})[ ._]?Episode[ ._]?(\d{1,3})\b/i,
];

function matchEpisode(s, allowAbsolute) {
  s = String(s).replace(/_/g, ' '); // underscores act as separators (length preserving)
  for (const rx of TV_PATTERNS) {
    const m = s.match(rx);
    if (m) {
      const episode = parseInt(m[2], 10);
      const end = m[3] != null ? parseInt(m[3], 10) : null;
      return {
        index: m.index,
        raw: m[0],
        season: parseInt(m[1], 10),
        episode,
        episodeEnd: end != null && end !== episode ? end : null,
        epWidth: m[2].length,
      };
    }
  }
  // Absolute numbering (anime, cartoon shorts) - only when the caller says the
  // file is in a TV context, since a bare number is otherwise too ambiguous.
  if (allowAbsolute) {
    // Leading "001 - Title", "01. Title", "032 Title".
    let m = s.match(/^\s*0*(\d{1,4})[ ._)\]-]+(?=[A-Za-z(])/);
    if (m && !(m[1].length === 4 && /^(?:19|20)\d\d$/.test(m[1]))) {
      return { index: 0, raw: m[0], season: 1, episode: parseInt(m[1], 10),
        episodeEnd: null, epWidth: m[1].length, absolute: true };
    }
    // "Show Name - 021" or "Show Name 021 - Title" (show part must have letters).
    m = s.match(/^(.+?[A-Za-z].*?)[ ._-]+(?:e|ep|episode)?[ ._-]*0*(\d{1,4})(?=$|[ ._-])/i);
    if (m && !(m[2].length === 4 && /^(?:19|20)\d\d$/.test(m[2]))) {
      return { index: m[1].length, raw: s.slice(m[1].length, m[0].length),
        season: 1, episode: parseInt(m[2], 10), episodeEnd: null,
        epWidth: m[2].length, absolute: true };
    }
  }
  return null;
}

function looksLikeTV(s) {
  return !!matchEpisode(s);
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
// Choose the release year from a name. A year in brackets or parentheses wins.
// Otherwise, when several years are present, the last one is taken, since a year
// inside the title (Blade Runner 2049, 1917) comes before the real release year.
function pickYear(str) {
  const paren = str.match(/[\[(]\s*((?:19|20)\d{2})\s*[\])]/);
  if (paren) {
    return { year: paren[1], index: str.indexOf(paren[0]) + paren[0].indexOf(paren[1]) };
  }
  const all = Array.from(str.matchAll(/(?:^|[\s._\-\[\]()])((?:19|20)\d{2})(?=[\s._\-\[\]()]|$)/g));
  if (!all.length) return null;
  const chosen = all[all.length - 1];
  return { year: chosen[1], index: chosen.index + chosen[0].indexOf(chosen[1]) };
}

// A stacked / multi-part movie marker sitting at the very end of the file name:
// "CD1", "Disc 2", "DVD1", "part1", "pt2". Jellyfin joins these into one movie
// when they share a folder and stem, so the number is kept as " - partN". The
// marker must be the last thing in the name (a four digit year cannot be a part
// number), which keeps real titles like "Deathly Hallows Part 1 (2010)" safe
// since their "Part 1" is followed by the year.
const MOVIE_PART_RE = /[ _.\-]+(?:cd|dvd|dis[ck]|p(?:ar)?t)[ _.\-]*(\d{1,2})\s*$/i;

function moviePartNumber(base) {
  const m = preClean(base).replace(/\s*[\[{][^\]}]*[\]}]\s*$/, '').match(MOVIE_PART_RE);
  return m ? parseInt(m[1], 10) : null;
}

function formatMovie(base, ext, fullPath, opts, folderHint) {
  let clean = preClean(base);
  const partNum = moviePartNumber(base);

  // A clean "Title (Year)" folder is the source of truth. The file is made to
  // match it, not the other way around, so a folder "Fanboys (2009)" wins over
  // a file "Fanboys (2008)" and "Dr. No" keeps its period.
  if (folderHint && pickYear(preClean(folderHint))) {
    clean = preClean(folderHint);
  } else if (!pickYear(clean) && fullPath) {
    // No folder hint and no year in the file: fall back to the parent folder.
    const parent = preClean(path.basename(path.dirname(fullPath)));
    if (pickYear(parent)) clean = parent;
  }

  // Drop a trailing "[...]" or "{...}" tag group that is already on the source
  // name (like "[BOSSx]" or "[1080p BluRay]"); the tool re-adds its own. Round
  // parens are left so "(2020)" survives.
  for (let i = 0; i < 3; i++) {
    const t = clean.replace(/\s*[\[{][^\]}]*[\]}]\s*$/, '');
    if (t === clean) break;
    clean = t;
  }

  // Drop the part marker if it is still on the name (it never appears on the
  // folder hint), so it does not leak into the title.
  if (partNum != null) clean = clean.replace(MOVIE_PART_RE, '');

  const picked = pickYear(clean);

  let title;
  let year = null;
  let junkRegion = clean;

  if (picked) {
    year = picked.year;
    title = clean.slice(0, picked.index);
    junkRegion = clean.slice(picked.index + 4);
  } else {
    title = stripJunk(clean);
  }

  title = cleanName(title);
  if (!title) return null;
  title = titleCase(title);

  const tags = collectTags(stripReleaseGroup(junkRegion), opts);
  const bracket = buildBracket(tags, opts);

  const stem = year ? `${title} (${year})` : title;
  const part = partNum != null ? ` - part${partNum}` : '';
  const folder = sanitize(stem);
  const fileName = sanitize(stem + part + bracket) + ext.toLowerCase();
  if (!folder || !fileName) return null;

  return { relPath: path.join(folder, fileName) };
}

function formatTV(base, ext, fullPath, opts, showHint, seasonHint, allowAbsolute) {
  const clean = preClean(base);
  const epInName = matchEpisode(clean, allowAbsolute);
  const ep = epInName || matchEpisode(fullPath, allowAbsolute);
  if (!ep) return null;

  // A "Season N" folder overrides the season number parsed from the file name.
  const season = (seasonHint != null) ? seasonHint : ep.season;

  let show;
  let epRegion;

  if (epInName) {
    epRegion = clean.slice(epInName.index + epInName.raw.length);
  } else {
    epRegion = clean;
  }

  // The show's own folder wins over the name parsed from the file, so a folder
  // named "Daredevil" is kept even when the files say "Marvels.Daredevil".
  if (showHint && !isRebuildableDir(showHint)) {
    show = showHint;
  } else if (epInName) {
    show = clean.slice(0, epInName.index);
  } else {
    show = path.basename(path.dirname(fullPath));
  }

  show = titleCase(cleanName(show));
  if (!show) {
    show = titleCase(cleanName(preClean(path.basename(path.dirname(fullPath)))));
  }
  if (!show) return null;

  let epName = epRegion.replace(/^[\s._\-]+/, '');
  epName = stripReleaseGroup(epName);
  epName = stripJunk(epName);
  epName = cleanName(epName);
  epName = epName.replace(/\b(?:19|20)\d{2}\b.*$/, '').trim();
  epName = titleCase(epName);

  const s = String(season).padStart(2, '0');
  const e = String(ep.episode).padStart(Math.max(2, ep.epWidth || 2), '0');
  let epTag = `S${s}E${e}`;
  if (ep.episodeEnd != null) {
    epTag += `-E${String(ep.episodeEnd).padStart(2, '0')}`;
  }

  const tags = collectTags(stripReleaseGroup(epRegion), opts);
  const bracket = buildBracket(tags, opts);

  let core = `${show} ${epTag}`;
  if (epName) core += ` - ${epName}`;

  const folder = sanitize(show);
  const seasonFolder = `Season ${s}`;
  const fileName = sanitize(core + bracket) + ext.toLowerCase();
  if (!folder || !fileName) return null;

  return { relPath: path.join(folder, seasonFolder, fileName), show: folder };
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------
// Only these are ever scanned, renamed or moved. Everything else, including
// season.nfo, tvshow.nfo, posters, artwork and subtitle files, is left exactly
// where it is and never touched.
const VIDEO_EXT = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm',
  '.mpg', '.mpeg', '.ts', '.m2ts', '.divx', '.vob',
]);

// System and hidden folders that are never worth scanning.
const SKIP_DIRS = new Set([
  '$recycle.bin', 'system volume information', 'found.000', 'recycler',
  '.git', 'node_modules', '@eadir', '.trash-1000', 'lost+found',
]);

function walk(dir, acc) {
  acc = acc || [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return acc;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const low = ent.name.toLowerCase();
      if (SKIP_DIRS.has(low) || low.startsWith('.')) continue;
      walk(full, acc);
    } else if (ent.isFile() && VIDEO_EXT.has(path.extname(ent.name).toLowerCase())) {
      acc.push(full);
    }
  }
  return acc;
}

function samePath(a, b) {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  if (process.platform === 'win32') return ra.toLowerCase() === rb.toLowerCase();
  return ra === rb;
}

// Settings with every optional tag off, used to test if a file is "already good".
const BARE_OPTS = { addResolution: false, addBossx: false, addSource: false, addCodec: false };

// Folders Jellyfin treats as bonus content. Anything inside one of these is
// left exactly as it is, renaming it would break Jellyfin's extras detection.
const EXTRAS_FOLDERS = new Set([
  'extras', 'extra', 'featurettes', 'featurette', 'behind the scenes',
  'deleted scenes', 'deleted scene', 'deleted', 'interviews', 'interview',
  'scenes', 'scene', 'samples', 'sample', 'shorts', 'short', 'trailers',
  'trailer', 'clips', 'clip', 'other', 'bonus', 'bonus content', 'extra videos',
]);

// Also catches numbered / season-prefixed extras folders like "Extras1" or
// "Bonanza S01 Extras2", and "Bonus Episode ..." style bins.
const EXTRAS_DIR_RE =
  /(?:^|[ ._-])(?:extras?\d+|s\d{1,2}[ ._-]*extras?\d*|season[ ._-]?\d{1,2}[ ._-]*extras?\d*|bonus[ ._-]*episodes?.*)$/i;

// Filename endings Jellyfin reads as an extra, e.g. "Movie (2020)-trailer.mp4".
const EXTRA_SUFFIX_RE =
  /[-. _](trailer|sample|clip|extra|featurette|interview|scene|short|deleted|behindthescenes|other)$/i;

// TV library folder names, used to leave non episode files under them alone
// rather than turning cartoon shorts into movie folders.
const TV_LIBRARY_DIRS = new Set([
  'tv', 'tvshows', 'tv shows', 'shows', 'series', 'tv series', 'anime',
  'cartoons', 'cartoon',
]);

function normSeg(seg) {
  return seg.toLowerCase().replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Names of library / mother folders. Files are never moved out of one of these,
// the tool only rebuilds the movie folder and the file name inside it.
const LIBRARY_DIRS = new Set([
  'movies', 'movie', 'films', 'film', 'cinema', 'media', 'video', 'videos',
  'downloads', 'download', 'complete', 'plex', 'jellyfin', 'emby', 'kodi',
  'tv', 'tvshows', 'tv shows', 'shows', 'show', 'series', 'tv series',
  'anime', 'cartoons', 'documentaries', 'kids', 'collection', 'library',
]);

// Matches a season folder: bare ("Season 1"), show-prefixed ("Breaking Bad
// Season 1"), with a year ("Season 1 (2009)") or a subtitle ("Season 1 - Foo"),
// the short "S01" form, or a "Specials" folder.
const SEASON_DIR_RE =
  /(?:^|[ ._-])(?:seasons?|series|staffel|saison)[ ._-]*\d{1,3}\b|(?:^|[ ._-])s\d{1,2}(?![0-9eE])|(?:^|[ ._-])specials?\b/i;

function isLibraryDir(p) {
  return LIBRARY_DIRS.has(normSeg(path.basename(p)));
}

// A folder that the tool rebuilds (a messy scene folder) or that is purely
// structural (a Season folder, a per episode folder), so it is walked past
// when looking for where the file's mother library folder is.
function isRebuildableDir(name) {
  return HAS_TAGS_RE.test(name) || !!matchEpisode(name) ||
    /[._]\d{4}[._]/.test(name) || SEASON_DIR_RE.test(name);
}

// The directory the rebuilt structure attaches to. Walk up from the file until
// a library / mother folder or the scan root, stepping past messy or structural
// folders but stopping at the first clean folder (the movie or show folder) and
// anchoring just above it. A file never leaves its mother library folder.
function anchorFor(oldPath, root) {
  let d = path.dirname(oldPath);
  for (let i = 0; i < 16; i++) {
    const rel = path.relative(root, d);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || samePath(d, root)) {
      return root;
    }
    if (isLibraryDir(d)) return d;
    if (isRebuildableDir(path.basename(d))) {
      d = path.dirname(d);
      continue;
    }
    return path.dirname(d); // d is the clean movie / show folder
  }
  return root;
}

// The season number taken from a containing "Season N" / "Specials" folder,
// which the folder-says-so rule trusts over the number parsed from the file.
function seasonFromDir(oldPath, root) {
  let d = path.dirname(oldPath);
  for (let i = 0; i < 16; i++) {
    const rel = path.relative(root, d);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || samePath(d, root)) return null;
    if (isLibraryDir(d)) return null;
    const name = path.basename(d);
    const m = name.match(/(?:^|[ ._-])(?:seasons?|series|staffel|saison|s)[ ._-]*(\d{1,3})\b/i);
    if (m) return parseInt(m[1], 10);
    if (/(?:^|[ ._-])specials?\b/i.test(name)) return 0;
    d = path.dirname(d);
  }
  return null;
}

function buildRename(oldPath, root, mode, opts) {
  const ext = path.extname(oldPath);
  // Strip a stray second video extension, e.g. "Movie [YIFY].mkv.mkv".
  const base = path.basename(oldPath, ext)
    .replace(/\.(mkv|mp4|avi|mov|m4v|wmv|flv|webm|mpe?g|ts|m2ts|divx|vob)$/i, '');

  const rawSegs = path.relative(root, oldPath).split(/[\\/]+/).slice(0, -1);
  const folderSegs = rawSegs.map(normSeg);

  // Bonus content: leave it untouched.
  if (folderSegs.some((seg) => EXTRAS_FOLDERS.has(seg))) return null;
  if (rawSegs.some((seg) => EXTRAS_DIR_RE.test(seg))) return null;
  if (EXTRA_SUFFIX_RE.test(base) || normSeg(base) === 'sample') return null;

  const inSpecials = folderSegs.some((seg) => seg === 'special' || seg === 'specials');
  const underTvLibrary = folderSegs.some((seg) => TV_LIBRARY_DIRS.has(seg));

  const parentDir = path.dirname(oldPath);
  const parentName = path.basename(parentDir);

  // Absolute numbering (anime / cartoon shorts) is only tried when the file is
  // clearly in a TV context: under a TV library, or in its own non-messy folder.
  const inOwnFolder = !samePath(parentDir, root) && !isLibraryDir(parentDir);
  const allowAbsolute = underTvLibrary ||
    (inOwnFolder && !isRebuildableDir(parentName) && !pickYear(preClean(parentName)));

  let isTV = looksLikeTV(base) || looksLikeTV(oldPath);
  if (!isTV && allowAbsolute && (matchEpisode(base, true) || matchEpisode(oldPath, true))) {
    isTV = true;
  }

  // A file inside a Specials folder with no S00E00 style marker cannot be
  // numbered safely. Leave it rather than turning it into a bogus movie folder.
  if (inSpecials && !isTV) return null;
  // Under a TV library but not an episode of anything: leave it alone.
  if (underTvLibrary && !isTV) return null;

  if (mode === 'movies' && isTV) return null;
  if (mode === 'tv' && !isTV) return null;

  const anchor = anchorFor(oldPath, root);

  // The clean folder that holds this file (the show or movie folder), used so a
  // tidy existing folder name wins over the messy one parsed from the file.
  const showHint = isTV
    ? (path.relative(anchor, parentDir).split(/[\\/]/)[0] || '')
    : '';
  // A "Season N" folder is authoritative for the season number.
  const seasonHint = isTV ? seasonFromDir(oldPath, root) : null;

  // For a movie, a clean "Title (Year)" parent folder is authoritative.
  const movieFolderHint = (!isTV && inOwnFolder && !isRebuildableDir(parentName) &&
    pickYear(preClean(parentName))) ? parentName : '';
  // A stray file sitting straight in the library / scan root with no folder.
  const loose = !inOwnFolder;

  const target = isTV
    ? formatTV(base, ext, oldPath, opts, showHint, seasonHint, allowAbsolute)
    : formatMovie(base, ext, oldPath, opts, movieFolderHint);
  if (!target) return null;
  const newPath = path.join(anchor, target.relPath);
  if (samePath(newPath, oldPath)) return null;

  // If the file name and its immediate folder already match what we would
  // produce, it does not need renaming. Leave it out of the list.
  const sameLeaf = (a, b) => (process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (sameLeaf(path.basename(newPath), path.basename(oldPath)) &&
      sameLeaf(path.basename(path.dirname(newPath)), path.basename(path.dirname(oldPath)))) {
    return null;
  }

  // A file is "already good" when it is only in the list because of the
  // optional tag brackets. With no tags added it would already be in final form.
  const bare = isTV
    ? formatTV(base, ext, oldPath, BARE_OPTS, showHint, seasonHint, allowAbsolute)
    : formatMovie(base, ext, oldPath, BARE_OPTS, movieFolderHint);
  const alreadyGood = !!bare && samePath(path.join(anchor, bare.relPath), oldPath);

  return {
    oldPath,
    newPath,
    kind: isTV ? 'tv' : 'movie',
    show: isTV ? target.show : null,
    loose,
    alreadyGood,
    sidecars: findSidecars(oldPath, newPath),
    relOld: path.relative(root, oldPath) || path.basename(oldPath),
    relNew: path.relative(root, newPath) || path.basename(newPath),
  };
}

// Subtitle and metadata files that belong to one video file.
const SIDECAR_EXT = new Set([
  '.srt', '.ass', '.ssa', '.sub', '.idx', '.vtt', '.sup', '.nfo',
]);

// Find files next to the video that share its name (plus an optional language or
// "forced" suffix) so they follow it to the new path and stay matched.
function findSidecars(videoPath, newVideoPath) {
  const dir = path.dirname(videoPath);
  const vName = path.basename(videoPath);
  const stem = path.basename(videoPath, path.extname(videoPath));
  const stemLc = stem.toLowerCase();
  const newDir = path.dirname(newVideoPath);
  const newStem = path.basename(newVideoPath, path.extname(newVideoPath));

  let entries;
  try { entries = fs.readdirSync(dir); } catch (err) { return []; }

  const out = [];
  for (const name of entries) {
    if (name === vName) continue;
    const ext = path.extname(name).toLowerCase();
    if (!SIDECAR_EXT.has(ext)) continue;
    const noExt = name.slice(0, name.length - ext.length);
    const noExtLc = noExt.toLowerCase();
    if (noExtLc === stemLc || noExtLc.startsWith(stemLc + '.')) {
      const suffix = noExt.slice(stem.length); // "" or ".en" or ".forced.en" ...
      out.push({
        from: path.join(dir, name),
        to: path.join(newDir, newStem + suffix + ext),
      });
    }
  }
  return out;
}

// One folder per show. When the same show is spelled with different casing
// across files (Lucifer vs LUCIFER), rewrite them all to the first spelling
// seen so they land in a single folder with a matching filename prefix.
function unifyShowFolders(plan) {
  const canon = new Map();
  for (const p of plan) {
    if (p.kind !== 'tv' || !p.show) continue;
    const key = p.show.toLowerCase();
    if (!canon.has(key)) canon.set(key, p.show);
  }
  for (const p of plan) {
    if (p.kind !== 'tv' || !p.show) continue;
    const want = canon.get(p.show.toLowerCase());
    if (!want || want === p.show) continue;
    const swap = (s) => s.split(p.show).join(want);
    p.relNew = swap(p.relNew);
    p.newPath = swap(p.newPath);
    p.show = want;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      defaultPath: typeof raw.defaultPath === 'string' ? raw.defaultPath : '',
      settings: Object.assign({}, DEFAULT_CONFIG.settings, raw.settings || {}),
    };
  } catch (err) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    return true;
  } catch (err) {
    console.log(yellow('  Could not save config: ' + err.message));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function logEntry(status, oldPath, newPath) {
  return `[${new Date().toISOString()}] ${status}\n` +
    `    OLD: ${oldPath}\n` +
    `    NEW: ${newPath}\n`;
}

function appendLog(lines, label) {
  if (!lines.length) return;
  const header = `===== ${label || 'Run'} ${new Date().toISOString()} =====\n`;
  try {
    fs.appendFileSync(LOG_PATH, header + lines.join('') + '\n');
  } catch (err) {
    console.log(yellow('  Could not write log: ' + err.message));
  }
}

// Read rename-log.txt back into a list of runs, oldest first. Each run is
// { label, ts, entries: [{ status, oldPath, newPath }] }.
function parseLog() {
  let text;
  try {
    text = fs.readFileSync(LOG_PATH, 'utf8');
  } catch (err) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const runs = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^===== (Run|Undo|Duplicates) (\d{4}-\d{2}-\d{2}T[0-9:.]+Z) =====$/);
    if (head) {
      current = { label: head[1], ts: head[2], entries: [] };
      runs.push(current);
      continue;
    }
    const ent = lines[i].match(/^\[[^\]]+\] (.+)$/);
    if (ent && current) {
      const oldLine = (lines[i + 1] || '').match(/^\s*OLD: (.+)$/);
      const newLine = (lines[i + 2] || '').match(/^\s*NEW: (.+)$/);
      if (oldLine && newLine) {
        current.entries.push({ status: ent[1], oldPath: oldLine[1], newPath: newLine[1] });
        i += 2;
      }
    }
  }
  return runs;
}

// Remove a directory if it is empty, then walk up doing the same, so folders
// left hollow by a move do not linger. Stops at the first non-empty parent.
function removeEmptyDirsUp(dir) {
  let cur = dir;
  for (let i = 0; i < 8; i++) {
    try {
      if (fs.readdirSync(cur).length > 0) break;
      fs.rmdirSync(cur);
      cur = path.dirname(cur);
    } catch (err) {
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Terminal helpers and manual readline UI
// ---------------------------------------------------------------------------
function restoreTerminal() {
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false); } catch (err) { /* ignore */ }
  }
  process.stdout.write('\x1b[0m');
}

process.on('exit', restoreTerminal);
process.on('SIGINT', () => { restoreTerminal(); process.exit(0); });

function setupKeys() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
}

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

// The full colored title art, shown at the top of every screen.
function bannerArt() {
  return solidBlock(asciiArtTop, TOP_COLOR) + '\n' +
    renderSideBySide(
      asciiArtJelly, asciiArtFormatter,
      BOTTOM_GRADIENT_START, BOTTOM_GRADIENT_END, TOP_COLOR
    );
}

const BANNER_ROWS = asciiArtTop.split('\n').length +
  Math.max(asciiArtJelly.split('\n').length, asciiArtFormatter.split('\n').length) + 2;

function printHeader() {
  console.log(bannerArt());
  console.log(gray(`  v${VERSION}`));
  console.log('');
}

const COLS = () => process.stdout.columns || 100;
const ROWS = () => process.stdout.rows || 24;

function fit(s, n) {
  s = String(s);
  if (n < 4) return s.slice(0, n);
  return s.length <= n ? s : s.slice(0, n - 3) + '...';
}

function safeStat(p) {
  try { return fs.statSync(p); } catch (err) { return null; }
}

// Send a file to the Windows Recycle Bin using the VisualBasic helper that
// ships with .NET. Returns true only if the file is actually gone afterward.
function sendToRecycleBin(file) {
  if (process.platform !== 'win32') return false;
  const lit = "'" + String(file).replace(/'/g, "''") + "'";
  const ps = 'Add-Type -AssemblyName Microsoft.VisualBasic; ' +
    '[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(' + lit +
    ", 'OnlyErrorDialogs', 'SendToRecycleBin')";
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { windowsHide: true, stdio: 'ignore' });
  } catch (err) {
    return false;
  }
  return !fs.existsSync(file);
}

function humanSize(n) {
  if (n >= 1e9) return (n / 1073741824).toFixed(1) + ' GB';
  if (n >= 1e6) return (n / 1048576).toFixed(0) + ' MB';
  if (n >= 1e3) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}

function fileDate(st) {
  const b = st.birthtime, m = st.mtime;
  const use = (b && b.getFullYear() > 1980 && b <= m) ? b : m;
  return use.toISOString().slice(0, 10);
}

// Resolution pulled straight from a filename, "if it is there".
function resFromName(name) {
  const wh = name.match(/\b(\d{3,4})x(\d{3,4})\b/);
  if (wh) return wh[1] + 'x' + wh[2];
  const p = name.match(/\b(4320p|2160p|1080p|720p|576p|480p)\b/i);
  if (p) return p[1].toLowerCase();
  if (/\b(?:4k|uhd)\b/i.test(name)) return '2160p';
  return '';
}

// A key that is the same for two copies of the same movie or episode.
function dedupKey(oldPath) {
  const ext = path.extname(oldPath);
  const base = path.basename(oldPath, ext)
    .replace(/\.(mkv|mp4|avi|mov|m4v|wmv|flv|webm|mpe?g|ts|m2ts|divx|vob)$/i, '');
  const isTV = looksLikeTV(base) || looksLikeTV(oldPath);
  if (isTV) {
    const clean = preClean(base);
    const epIn = matchEpisode(clean);
    const ep = epIn || matchEpisode(oldPath);
    if (!ep) return null;
    let show = epIn ? clean.slice(0, epIn.index) : path.basename(path.dirname(oldPath));
    show = titleCase(cleanName(show)).toLowerCase();
    if (!show) return null;
    const s = String(ep.season).padStart(2, '0');
    const e = String(ep.episode).padStart(2, '0');
    return `${show} s${s}e${e}`;
  }
  const r = formatMovie(base, ext, oldPath, BARE_OPTS);
  if (!r) return null;
  return path.basename(r.relPath, path.extname(r.relPath)).toLowerCase();
}

function isEnter(key) {
  return key.name === 'return' || key.name === 'enter';
}

function isSpace(str, key) {
  return key.name === 'space' || str === ' ';
}

// Single choice menu, arrow keys plus Enter.
function selectMenu(title, options) {
  return new Promise((resolve) => {
    let index = 0;

    function render() {
      clearScreen();
      printHeader();
      console.log('\n  ' + bold(brand(title)) + '\n');
      options.forEach((opt, i) => {
        const pointer = i === index ? brand('>') : ' ';
        const label = i === index ? bold(brand(opt)) : opt;
        console.log(`   ${pointer} ${label}`);
      });
      console.log('\n' + keyHints([
        ['↑/↓', 'move'],
        ['Enter', 'select'],
        ['Ctrl+C', 'exit'],
      ]));
    }

    function onKey(str, key) {
      key = key || {};
      if (key.ctrl && key.name === 'c') { cleanup(); restoreTerminal(); process.exit(0); }
      if (key.name === 'up') { index = (index - 1 + options.length) % options.length; render(); }
      else if (key.name === 'down') { index = (index + 1) % options.length; render(); }
      else if (isEnter(key)) { cleanup(); resolve(index); }
    }

    function cleanup() { process.stdin.removeListener('keypress', onKey); }

    setupKeys();
    process.stdin.on('keypress', onKey);
    render();
  });
}

// Multi toggle list, arrow keys move, Space toggles, A toggles all, Enter confirms.
function checkboxList(title, items, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    if (!items.length) return resolve(items);
    let index = 0;

    function render() {
      clearScreen();
      printHeader();
      console.log('\n  ' + bold(brand(title)) + '\n');

      const maxVisible = Math.max(4, ROWS() - BANNER_ROWS - 7);
      let start = 0;
      if (items.length > maxVisible) {
        start = Math.min(
          Math.max(0, index - Math.floor(maxVisible / 2)),
          items.length - maxVisible
        );
      }
      const end = Math.min(items.length, start + maxVisible);

      if (start > 0) console.log(gray(`   ... ${start} more above`));
      for (let i = start; i < end; i++) {
        const it = items[i];
        const pointer = i === index ? brand('>') : ' ';
        const box = it.checked ? green('[x]') : gray('[ ]');
        const label = i === index ? bold(it.label) : it.label;
        console.log(`   ${pointer} ${box} ${label}`);
      }
      if (end < items.length) console.log(gray(`   ... ${items.length - end} more below`));

      const checked = items.filter((x) => x.checked).length;
      console.log('\n' + gray(`   ${checked} of ${items.length} selected`));
      console.log(keyHints([
        ['↑/↓', 'move'],
        ['Space', 'toggle'],
        ['A', 'all'],
        ['Enter', 'confirm'],
        ['Ctrl+C', 'exit'],
      ]));
    }

    function onKey(str, key) {
      key = key || {};
      if (key.ctrl && key.name === 'c') { cleanup(); restoreTerminal(); process.exit(0); }
      if (key.name === 'up') index = (index - 1 + items.length) % items.length;
      else if (key.name === 'down') index = (index + 1) % items.length;
      else if (key.name === 'pageup') index = Math.max(0, index - 10);
      else if (key.name === 'pagedown') index = Math.min(items.length - 1, index + 10);
      else if (isSpace(str, key)) items[index].checked = !items[index].checked;
      else if (str === 'a' || str === 'A') {
        const allOn = items.every((x) => x.checked);
        items.forEach((x) => { x.checked = !allOn; });
      } else if (isEnter(key)) { cleanup(); return resolve(items); }
      else return;
      render();
    }

    function cleanup() { process.stdin.removeListener('keypress', onKey); }

    setupKeys();
    process.stdin.on('keypress', onKey);
    render();
  });
}

// Manual single line text input, no readline interface swap.
function promptText(question, def) {
  return new Promise((resolve) => {
    let buf = '';

    function render() {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      const hint = def ? gray(` [${def}]`) : '';
      process.stdout.write('  ' + brand(question) + hint + ': ' + buf);
    }

    function onKey(str, key) {
      key = key || {};
      if (key.ctrl && key.name === 'c') { cleanup(); restoreTerminal(); process.exit(0); }
      if (isEnter(key)) {
        cleanup();
        process.stdout.write('\n');
        return resolve(buf.trim() || def || '');
      }
      if (key.name === 'backspace') { buf = buf.slice(0, -1); return render(); }
      if (key.name === 'escape') { buf = ''; return render(); }
      if (key.ctrl && key.name === 'u') { buf = ''; return render(); }
      if (str && !key.ctrl && !key.meta && str >= ' ') { buf += str; return render(); }
    }

    function cleanup() { process.stdin.removeListener('keypress', onKey); }

    setupKeys();
    process.stdin.on('keypress', onKey);
    render();
  });
}

function pause(msg) {
  return new Promise((resolve) => {
    function onKey(str, key) {
      key = key || {};
      if (key.ctrl && key.name === 'c') { cleanup(); restoreTerminal(); process.exit(0); }
      if (isEnter(key)) { cleanup(); process.stdout.write('\n'); resolve(); }
    }
    function cleanup() { process.stdin.removeListener('keypress', onKey); }
    setupKeys();
    process.stdin.on('keypress', onKey);
    process.stdout.write('\n' + gray('  ' + (msg || 'Press Enter to continue') + ' '));
  });
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
async function showIntro() {
  clearScreen();
  printHeader();
  console.log('  ' + 'A toolkit for getting a movie and TV library into Jellyfin shape:');
  console.log('  ' + 'rename files to Jellyfin standards, give stray files a folder, find');
  console.log('  ' + 'duplicates, write custom season names, and undo any run.');
  console.log('  ' + 'More of my tools: ' + linkText('https://BOSSx.ca'));
  console.log('');
  console.log('  ' + yellow('This tool is in beta. Always look over the preview before you confirm,'));
  console.log('  ' + yellow('some files may still need a manual touch-up.'));
  console.log('');
  console.log('  ' + gray('Point it at a whole drive or any folder that holds your Movies and'));
  console.log('  ' + gray('TV Shows folders. Files are never moved out of those. For a big library,'));
  console.log('  ' + gray('doing one show or the Movies folder at a time keeps the list short.'));
  console.log('');
  console.log('  ' + 'Discord: ' + linkText('https://discord.gg/G5wVgJFxQQ'));
  await pause('Press Enter to start');
}

async function chooseMode() {
  const idx = await selectMenu('What do you want to do?', [
    'Rename Movies',
    'Rename TV Shows',
    'Rename Both',
    'Put stray files in folders',
    'Find duplicates',
    'Create season.nfo',
    'Undo a previous run',
  ]);
  return ['movies', 'tv', 'both', 'setup', 'dupes', 'nfo', 'undo'][idx];
}

function xmlEscape(s) {
  return s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[ch]));
}

// Write a season.nfo so Jellyfin shows a custom season name. The folder itself
// is never renamed, only what Jellyfin displays for that season.
async function createSeasonNfo() {
  clearScreen();
  printHeader();
  console.log('  ' + bold(brand('Create season.nfo')) + '\n');
  console.log('  ' + gray('This drops a small season.nfo file into a season folder. It does not'));
  console.log('  ' + gray('rename the folder. It only changes the season name Jellyfin shows.'));
  console.log('');

  let dir = '';
  while (!dir) {
    const raw = (await promptText('Season folder path', '')).replace(/^"(.*)"$/, '$1').trim();
    let isDir = false;
    try { isDir = !!raw && fs.statSync(raw).isDirectory(); } catch (err) { isDir = false; }
    if (isDir) {
      dir = raw;
    } else if (raw) {
      console.log(gray('  That folder does not exist. Check the path, or Ctrl+C to quit.'));
    } else {
      console.log(gray('  Enter the path to an existing season folder. Ctrl+C to quit.'));
    }
  }

  let title = '';
  while (!title) {
    title = (await promptText('Season name to show in Jellyfin', '')).trim();
    if (!title) console.log(gray('  A name is required. Ctrl+C to quit.'));
  }

  const folderName = path.basename(dir);
  let guess = (folderName.match(/season[ ._-]*(\d{1,3})/i) ||
    folderName.match(/(\d{1,3})\s*$/) || [])[1] || '';
  if (!guess && /(?:^|[ ._-])specials?$/i.test(folderName)) guess = '0';

  let num = null;
  while (num === null) {
    const numRaw = (await promptText('Season number (0 for specials)', guess)).trim();
    if (/^\d{1,3}$/.test(numRaw)) {
      num = parseInt(numRaw, 10);
    } else {
      console.log(gray('  Enter a whole number like 1, or 0 for specials. Ctrl+C to quit.'));
    }
  }

  const hideItems = [{
    label: 'Hide File   ' + gray('(sets the OS hidden attribute so it stays out of the way)'),
    checked: true,
  }];
  await checkboxList('season.nfo options', hideItems);
  const hide = hideItems[0].checked;

  const xml =
    '<season>\n' +
    '  <title>' + xmlEscape(title) + '</title>\n' +
    '  <seasonnumber>' + num + '</seasonnumber>\n' +
    '</season>\n';
  const target = path.join(dir, 'season.nfo');

  clearScreen();
  printHeader();
  console.log('  ' + bold(brand('Create season.nfo')) + '\n');
  console.log('  ' + brand('Folder:   ') + dir + '   ' + gray('(name unchanged)'));
  console.log('  ' + brand('File:     ') + target);
  console.log('  ' + brand('Shows as: ') + title + gray('   (season ' + num + ')'));
  console.log('  ' + brand('Hidden:   ') + (hide ? 'yes' : 'no'));
  console.log('');
  console.log(gray(xml.replace(/^/gm, '    ').replace(/\s+$/, '')));
  console.log('');
  if (fs.existsSync(target)) {
    console.log('  ' + yellow('A season.nfo already exists here and will be replaced.'));
    console.log('');
  }

  const ok = await selectMenu('Write this file?', ['Yes, write it', 'No, cancel']);
  if (ok !== 0) {
    console.log(yellow('\n  Cancelled. Nothing was written.'));
    process.exit(0);
  }

  try {
    fs.writeFileSync(target, xml);
    console.log(green('\n  Wrote ' + target));
    console.log('  ' + brand('Season Name:   ') + title);
    console.log('  ' + brand('Season Number: ') + num);
  } catch (err) {
    console.log(red('\n  Could not write the file: ' + err.message));
    process.exit(1);
  }

  if (hide) {
    if (process.platform === 'win32') {
      try {
        execFileSync('attrib', ['+h', target], { windowsHide: true });
        console.log(gray('  Set as hidden. Turn on "show hidden items" in Explorer to see it.'));
      } catch (err) {
        console.log(yellow('  File written, but could not set the hidden attribute.'));
      }
    } else {
      console.log(gray('  Hiding needs Windows. On this OS the file stays visible (it must'));
      console.log(gray('  keep the name "season.nfo" for Jellyfin, so it cannot be dot-hidden).'));
    }
  }

  console.log(gray('  In Jellyfin, refresh metadata for the show to pick up the new name.'));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Duplicate finder. Groups files that look like the same movie or episode,
// shows resolution / date / size, and moves the ones you check into a
// _Duplicates folder. Nothing is renamed and nothing is deleted.
// ---------------------------------------------------------------------------
async function findDuplicates(config) {
  clearScreen();
  printHeader();
  console.log('  ' + bold(brand('Find duplicates')) + '\n');
  console.log('  ' + gray('Groups files that look like the same movie or episode. Nothing is'));
  console.log('  ' + gray('renamed or deleted. The ones you check are moved into a _Duplicates'));
  console.log('  ' + gray('folder at the scan root so you can look them over later.'));
  console.log('');

  let scanPath = '';
  while (!scanPath) {
    const raw = (await promptText('Folder or drive path to scan', config.defaultPath || ''))
      .replace(/^"(.*)"$/, '$1').trim();
    let isDir = false;
    try { isDir = !!raw && fs.statSync(raw).isDirectory(); } catch (err) { isDir = false; }
    if (isDir) scanPath = raw;
    else console.log(gray('  That folder does not exist. Check the path, or Ctrl+C to quit.'));
  }

  process.stdout.write(brand('  Scanning for video files ...'));
  const files = walk(scanPath, []);
  process.stdout.write('\r' + gray(`  Found ${files.length} video file(s).            `) + '\n');

  const groups = new Map();
  for (const f of files) {
    const key = dedupKey(f);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const dupes = [...groups.entries()]
    .filter(([, v]) => v.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (!dupes.length) {
    console.log(green('\n  No duplicates found.'));
    process.exit(0);
  }
  const dupeCount = dupes.reduce((a, [, v]) => a + v.length, 0);
  await pause(`${dupes.length} group(s), ${dupeCount} file(s). Press Enter to review`);

  const relW = Math.max(24, Math.floor(COLS() - 58));
  const items = [];
  for (const [key, list] of dupes) {
    list.sort();
    list.forEach((f, i) => {
      const st = safeStat(f);
      const res = resFromName(path.basename(f)) || '-';
      const date = st ? fileDate(st) : '?';
      const size = st ? humanSize(st.size) : '?';
      const rel = path.relative(scanPath, f) || path.basename(f);
      const tag = i === 0 ? brand(fit(key, 26).padEnd(26)) : gray('·'.padEnd(26));
      items.push({
        checked: false,
        label: tag + '  ' + fit(rel, relW) + gray('   ' +
          res.padStart(9) + '   ' + date + '   ' + size.padStart(8)),
        _file: f,
      });
    });
  }

  const reviewed = await checkboxList(
    'Duplicates   check the copies you want moved or deleted',
    items
  );
  const picked = reviewed.filter((x) => x.checked).map((x) => x._file);
  if (!picked.length) {
    console.log(yellow('\n  Nothing selected. Nothing was changed.'));
    process.exit(0);
  }

  const dupDir = path.join(scanPath, '_Duplicates');
  const showPicked = () => {
    clearScreen();
    printHeader();
    console.log('  ' + bold(brand('Selected duplicates')) + '   ' + gray(picked.length + ' file(s)') + '\n');
    for (const f of picked) {
      const st = safeStat(f);
      console.log('  ' + red('x ') + fit(path.relative(scanPath, f) || path.basename(f), COLS() - 16) +
        gray('   ' + (st ? humanSize(st.size) : '?')));
    }
    console.log('');
  };

  showPicked();
  const action = await selectMenu('What should happen to these file(s)?', [
    'Move them to a _Duplicates folder',
    'Delete them',
    'Cancel',
  ]);
  if (action === 2) {
    console.log(yellow('\n  Cancelled. Nothing was changed.'));
    process.exit(0);
  }

  if (action === 0) {
    showPicked();
    const sure = await selectMenu(
      `Are you sure you want to move the ${picked.length} duplicate(s)?`,
      ['Yes, move them', 'No']
    );
    if (sure !== 0) {
      console.log(yellow('\n  Cancelled. Nothing was moved.'));
      process.exit(0);
    }
    const moves = picked.map((f) => ({
      from: f,
      to: path.join(dupDir, path.relative(scanPath, f)),
    }));
    executeMoves(moves, { okWord: 'MOVED', runLabel: 'Duplicates' });
    console.log('');
    console.log('  ' + brand('_Duplicates folder: ') + dupDir);
    console.log('  ' + gray('file:///' + dupDir.replace(/\\/g, '/')));
    process.exit(0);
  }

  // action === 1: delete
  const winRecycle = process.platform === 'win32';
  showPicked();
  if (!winRecycle) {
    console.log('  ' + yellow('The Recycle Bin is only available on Windows. On this system'));
    console.log('  ' + yellow('these files would be permanently deleted and cannot be recovered.'));
    console.log('');
  }
  const sureDel = await selectMenu(
    winRecycle
      ? `Are you sure you want to delete the ${picked.length} duplicate(s)?  (they go to the Recycle Bin)`
      : `Permanently delete the ${picked.length} duplicate(s)?  This cannot be undone.`,
    ['Yes, delete them', 'No']
  );
  if (sureDel !== 0) {
    console.log(yellow('\n  Cancelled. Nothing was deleted.'));
    process.exit(0);
  }

  clearScreen();
  printHeader();
  console.log('');
  let recycled = 0;
  let deleted = 0;
  let failed = 0;
  const logLines = [];
  for (const f of picked) {
    const short = path.basename(f);
    let how = null;
    if (winRecycle) {
      if (sendToRecycleBin(f)) { how = 'RECYCLED'; recycled++; }
    } else {
      try {
        fs.rmSync(f, { force: true });
        if (!fs.existsSync(f)) { how = 'DELETED'; deleted++; }
      } catch (err) { /* fail */ }
    }
    if (how) {
      console.log(green('  ' + how.padEnd(9)) + short);
      logLines.push(logEntry(how, f, how === 'RECYCLED' ? '(recycle bin)' : '(permanently deleted)'));
      removeEmptyDirsUp(path.dirname(f));
    } else {
      console.log(red('  FAILED   ') + short +
        (winRecycle ? red('  (could not send to Recycle Bin)') : ''));
      failed++;
      logLines.push(logEntry('DELETE FAILED', f, ''));
    }
  }
  appendLog(logLines, 'Duplicates');
  console.log('');
  console.log('  ' + bold(green(`${recycled} to recycle bin`)) + '   ' +
    bold(green(`${deleted} deleted`)) + '   ' +
    bold(failed ? red(`${failed} failed`) : gray('0 failed')));
  console.log(gray('  History written to ' + LOG_PATH));
  process.exit(0);
}

// Printed by --version / --about. Works without an interactive terminal.
function printAbout() {
  console.log(solidBlock(asciiArtTop, TOP_COLOR));
  console.log(renderSideBySide(
    asciiArtJelly, asciiArtFormatter,
    BOTTOM_GRADIENT_START, BOTTOM_GRADIENT_END, TOP_COLOR
  ));
  console.log('');
  console.log('  BOSSx - Jellyfin Formatter   v' + VERSION);
  console.log('  Rename to Jellyfin standards, folder stray files, find duplicates,');
  console.log('  write custom season names, undo any run.');
  console.log('');
  console.log('  ' + linkText('https://BOSSx.ca') + '     ' + linkText('https://discord.gg/G5wVgJFxQQ'));
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('-')) ? v : null;
}

// --report <file> [--path <dir>] [--movies|--tv]
// Writes the full proposed plan to a file and exits. Touches nothing, no TTY.
function reportFlag() {
  const outFile = argValue('--report');
  if (!outFile) {
    console.error('  --report needs a file path, e.g.  --report plan.txt');
    process.exit(1);
  }
  const config = loadConfig();
  let scanPath = (argValue('--path') || config.defaultPath || '').replace(/^"(.*)"$/, '$1').trim();
  if (!scanPath || !fs.existsSync(scanPath) || !fs.statSync(scanPath).isDirectory()) {
    console.error('  No folder to scan. Pass --path <folder>, or set a default path in the tool first.');
    process.exit(1);
  }
  const mode = process.argv.includes('--movies') ? 'movies'
    : process.argv.includes('--tv') ? 'tv' : 'both';
  const opts = config.settings;

  process.stdout.write('Scanning ' + scanPath + ' ...\n');
  const files = walk(scanPath, []);
  const plan = [];
  for (const f of files) {
    const r = buildRename(f, scanPath, mode, opts);
    if (r) plan.push(r);
  }
  unifyShowFolders(plan);

  const j = (s) => s.split(path.sep).join('/');
  const renames = plan.filter((p) => !p.alreadyGood);
  const tagOnly = plan.filter((p) => p.alreadyGood);

  const byTarget = new Map();
  for (const p of plan) {
    const k = p.newPath.toLowerCase();
    if (!byTarget.has(k)) {
      byTarget.set(k, { target: j(path.relative(scanPath, p.newPath)) || path.basename(p.newPath), sources: [] });
    }
    byTarget.get(k).sources.push(j(p.relOld));
  }
  const collisions = [...byTarget.values()].filter((x) => x.sources.length > 1);
  const longPaths = plan.filter((p) => p.newPath.length >= 260);

  const L = [];
  L.push('BOSSx - Jellyfin Formatter  v' + VERSION + '  plan report');
  L.push('Scanned:  ' + scanPath);
  L.push('When:     ' + new Date().toISOString());
  L.push('Mode:     ' + mode);
  L.push(files.length + ' video files, ' + plan.length + ' would change  (' +
    renames.length + ' renames, ' + tagOnly.length + ' tag-only)');
  L.push('');
  L.push('=== RENAMES (' + renames.length + ') ===');
  for (const p of renames) L.push(j(p.relOld) + '  =>  ' + j(p.relNew));
  if (tagOnly.length) {
    L.push('');
    L.push('=== ALREADY NAMED RIGHT, tag only (' + tagOnly.length + ') ===');
    for (const p of tagOnly) L.push(j(p.relOld) + '  =>  ' + j(p.relNew));
  }
  L.push('');
  L.push('=== WARNINGS ===');
  if (!collisions.length && !longPaths.length) L.push('none');
  if (collisions.length) {
    L.push(collisions.length + ' target name collision(s) (only the first would win):');
    for (const c of collisions) {
      L.push('  ' + c.target);
      for (const s of c.sources) L.push('     <- ' + s);
    }
  }
  if (longPaths.length) {
    L.push(longPaths.length + ' path(s) over 260 characters (may fail on Windows):');
    for (const p of longPaths) L.push('  [' + p.newPath.length + '] ' + j(p.relNew));
  }
  L.push('');

  try {
    fs.writeFileSync(outFile, L.join('\n'));
  } catch (err) {
    console.error('  Could not write ' + outFile + ': ' + err.message);
    process.exit(1);
  }
  console.log('Wrote ' + plan.length + ' plan entr' + (plan.length === 1 ? 'y' : 'ies') +
    ' to ' + outFile);
}

async function choosePath(config) {
  clearScreen();
  printHeader();
  console.log('');
  const input = await promptText('Folder or drive path to scan', config.defaultPath || '');
  const scanPath = input.replace(/^"(.*)"$/, '$1').trim();

  if (!scanPath) {
    console.log(red('\n  No path entered.'));
    process.exit(1);
  }
  if (!fs.existsSync(scanPath) || !fs.statSync(scanPath).isDirectory()) {
    console.log(red(`\n  Not a folder: ${scanPath}`));
    process.exit(1);
  }

  if (scanPath !== config.defaultPath) {
    const save = await selectMenu('Save this as your default path for next time?', ['Yes', 'No']);
    if (save === 0) {
      config.defaultPath = scanPath;
      saveConfig(config);
      console.log(green('  Saved as default.'));
    }
  }
  return scanPath;
}

async function chooseSettings(config) {
  const items = [
    { key: 'addResolution', label: 'Add Resolution Tag  (e.g. 1080p)', checked: !!config.settings.addResolution },
    { key: 'addBossx', label: 'Add BOSSx Tag', checked: config.settings.addBossx !== false },
    { key: 'addSource', label: 'Add Source Tag  (e.g. BluRay / WEB-DL)', checked: !!config.settings.addSource },
    { key: 'addCodec', label: 'Add Codec Tag  (e.g. x265)', checked: !!config.settings.addCodec },
  ];
  await checkboxList('Settings   junk tags are always stripped, pick which to re-add', items);
  items.forEach((it) => { config.settings[it.key] = it.checked; });
  saveConfig(config);
  return Object.assign({}, config.settings);
}

function printPlanSummary(mode, scanPath, opts) {
  clearScreen();
  printHeader();
  const modeLabel = {
    movies: 'Movies', tv: 'TV Shows', both: 'Movies + TV Shows',
    setup: 'Put stray files in folders',
  }[mode];
  console.log('');
  console.log('  ' + brand('Mode:    ') + modeLabel);
  console.log('  ' + brand('Path:    ') + scanPath);
  const on = [];
  if (opts.addResolution) on.push('Resolution');
  if (opts.addSource) on.push('Source');
  if (opts.addCodec) on.push('Codec');
  if (opts.addBossx) on.push('BOSSx');
  console.log('  ' + brand('Re-add:  ') + (on.length ? on.join(', ') : 'nothing, strip only'));
  console.log('');
}

// Name collisions (two files heading for one name) and over-long paths.
function planWarnings(plan) {
  const byTarget = new Map();
  for (const p of plan) {
    const k = p.newPath.toLowerCase();
    if (!byTarget.has(k)) byTarget.set(k, []);
    byTarget.get(k).push(p);
  }
  const collisions = [...byTarget.values()].filter((g) => g.length > 1);
  const longPaths = plan.filter((p) => p.newPath.length >= 260);
  const warned = new Set();
  for (const g of collisions) for (const p of g) warned.add(p.oldPath);
  for (const p of longPaths) warned.add(p.oldPath);
  return { collisions, longPaths, warned };
}

async function reviewPlan(plan, root, warned) {
  warned = warned || new Set();
  const half = Math.max(16, Math.floor((COLS() - 16) / 2));
  const items = plan.map((p) => ({
    checked: true,
    label: (warned.has(p.oldPath) ? red('! ') : '') +
      fit(p.relOld, half) + gray('  ->  ') + green(fit(p.relNew, half)) +
      (p.alreadyGood ? gray('  (already good, tag only)') : ''),
    _plan: p,
  }));
  const reviewed = await checkboxList(
    `Review renames   ${plan.length} file(s) found, checked files will be renamed`,
    items
  );
  return reviewed.filter((x) => x.checked).map((x) => x._plan);
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
// Move a list of files. Each item is { from, to }. Shared by the rename step
// and the undo step so both behave and log the same way.
function executeMoves(list, opts) {
  opts = opts || {};
  const okWord = opts.okWord || 'RENAMED';
  const runLabel = opts.runLabel || 'Run';

  clearScreen();
  printHeader();
  console.log('');

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const logLines = [];
  const emptiedDirs = [];

  for (const it of list) {
    const shortFrom = path.basename(it.from);
    try {
      if (!fs.existsSync(it.from)) {
        console.log(red('  MISS  ') + shortFrom + red('  (source no longer there)'));
        skipped++;
        logLines.push(logEntry('SKIPPED source missing', it.from, it.to));
        continue;
      }
      if (fs.existsSync(it.to) && !samePath(it.to, it.from)) {
        console.log(red('  SKIP  ') + shortFrom + red('  (target already exists)'));
        skipped++;
        logLines.push(logEntry('SKIPPED target exists', it.from, it.to));
        continue;
      }
      fs.mkdirSync(path.dirname(it.to), { recursive: true });
      fs.renameSync(it.from, it.to);
      console.log(green('  OK    ') + shortFrom + gray('  ->  ') + path.basename(it.to));
      ok++;
      logLines.push(logEntry(okWord, it.from, it.to));
      emptiedDirs.push(path.dirname(it.from));
    } catch (err) {
      console.log(red('  ERROR ') + shortFrom + red('  ' + err.message));
      failed++;
      logLines.push(logEntry('ERROR ' + err.message, it.from, it.to));
    }
  }

  for (const d of emptiedDirs) removeEmptyDirsUp(d);
  appendLog(logLines, runLabel);

  console.log('');
  console.log('  ' + bold(green(`${ok} ${okWord.toLowerCase()}`)) + '   ' +
    bold(yellow(`${skipped} skipped`)) + '   ' +
    bold(failed ? red(`${failed} failed`) : gray('0 failed')));
  console.log(gray(`  History written to ${LOG_PATH}`));
}

function executeRenames(plan) {
  const moves = [];
  for (const p of plan) {
    moves.push({ from: p.oldPath, to: p.newPath });
    // Subtitles and per-file .nfo follow the video so they stay matched.
    for (const sc of (p.sidecars || [])) moves.push(sc);
  }
  executeMoves(moves, { okWord: 'RENAMED', runLabel: 'Run' });
}

// ---------------------------------------------------------------------------
// Undo, replay a previous run backwards from the log
// ---------------------------------------------------------------------------
async function undoFlow() {
  if (!process.stdin.isTTY) {
    console.log(red('This tool needs an interactive terminal. Run it directly with:'));
    console.log('  node BOSSx_Jellyfin_Formatter.js --undo');
    process.exit(1);
  }
  clearScreen();
  printHeader();

  // A run can be reversed if it moved files: a rename run (RENAMED) or a
  // "Find duplicates" run where copies were sent to a _Duplicates folder
  // (MOVED). Files sent to the Recycle Bin or deleted are not reversible here.
  const UNDOABLE = new Set(['RENAMED', 'MOVED']);
  const runs = parseLog().filter(
    (r) =>
      (r.label === 'Run' || r.label === 'Duplicates') &&
      r.entries.some((e) => UNDOABLE.has(e.status))
  );

  if (!runs.length) {
    console.log(yellow('\n  No past renames found in the log to undo.'));
    await pause('Press Enter to exit');
    process.exit(0);
  }

  // Newest first.
  const ordered = runs.slice().reverse();
  const options = ordered.map((r) => {
    const n = r.entries.filter((e) => UNDOABLE.has(e.status)).length;
    const tag = r.label === 'Duplicates' ? '   (duplicates move)' : '';
    return `${r.ts}   ${n} file(s)${tag}`;
  });
  options.push('Cancel');

  const pick = await selectMenu('Pick a run to undo   (newest first)', options);
  if (pick === options.length - 1) {
    console.log(yellow('\n  Cancelled.'));
    process.exit(0);
  }

  const run = ordered[pick];
  // Reverse the order too, so nested paths unwind cleanly.
  const moves = run.entries
    .filter((e) => UNDOABLE.has(e.status))
    .map((e) => ({ from: e.newPath, to: e.oldPath }))
    .reverse();

  const half = Math.max(16, Math.floor((COLS() - 14) / 2));
  const items = moves.map((m) => ({
    checked: true,
    label: fit(m.from, half) + gray('  ->  ') + green(fit(m.to, half)),
    _move: m,
  }));

  const reviewed = await checkboxList(
    `Undo review   ${moves.length} file(s) will be moved back to their old names`,
    items
  );
  const selected = reviewed.filter((x) => x.checked).map((x) => x._move);
  if (!selected.length) {
    console.log(yellow('\n  Nothing selected. No changes made.'));
    process.exit(0);
  }

  const confirm = await selectMenu(
    `Move ${selected.length} file(s) back now?`,
    ['Yes, undo', 'No, cancel']
  );
  if (confirm !== 0) {
    console.log(yellow('\n  Cancelled. Nothing was changed.'));
    process.exit(0);
  }

  executeMoves(selected, { okWord: 'RESTORED', runLabel: 'Undo' });
  console.log('');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!process.stdin.isTTY) {
    console.log(red('This tool needs an interactive terminal. Run it directly with:'));
    console.log('  node BOSSx_Jellyfin_Formatter.js');
    process.exit(1);
  }

  const config = loadConfig();

  await showIntro();
  const mode = await chooseMode();

  if (mode === 'undo') {
    await undoFlow();
    return;
  }
  if (mode === 'nfo') {
    await createSeasonNfo();
    return;
  }
  if (mode === 'dupes') {
    await findDuplicates(config);
    return;
  }

  const scanPath = await choosePath(config);
  const opts = await chooseSettings(config);

  const scanMode = mode === 'setup' ? 'both' : mode;
  printPlanSummary(mode, scanPath, opts);
  process.stdout.write(brand('  Scanning for video files ...'));
  const files = walk(scanPath, []);
  process.stdout.write('\r' + gray(`  Found ${files.length} video file(s).            `) + '\n');

  let plan = [];
  for (const file of files) {
    const res = buildRename(file, scanPath, scanMode, opts);
    if (res) plan.push(res);
  }
  unifyShowFolders(plan);
  if (mode === 'setup') {
    // Only the stray files that have no folder of their own.
    plan = plan.filter((p) => p.loose);
  }

  if (!plan.length) {
    const msg = mode === 'setup'
      ? '\n  No stray files found. Everything is already in a folder.'
      : '\n  Nothing to rename. Everything already matches, or no matching files were found.';
    console.log(green(msg));
    process.exit(0);
  }

  let working = plan;
  const goodCount = plan.filter((p) => p.alreadyGood).length;
  if (goodCount > 0) {
    const choices = [`Review all ${plan.length} files`];
    if (goodCount < plan.length) {
      choices.push(`Hide the ${goodCount} already named right, review only ${plan.length - goodCount}`);
    }
    choices.push('Cancel');
    const pickIdx = await selectMenu(
      `${goodCount} of ${plan.length} file(s) are already named correctly and would only get the tag added.`,
      choices
    );
    if (choices[pickIdx] === 'Cancel') {
      console.log(yellow('\n  Cancelled. Nothing was changed.'));
      process.exit(0);
    }
    if (pickIdx === 1 && goodCount < plan.length) {
      working = plan.filter((p) => !p.alreadyGood);
    }
  }

  const warn = planWarnings(working);
  if (warn.collisions.length || warn.longPaths.length) {
    console.log('');
    if (warn.collisions.length) {
      console.log('  ' + yellow(`${warn.collisions.length} set(s) of files would end up with the SAME name.`));
      console.log('  ' + gray('  Only the first is renamed, the rest are skipped. Uncheck or fix by hand.'));
    }
    if (warn.longPaths.length) {
      console.log('  ' + yellow(`${warn.longPaths.length} path(s) are over 260 characters and may fail on Windows.`));
    }
    console.log('  ' + gray('Marked with ') + red('!') + gray(' in the list.'));
  }

  await pause(`${working.length} file(s) can be renamed. Press Enter to review`);

  const selected = await reviewPlan(working, scanPath, warn.warned);
  if (!selected.length) {
    console.log(yellow('\n  No files selected. Nothing was changed.'));
    process.exit(0);
  }

  const confirm = await selectMenu(
    `Rename ${selected.length} file(s) now? This will move and rename them on disk.`,
    ['Yes, rename them', 'No, cancel']
  );
  if (confirm !== 0) {
    console.log(yellow('\n  Cancelled. Nothing was changed.'));
    process.exit(0);
  }

  executeRenames(selected);
  console.log('');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Self test, quick check that parsing works without touching any files
// ---------------------------------------------------------------------------
function selftest() {
  const on = { addResolution: false, addBossx: true, addSource: false, addCodec: false };
  const full = { addResolution: true, addBossx: true, addSource: true, addCodec: true };

  const cases = [
    ['The.Matrix.1999.1080p.BluRay.x264-GRP.mkv', on, 'The Matrix (1999)/The Matrix (1999) [BOSSx].mkv'],
    ['Inception (2010) [1080p] [YTS.MX].mp4', on, 'Inception (2010)/Inception (2010) [BOSSx].mp4'],
    ['Interstellar.2014.2160p.UHD.BluRay.x265.HDR.Atmos-TERMINAL.mkv', on, 'Interstellar (2014)/Interstellar (2014) [BOSSx].mkv'],
    ['Movie.Name.2012.1080pWEB-DLx264.mkv', on, 'Movie Name (2012)/Movie Name (2012) [BOSSx].mkv'],
    ['Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.HDR.H265-FLUX.mkv', full, 'Dune Part Two (2024)/Dune Part Two (2024) [2160p WEB-DL x265 BOSSx].mkv'],
    ['Breaking.Bad.S01E01.Pilot.720p.HDTV.x264-GRP.mkv', on, 'Breaking Bad/Season 01/Breaking Bad S01E01 - Pilot [BOSSx].mkv'],
    ['The.Office.US.S03E02.The.Coup.1080p.WEB-DL.x265-GRP.mkv', on, 'The Office US/Season 03/The Office US S03E02 - The Coup [BOSSx].mkv'],
    ['Show.Name.1x05.Episode.Title.HDTV.XviD.avi', on, 'Show Name/Season 01/Show Name S01E05 - Episode Title [BOSSx].avi'],
    ['Firefly.S01E03.Bushwhacked.2160p.BluRay.REMUX.HEVC-XYZ.mkv', full, 'Firefly/Season 01/Firefly S01E03 - Bushwhacked [2160p BluRay x265 BOSSx].mkv'],
    ['Blade Runner 2049 (2017)/BR2049.1080p.mkv', on, 'Blade Runner 2049 (2017)/Blade Runner 2049 (2017) [BOSSx].mkv'],
    ['www.Torrenting.com - Sicario.2015.720p.BrRip.x264.YIFY.mp4', on, 'Sicario (2015)/Sicario (2015) [BOSSx].mp4'],
    ['Beavis and Butt-Head/Season 2/Beavis and Butt-head S02E13+E14 No Laughing.mp4', on, 'Beavis and Butt-Head/Season 02/Beavis and Butt-Head S02E13-E14 - No Laughing [BOSSx].mp4'],
    ['Some.Show.S01E01-E02.Two.Parter.720p.HDTV.x264-GRP.mkv', on, 'Some Show/Season 01/Some Show S01E01-E02 - Two Parter [BOSSx].mkv'],
    ['Euphoria.US.S03E03.The.Ballad.of.Paladin.1080p.WEBRip.10Bit.DDP5.1-GRP.mkv', on, 'Euphoria US/Season 03/Euphoria US S03E03 - The Ballad of Paladin [BOSSx].mkv'],
    ['Family Guy/Season 3/Family Guy [3x03] Mr. Griffin Goes to Washington.avi', on, 'Family Guy/Season 03/Family Guy S03E03 - Mr. Griffin Goes to Washington [BOSSx].avi'],
    ['Dr.Strangelove.1964.1080p.BluRay.x264-GRP.mkv', on, 'Dr. Strangelove (1964)/Dr. Strangelove (1964) [BOSSx].mkv'],
    ['Friends/Friends Season 1/friends_s01e20_720p_bluray_x264-sujaidr.mkv', on, 'Friends/Season 01/Friends S01E20 [BOSSx].mkv'],
    ['[TorrentCouch.com].Lucifer.S03E02.720p.BRRip.x264.ESubs.mkv', on, 'Lucifer/Season 03/Lucifer S03E02 [BOSSx].mkv'],
    ['LUCIFER - S04 E05 - Expire Erect (720p - AMZN Web-DL).mp4', on, 'Lucifer/Season 04/Lucifer S04E05 - Expire Erect [BOSSx].mp4'],
    ['NCIS.S05E10.Corporal.Punishment.720p.HDTV.x264-GRP.mkv', on, 'NCIS/Season 05/NCIS S05E10 - Corporal Punishment [BOSSx].mkv'],
  ];

  let pass = 0;
  for (const [input, opts, expected] of cases) {
    const ext = path.extname(input);
    const base = path.basename(input, ext);
    const isTV = looksLikeTV(base) || looksLikeTV(input);
    const res = isTV
      ? formatTV(base, ext, input, opts)
      : formatMovie(base, ext, input, opts);
    const got = res ? res.relPath.split(path.sep).join('/') : '(null)';
    const good = got === expected;
    if (good) pass++;
    console.log((good ? green('PASS') : red('FAIL')) + '  ' + input);
    console.log('      got : ' + got);
    if (!good) console.log('      want: ' + yellow(expected));
  }

  // buildRename level checks. Scan root sits ABOVE the library folders, like
  // pointing the tool at a whole drive that holds Movies\ and TV Shows\.
  const root = process.platform === 'win32' ? 'C:\\Media' : '/Media';
  const skipCases = [
    ['Movies/Movie (2020)/Extras/Deleted Scene.mkv', 'movies', null],
    ['TV Shows/The Office/Behind.The.Scenes/blooper reel.mkv', 'both', null],
    ['TV Shows/Show/Specials/Just A Christmas Clip.mkv', 'both', null],
    ['Movies/Inception (2010)/Inception (2010)-trailer.mp4', 'movies', null],
    // already perfect, never listed, never moved out of Movies\
    ['Movies/300 (2006)/300 (2006) [BOSSx].mp4', 'both', null],
    ['TV Shows/Firefly/Season 01/Firefly S01E01 [BOSSx].mkv', 'both', null],
    // real cleanups that must stay under their mother folder
    ['TV Shows/Breaking Bad/Breaking Bad Season 1/Breaking Bad s01e01 720p.BRrip.Sujaidr.mkv', 'both',
      'TV Shows/Breaking Bad/Season 01/Breaking Bad S01E01 [BOSSx].mkv'],
    ['TV Shows/Breaking Bad/Breaking Bad Season 2/Breaking Bad s02ep1 720p brrip.sujaidr.mkv', 'both',
      'TV Shows/Breaking Bad/Season 02/Breaking Bad S02E01 [BOSSx].mkv'],
    ['TV Shows/Adventure Time/Season 1/Adventure Time - S01E01 - Slumber Party Panic.mkv', 'both',
      'TV Shows/Adventure Time/Season 01/Adventure Time S01E01 - Slumber Party Panic [BOSSx].mkv'],
    ['Movies/the.matrix.1999.1080p.BluRay.x264-GRP/the.matrix.1999.1080p.BluRay.x264-GRP.mkv', 'both',
      'Movies/The Matrix (1999)/The Matrix (1999) [BOSSx].mkv'],
    ['Movies/Sicario.2015.720p.BrRip.x264.YIFY.mp4', 'movies',
      'Movies/Sicario (2015)/Sicario (2015) [BOSSx].mp4'],
    // multi-part / stacked movies keep the part number so Jellyfin joins them
    ['Movies/Rocky (1976)/Rocky (1976) CD1.avi', 'movies',
      'Movies/Rocky (1976)/Rocky (1976) - part1 [BOSSx].avi'],
    ['Movies/Rocky (1976)/Rocky (1976) CD2.avi', 'movies',
      'Movies/Rocky (1976)/Rocky (1976) - part2 [BOSSx].avi'],
    ['Movies/Kill.Bill.2003.1080p.BluRay.part1.mkv', 'movies',
      'Movies/Kill Bill (2003)/Kill Bill (2003) - part1 [BOSSx].mkv'],
    ['Movies/The Green Mile (1999) - pt2.mkv', 'movies',
      'Movies/The Green Mile (1999)/The Green Mile (1999) - part2 [BOSSx].mkv'],
    // "Part 1" as a real title (year follows) is not a stacking marker
    ['Movies/Harry Potter and the Deathly Hallows Part 1 (2010)/Harry Potter and the Deathly Hallows Part 1 (2010).mkv', 'movies',
      'Movies/Harry Potter and the Deathly Hallows Part 1 (2010)/Harry Potter and the Deathly Hallows Part 1 (2010) [BOSSx].mkv'],
    // the show's own folder wins over the name in the file
    ['TV Shows/Daredevil/Season 3/Marvels.Daredevil.S03E01.720p.NF.WEB-DL.x265-HETeam.mkv', 'both',
      'TV Shows/Daredevil/Season 03/Daredevil S03E01 [BOSSx].mkv'],
    ['TV Shows/Euphoria/Season 1/Euphoria.US.S01E06.720p.AMZN.WEBRip.x264-GalaxyTV.mkv', 'both',
      'TV Shows/Euphoria/Season 01/Euphoria S01E06 [BOSSx].mkv'],
    // a "Season N" folder is authoritative for the season number
    ['TV Shows/Beavis and Butt-Head/Beavis and Butt-Head Season 1/Beavis and Butt-head S00E01 Frog Baseball.mp4', 'both',
      'TV Shows/Beavis and Butt-Head/Season 01/Beavis and Butt-Head S01E01 - Frog Baseball [BOSSx].mp4'],
    // year in the season folder, plus WS/DSR rip tags
    ['TV Shows/Fantasy Factory/Season 1 (2009)/Rob.Dyrdeks.Fantasy.Factory.S01E01.Blob.Super.Blob.WS.mp4', 'both',
      'TV Shows/Fantasy Factory/Season 01/Fantasy Factory S01E01 - Blob Super Blob [BOSSx].mp4'],
    // per-episode subfolder inside the season
    ['TV Shows/Good Girls/Season 3/Good.Girls.S03E05/Good.Girls.S03E05.WEBRip.x264-ION10.mp4', 'both',
      'TV Shows/Good Girls/Season 03/Good Girls S03E05 [BOSSx].mp4'],
    // parenthesised show name is kept intact
    ['TV Shows/Shameless (US)/Season 8/Shameless (US) (2011) - S08E07 - Occupy Fiona (1080p BluRay x265 afm72).mkv', 'both',
      'TV Shows/Shameless (US)/Season 08/Shameless (US) S08E07 - Occupy Fiona [BOSSx].mkv'],
    // group before the title with a dash
    ['TV Shows/South Park/Season 14/South Park s14e05 uncensored xvid mp3 NIT158 - 200.avi', 'both',
      'TV Shows/South Park/Season 14/South Park S14E05 - 200 [BOSSx].avi'],
    // cartoon short under a TV library, no episode marker -> leave alone
    // absolute numbering: cartoon shorts and anime with no SxxExx
    ['TV Shows/Donald Duck/001 - Donalds Ostrich (1937).mp4', 'both',
      'TV Shows/Donald Duck/Season 01/Donald Duck S01E01 - Donalds Ostrich [BOSSx].mp4'],
    ['TV Shows/Naruto Shippuden/[Anime Time] Naruto Shippuden - 021 - The Curse.mkv', 'both',
      'TV Shows/Naruto Shippuden/Season 01/Naruto Shippuden S01E21 - The Curse [BOSSx].mkv'],
    ['TV Shows/One Piece/Season 03/One Piece - 045 - Meanest Man.mkv', 'both',
      'TV Shows/One Piece/Season 03/One Piece S03E45 - Meanest Man [BOSSx].mkv'],
    ['TV Shows/Cosmos/Cosmos - 1980 - A Personal Voyage.mkv', 'both', null],
  ];
  for (const [rel, mode, expected] of skipCases) {
    const full = path.join(root, rel.split('/').join(path.sep));
    const res = buildRename(full, root, mode, on);
    const got = res ? res.relNew.split(path.sep).join('/') : null;
    const good = got === expected;
    if (good) pass++;
    console.log((good ? green('PASS') : red('FAIL')) + '  ' + rel + '  [' + mode + ']');
    console.log('      got : ' + (got === null ? '(skipped)' : got));
    if (!good) console.log('      want: ' + yellow(expected === null ? '(skipped)' : expected));
  }

  // unifyShowFolders: mixed casing across a batch collapses to one folder.
  const batch = [
    { kind: 'tv', show: 'lucifer',
      relNew: path.join('TV', 'lucifer', 'Season 03', 'lucifer S03E02 [BOSSx].mkv'), newPath: '' },
    { kind: 'tv', show: 'LUCIFER',
      relNew: path.join('TV', 'LUCIFER', 'Season 04', 'LUCIFER S04E05 - Expire Erect [BOSSx].mp4'), newPath: '' },
  ];
  unifyShowFolders(batch);
  const unified = batch.every((b) => b.relNew.split(path.sep).includes('lucifer')) &&
    !batch.some((b) => b.relNew.includes('LUCIFER'));
  if (unified) pass++;
  console.log((unified ? green('PASS') : red('FAIL')) + '  unifyShowFolders collapses lucifer/LUCIFER');
  if (!unified) console.log('      got : ' + batch.map((b) => b.relNew).join('  |  '));

  const total = cases.length + skipCases.length + 1;
  console.log('');
  console.log((pass === total ? green : yellow)(`${pass} / ${total} passed`));
  process.exit(pass === total ? 0 : 1);
}

// ---------------------------------------------------------------------------
function crash(err) {
  restoreTerminal();
  console.error(red('\n  Unexpected error: ' + (err && err.stack ? err.stack : err)));
  process.exit(1);
}

if (require.main !== module) {
  module.exports = {
    walk, buildRename, formatMovie, formatTV, stripJunk, loadConfig,
    parseLog, executeMoves, removeEmptyDirsUp, dedupKey,
  };
} else if (process.argv.includes('--selftest')) {
  selftest();
} else if (process.argv.some((a) => a === '--version' || a === '--about' || a === '-v')) {
  printAbout();
} else if (process.argv.includes('--report')) {
  reportFlag();
} else if (process.argv.includes('--undo')) {
  undoFlow().catch(crash);
} else {
  main().catch(crash);
}
