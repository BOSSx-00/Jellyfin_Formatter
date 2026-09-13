# BOSSx - Jellyfin Formatter

A toolkit for getting a movie and TV library into [Jellyfin](https://jellyfin.org)
shape. It renames messy filenames (movies, TV shows and subtitles) to
Jellyfin standards, gives stray files a folder, finds duplicates and missing
subtitles, writes custom season/movie metadata, and can undo any run.
Nothing changes until you review the list and confirm.

```
Movie Name (Year)/Movie Name (Year) [BOSSx].ext
Show Name/Season 01/Show Name S01E01 - Episode Name [BOSSx].ext
```

> Beta. Look over the preview before you confirm. Some files may still need a
> manual touch-up.

## Setup

You need [Node.js](https://nodejs.org), version 16 or newer. That is the only
requirement. No `npm install`, no build step.

Grab `BOSSx_Jellyfin_Formatter.js` (green **Code** button then **Download ZIP**,
or save the raw file), then run it from a terminal in that folder:

```bash
node BOSSx_Jellyfin_Formatter.js
```

Run it again the same way any time.

## Using it

The first menu:

- **Rename Movies / Rename TV Shows / Rename Movies & TV Shows**. Point it at
  your media folder, choose which tags to add back, then review the list of
  renames. Nothing changes until you confirm. Every run is written to
  `rename-log.txt`. The highlighted option's own description shows above the
  key hints at the bottom, so you don't need to remember what each one does.
- **Rename Subtitles**. Finds subtitle files (`.srt`, `.ass`, `.ssa`, `.vtt`,
  `.sub`/`.idx`, `.sup`, `.smi`, `.ttml`) and renames each to match the video
  it sits with, so Jellyfin pairs them up correctly. A language, forced or
  SDH tag already in the name (`English`, `en`, `forced`, `HI`, ...) is kept
  and normalized (`.en.forced.srt`, `.en.sdh.srt`). A subtitle with no video
  in its folder is still cleaned up on its own and flagged as unmatched in
  the review, in case it needs a closer look by hand.
- **Folderize Stray Files**. Finds video files sitting loose with no folder
  and wraps each one: `moviefile.ext` becomes
  `Movie Name (Year)/Movie Name (Year) [BOSSx].ext`.
- **Find Duplicates**. Groups files that look like the same movie or episode
  and shows each with its resolution, date and size. Check the copies you want
  gone, then move them to a `_Duplicates` folder or delete them (Recycle Bin on
  Windows). It confirms before either.
- **Missing Subtitles**. Lists every movie or episode with no subtitle: no
  external file next to it, and for `.mkv`, no subtitle track muxed inside
  the file either (read straight from the file, no external tool needed).
  Read only, can save the list to a text file.
- **Create season.nfo**. Writes a small `season.nfo` into a season folder so
  Jellyfin shows a custom season name (like "Saiyan Saga"). It does not rename
  the folder.
- **Create movie.nfo**. Writes a `movie.nfo` into a movie folder (title, year,
  plot, genres, content rating, IMDb/TMDb ID) so Jellyfin reads it before
  checking online, the fastest way to fix a wrong match. Everything but the
  title is optional. It does not rename the folder or the file.
- **Undo Changes**. Reverses a past rename run (movies, TV or subtitles), or a
  "Find Duplicates" run where you moved copies to a `_Duplicates` folder.
  Also `--undo`.

`node BOSSx_Jellyfin_Formatter.js --version` prints the version and exits.

## Notes

- Renaming movies/TV only ever touches video files, and Rename Subtitles only
  ever touches subtitle files. `.nfo` files, posters and artwork are never
  scanned, moved or changed by anything in the tool.
- A subtitle already sitting next to its video and sharing its name follows
  automatically whenever that video gets renamed, no need to also run Rename
  Subtitles. That mode is for a subtitle that does not already match: dropped
  in later with its own messy download name, or orphaned by a video that has
  since been renamed again.
- Files never leave their `Movies` or `TV Shows` folder, so you can point the
  tool at a whole drive.
- Always stripped: resolution, source, codec, audio, HDR, bit depth, subtitle
  and streaming flags, release groups.
- Multi episode files become a range, `S01E01-E02`. A `Season N` folder sets the
  season number even if the file name disagrees.
- Multi part movies (`CD1` / `CD2`, `part1` / `part2`) keep their part number and
  share one folder, so Jellyfin plays them as a single movie.
- Bonus content is left alone (`Extras`, `Specials`, `-trailer` files and the like).
- A file that another program has open (still seeding in a torrent client, playing
  in a media player, mid virus scan) can fail to rename. The tool retries a few
  times for a brief lock, then skips the file and moves on if it is still busy.
  Stop seeding it or close whatever has it open, then run the tool again over
  that folder.
- Your default path and tag choices are saved in `config.json` next to the script.
- Check the naming logic without touching files: `node BOSSx_Jellyfin_Formatter.js --selftest`.

---

[Discord](https://discord.gg/G5wVgJFxQQ) &nbsp;·&nbsp; [More Tools](https://BOSSx.ca)
