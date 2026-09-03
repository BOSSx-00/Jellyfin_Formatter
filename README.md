# BOSSx - Jellyfin Formatter

A toolkit for getting a movie and TV library into [Jellyfin](https://jellyfin.org)
shape. It renames messy filenames to Jellyfin standards, gives stray files a
folder, finds duplicates, writes custom season names, and can undo any run.
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

- **Rename Movies / Rename TV Shows / Rename Both**. Point it at your media
  folder, choose which tags to add back, then review the list of renames.
  Nothing changes until you confirm. Every run is written to `rename-log.txt`.
- **Put stray files in folders**. Finds video files sitting loose with no
  folder and wraps each one: `moviefile.ext` becomes
  `Movie Name (Year)/Movie Name (Year) [BOSSx].ext`.
- **Find duplicates**. Groups files that look like the same movie or episode
  and shows each with its resolution, date and size. Check the copies you want
  gone, then move them to a `_Duplicates` folder or delete them (Recycle Bin on
  Windows). It confirms before either.
- **Create season.nfo**. Writes a small `season.nfo` into a season folder so
  Jellyfin shows a custom season name (like "Saiyan Saga"). It does not rename
  the folder.
- **Undo a previous run**. Reverses a past rename run, or a "Find duplicates"
  run where you moved copies to a `_Duplicates` folder. Also `--undo`.

`node BOSSx_Jellyfin_Formatter.js --version` prints the version and exits.

## Notes

- Only video files are ever touched. `.nfo` files, posters, artwork and
  subtitles are never scanned, moved or changed.
- Files never leave their `Movies` or `TV Shows` folder, so you can point the
  tool at a whole drive.
- Always stripped: resolution, source, codec, audio, HDR, bit depth, subtitle
  and streaming flags, release groups.
- Multi episode files become a range, `S01E01-E02`. A `Season N` folder sets the
  season number even if the file name disagrees.
- Multi part movies (`CD1` / `CD2`, `part1` / `part2`) keep their part number and
  share one folder, so Jellyfin plays them as a single movie.
- Bonus content is left alone (`Extras`, `Specials`, `-trailer` files and the like).
- Your default path and tag choices are saved in `config.json` next to the script.
- Check the naming logic without touching files: `node BOSSx_Jellyfin_Formatter.js --selftest`.

---

[Discord](https://discord.gg/G5wVgJFxQQ) &nbsp;·&nbsp; [More Tools](https://BOSSx.ca)
