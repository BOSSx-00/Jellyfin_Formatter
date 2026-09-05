# Changelog

Everything is beta until it has real mileage. From 1.1.0 on this follows
semantic versioning: a new feature bumps the minor number, a fix bumps the
patch number. The `1.0.x` entries below were the initial build-out, where every
change was a patch bump.

## 1.10.2-beta

- If a file is still locked after the retries in 1.10.1, the error now says so
  in plain terms: pause any torrent seeding it and close any media player or
  app that has it open, then run the tool again.

## 1.10.1-beta

- A file that is briefly locked by something else (Jellyfin scanning the
  library, a player with it open, a virus scanner, a cloud sync client) used
  to fail the rename right away with an `EBUSY` / `EPERM` error. It now
  retries a few times with a short pause before giving up, since most locks
  like that clear on their own in under a second. If it still fails, it is
  skipped and logged exactly as before, and the rest of the batch keeps going.

## 1.10.0-beta

- Multi-part (stacked) movies are kept together. A file that ends in `CD1`,
  `Disc 2`, `DVD1`, `part1` or `pt2` now becomes
  `Movie (Year)/Movie (Year) - part1 [BOSSx].ext`, so both halves share one
  folder and Jellyfin plays them as a single movie instead of the second file
  colliding with the first. The marker has to be the last thing in the name, so
  a real title like `Deathly Hallows Part 1 (2010)` is left alone.

## 1.9.0-beta

- Undo now also covers "Find duplicates" runs where you moved copies into a
  `_Duplicates` folder. Pick the run (marked "duplicates move" in the list) and
  the files go back where they were, same review-and-confirm flow as a rename
  undo. Files you sent to the Recycle Bin or deleted are not listed, since those
  are recovered from the bin, not from here.

## 1.8.0-beta

- Handles absolute episode numbering for cartoons and anime. A file with no
  `SxxExx` but a plain number (`001 - Donald's Ostrich`,
  `[Anime Time] Naruto - 021`, `Gunsmoke 112 Magnus`) is now recognised as an
  episode when it sits under a TV library or its own show folder, and becomes
  `Show/Season NN/Show SNNEnnn - Title`. It only kicks in in a clear TV context,
  so a bare number in a movie name is still left alone, and a four digit year
  (`Cosmos - 1980 - ...`) is not mistaken for an episode.

## 1.7.0-beta

- Before the review list, the tool now warns if any files would end up with the
  same name (only the first would rename, the rest are skipped) or if any path
  is over 260 characters. The affected rows are marked with a red `!` in the
  list so you can uncheck or fix them.

## 1.6.0-beta

- New `--report <file>` flag. Scans and writes the full proposed plan (every
  rename, the tag-only ones, plus a warnings section for name collisions and
  over-260-character paths) to a text file, then exits. Touches nothing and
  needs no interactive terminal. Optional `--path <folder>` and `--movies` /
  `--tv`; without `--path` it uses the saved default path.

## 1.5.0-beta

- Subtitle and per-file `.nfo` files now follow their video. When a video is
  renamed, any file next to it that shares its name plus an optional language or
  "forced" suffix (`Movie.mkv` -> `Movie.srt`, `Movie.en.srt`,
  `Movie.forced.eng.ass`, `Movie.idx` / `Movie.sub`, `Movie.nfo`) is renamed
  and moved along with it so Jellyfin keeps matching them.

## 1.4.2-beta

- Renamed **Scan Movies / TV Shows / Both** to **Rename Movies / TV Shows /
  Both**, since the tool now does more than scanning.
- Refreshed the intro, header comment and `--version` text to describe the whole
  toolkit, not just renaming.

## 1.4.1-beta

- Renamed the "Directory Setup" menu option to "Put stray files in folders".

## 1.4.0-beta

- Find duplicates now asks what to do with the files you check: **move them to a
  _Duplicates folder** or **delete them**. Either way it re-shows the list and
  asks a second time ("Are you sure you want to move / delete the
  duplicate(s)?") before doing anything.
- Move prints the path to the _Duplicates folder afterward.
- Delete sends files to the **Recycle Bin** on Windows (recoverable). On other
  systems it warns that deletion is permanent and asks once more before doing
  it. Every move and delete is written to `rename-log.txt`.

## 1.3.0-beta

- For movies, a tidy `Title (Year)` folder is now the source of truth. The file
  is made to match the folder, not the other way around, so `Fanboys (2009)`
  keeps its year even if the file says `(2008)`, and `Dr. No (1962)` keeps its
  period.
- A `[BOSSx]` or `[1080p ...]` tag group already on the source name is removed
  before the tool re-adds its own, so names no longer end up with `[BOSSx]`
  twice.
- New menu option **Directory Setup**. It finds video files that are sitting
  loose with no folder of their own and wraps each one in the right folder
  (`moviefile.ext` becomes `Movie Name (Year)/Movie Name (Year) [BOSSx].ext`).
  Same review-and-confirm flow as the scanners.

## 1.2.0-beta

- New menu option **Find duplicates**. Scans a folder, groups files that look
  like the same movie or episode, and lists each one with its resolution (if the
  name has it), the date the file was made, and its size. Check the copies you
  want out of the way and they are moved into a `_Duplicates` folder at the scan
  root. Nothing is renamed and nothing is deleted.
- `--version` (also `--about`, `-v`) prints the title, version and links, then
  exits. Works without an interactive terminal.

## 1.1.1-beta

- The Create season.nfo folder-path prompt re-asks on a missing or invalid path
  instead of quitting the tool, matching the name and number prompts.

## 1.1.0-beta

- New menu option **Create season.nfo**. Point it at a season folder, give it a
  name and a season number, and it writes a `season.nfo` so Jellyfin shows that
  name. The folder itself is never renamed. Includes a **Hide File** option (on
  by default) that sets the Windows hidden attribute so the file stays out of
  the way, the name and number are echoed back after it is written, and the
  prompts re-ask on a blank answer instead of quitting.
- Made explicit that `.nfo` files, posters, artwork and subtitles are never
  scanned, renamed, moved or deleted. Only video files are ever touched.
- Removes named release and anime fansub groups wherever they appear, bracketed
  or not: `[RUBaDUB]`, `[Anime Time]`, `[SubsPlease]`, `[Erai-raws]`,
  `[HorribleSubs]`, `[Judas]`, `[EMBER]`, `[ASW]` and more.

## 1.0.17-beta

Findings from a dry run over a full ~8,000 file drive.

- A "Season N" folder is authoritative for the season number. A file named
  `S01E01` sitting in a `Season 02` folder is corrected to `S02E01`.
- The show's own folder wins over the name in the file, so a `Daredevil` folder
  full of `Marvels.Daredevil.SxxExx` files is kept as `Daredevil` instead of
  spawning a second `Marvels Daredevil` folder.
- Cartoon shorts and other non episode files under a `TV Shows` library are left
  alone instead of being turned into movie folders.
- Season folders with a year (`Season 1 (2009)`) or a subtitle
  (`Season 1 - Saiyan Saga`), and per episode subfolders
  (`Show/Season 3/Show.S03E05/file`), are handled.
- Reads the `s02ep1` / `S01EP01` episode form.
- More junk removed: streaming tags (AMZN, NF, DSNP, HULU and friends), file
  size tags (`450MB`), old rip tags (`WS`, `DSR`, `PDTV`, `HR`), container names
  used as tags (`avi`, `mkv`), site suffixes (`.com`), `UNCENSORED`, and release
  groups that sit before the title (`NIT158 - Real Title`).
- Fixed a bug where a tag like `TS` could be stripped from inside a word such as
  "Tsst", and one where a closing parenthesis was trimmed off titles like
  `The Beginning (1)` and `Shameless (US)`.
- A stray second video extension (`Movie [YIFY].mkv.mkv`) no longer leaks into
  the name.
- Numbered and season-prefixed extras folders (`Extras1`, `Bonanza S01 Extras2`)
  are recognised as bonus content.
- System folders (`$RECYCLE.BIN`, `System Volume Information`) are skipped.

## 1.0.16-beta

- Files are never moved out of their mother library folder. You can point the
  tool at a whole drive or any folder that holds `Movies` and `TV Shows`, and
  each file stays under its own library folder. Scanning a whole drive of
  thousands of files takes about a second.
- Handles an extra per episode folder, e.g. `Show/Season 3/Show.S03E05/file`.
- Season folders are read whether bare (`Season 1`) or show prefixed
  (`Show Name Season 1`).
- Reads the `S01EP01` / `s02ep1` episode style.
- Strips a dot or space separated release group, not just `-GROUP`
  (`... 720p.BRrip.Sujaidr` becomes clean).
- Home screen explains scan scope and suggests chunking a big library.

## 1.0.15-beta

- `titleCase` no longer re-cases a word that is already properly capitalised, so
  a tidy library like `Children Of The Corn` is left alone instead of being
  "corrected" to `Children of the Corn`. Only all lower or SHOUTING words change.
- System folders (`$RECYCLE.BIN`, `System Volume Information`, dotfiles) are
  skipped while scanning.

## 1.0.14-beta

- Files that are already named right are kept out of the list entirely, even
  when they sit under an extra parent folder like `Movies` or `TV Shows`. If the
  file name and its folder already match what the tool would produce, there is
  nothing to review.

## 1.0.13-beta

- Reworked the keyboard hint row: `↑/↓ = MOVE     │     Enter = SELECT     │
  Ctrl+C = EXIT`.

## 1.0.12-beta

- Corrected the spelling to "Jellyfin" (lowercase f) everywhere: the script is
  now `BOSSx_Jellyfin_Formatter.js`, run it with `node BOSSx_Jellyfin_Formatter.js`.
- Updated the title art so the wordmark reads "Jellyfin".

## 1.0.11-beta

- All caps show names are no longer left shouting. `LUCIFER` becomes `Lucifer`,
  while short acronyms like `NCIS`, `CSI` and `US` are kept as is.
- Added a pass that makes every episode of one show use a single folder, even
  when the source files spell the show with different casing. The name at the
  front of each file is kept in sync with that folder.
- `S04 E05` style spacing between the season and episode token is now read
  correctly as `S04E05`.

## 1.0.10-beta

- Home screen now carries a beta notice.
- The plain line divider under the title art is replaced by the version number
  in dark grey.
- Cleaned up the keyboard hint rows so they read as one tidy line.

## 1.0.9-beta

- Underscores are treated as separators everywhere, so names like
  `friends_s01e20_720p_bluray_x264-sujaidr` parse correctly and the release
  group is removed.
- Subtitle flags are stripped: `ESubs`, `MSubs`, `HC-Subs`, `Forced Subs`,
  `Subbed`, `Subtitles`. Bare singular `Sub` is left alone so it does not eat
  real words like Submarine.

## 1.0.8-beta

- Honorifics keep their trailing period. `Mr.Griffin` and `Mr. Griffin` both
  become `Mr. Griffin`. Covers Mr, Mrs, Ms, Dr, Prof, Jr, Sr, St and more.

## 1.0.7-beta

- Files inside `Extras`, `Featurettes`, `Behind the Scenes`, `Deleted Scenes`,
  `Trailers`, `Samples` and similar folders, or ending in `-trailer` or
  `-sample`, are left untouched so Jellyfin still reads them as bonus content.
- A file in a `Specials` folder is treated as season 0 when it has an `S00E01`
  style marker, and skipped when it does not.

## 1.0.6-beta

- Strip bit depth tags: `10bit`, `10 bit`, `10-bit`, `Hi10P` and similar.

## 1.0.5-beta

- Multi episode files are kept as a range. `S02E13+E14`, `S02E13-E14`,
  `S02E13E14` and `2x13-2x14` all become `Show Name S02E13-E14 - Episode Name`.

## 1.0.4-beta

- The review step can now hide files that are already named correctly and would
  only get the tag bracket added, so the list shows only files that need work.

## 1.0.3-beta

- The title art is drawn in three pieces. "BOSSx" and "Formatter" are solid red
  (`#a20000`), "Jellyfin" keeps the left to right gradient (`#AA5CC3` to
  `#00A4DC`).

## 1.0.2-beta

- The title art is colored. "BOSSx" solid red, "Jellyfin Formatter" with a
  purple to blue gradient. Uses 24 bit ANSI color.

## 1.0.1-beta

- Added Undo. Pick "Undo a previous run" from the first menu or start with
  `--undo`. It reads `rename-log.txt`, lets you pick a past run, shows the same
  review screen in reverse, and moves the files back. Folders left empty by the
  move are cleared. The undo is written to the log as its own entry.

## 1.0.0-beta

- First release. Scan Movies, TV Shows or Both. Save a default path. Toggle
  which tags to re add. Strip scene junk. Format to Jellyfin naming. Review
  every rename before it runs. Log every run to `rename-log.txt`.
- Zero dependencies, single file, MIT licensed.
