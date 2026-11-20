<div align="center">

# fix-storage

**See what is filling your disk on macOS or Linux, find the culprit, and clear what is safe to clear, from the terminal.**

[![CI](https://github.com/govijr/fix-storage/actions/workflows/ci.yml/badge.svg)](https://github.com/govijr/fix-storage/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/govijr/fix-storage?color=4ade80)](https://github.com/govijr/fix-storage/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![macOS | Linux](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey)

<img width="3344" height="2160" alt="image" src="https://github.com/user-attachments/assets/bbd9ade2-e996-4e2f-9979-ff73b57738f1" />

</div>

```bash
curl -fsSL https://raw.githubusercontent.com/govijr/fix-storage/main/install.sh | sh
```

---

## Why

"System Data: 86 GB" and a full disk warning don't tell you what to do. fix-storage measures your disk the way Finder's Storage panel does, then goes further:

- **Finds the culprit.** Under every big folder it prints where the space actually is, following the biggest subfolder down: `└ mostly in app/node_modules/  31.2 GB · 77%  junk`. Press `g` to jump straight there.
- **Labels everything.** Each item is tagged `junk`, `unused`, `system` or left as yours, with a one-line reason: *rebuilds with npm install · not touched in 7 months*, *installer · not needed once installed*, *screen capture from 3 weeks ago*.
- **Shows when you last used it.** Last-opened dates come from Spotlight (on Linux, from file access times), so an app you haven't opened in two years stands out.
- **Every drive, dual boot included (Linux).** Each mounted drive gets its own scan; a Windows partition or another Linux install is shown look only, with labels that say what to do about it from that system.
- **Clears safely.** Caches and the Trash are cleared for good; everything else goes to the Trash so you can get it back. Nothing is removed without a second keypress.
- **Feels like a terminal tool.** One monospace font, keyboard first, mouse optional, with a live dot-matrix disk meter drawn in real pixels.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/govijr/fix-storage/main/install.sh | sh
```

The installer puts the app in `~/.fix-storage` and links the `fix-storage` command into `~/.local/bin`. It needs no `sudo`.

**Requirements**

- macOS (Apple silicon or Intel), or Linux (x86_64 or arm64)
- Node.js 20.11 or newer (`brew install node`, or your distribution's `nodejs` and `npm` packages)
- On Linux: `unzip`, used once to unpack the graphics runtime. The runtime is Electron-based, so it needs the libraries any desktop already has; on a bare server use `--plain`.
- For the graphical view: a terminal with the kitty graphics protocol, such as [Ghostty](https://ghostty.org), [kitty](https://sw.kovidgoyal.net/kitty/), [WezTerm](https://wezfurlong.org/wezterm/) or iTerm2. Other terminals get a character-only view.

<details>
<summary>Other install options</summary>

```bash
# A specific version
curl -fsSL https://raw.githubusercontent.com/govijr/fix-storage/main/install.sh | sh -s -- --version 0.2.0

# Somewhere else
curl -fsSL https://raw.githubusercontent.com/govijr/fix-storage/main/install.sh | FIX_STORAGE_HOME=~/apps/fix-storage FIX_STORAGE_BIN=~/bin sh

# From source
git clone https://github.com/govijr/fix-storage && cd fix-storage
npm install && npm start
# On Linux, if npm install fails with EXDEV (a tmpfs /tmp):
mkdir -p .tmp && TMPDIR=$PWD/.tmp npm install
```

</details>

## Usage

```bash
fix-storage              # scan your disk and open the interactive view
fix-storage --dry-run    # same, but deleting only pretends
fix-storage --demo       # a made-up disk, to try the interface; reads and deletes nothing
fix-storage --plain      # print a text summary and exit
fix-storage --json       # print the summary as JSON and exit

# Linux
fix-storage --drives             # list mounted drives, and partitions that are not mounted
fix-storage --drive /mnt/games   # start on a drive: its number, name, label, device or any path on it
fix-storage --plain --drive 2    # text summary of the second drive
```

> [!TIP]
> On macOS, give your terminal **Full Disk Access** (System Settings → Privacy & Security → Full Disk Access) so the scan can read Mail, Messages, Safari and other protected folders. Without it, those folders are counted under *System data*.
>
> On Linux, run it as yourself, not with `sudo`. Folders only root can read (Docker's images, `/root`) are counted under *System data*.

### Keys

| Key | In the category list | In a folder |
| --- | --- | --- |
| `↑` `↓` / `j` `k` | pick a category | move |
| `→` / `Enter` | look inside | open the folder |
| `←` / `Esc` | | go up a level |
| `g` | | jump to the culprit |
| `f` | show only junk and unused | show only junk and unused |
| `o` / `Space` | | reveal in Finder, or in the file manager on Linux |
| `⌫` / `d` | | move to Trash, or delete for caches and Trash (press twice) |
| `c` | clear all caches / empty the Trash (press twice) | |
| `v` / `1`–`9` | next drive / that drive (Linux) | next drive / that drive (Linux) |
| `Tab` | switch panes | switch panes |
| `r` / `q` | rescan / quit | rescan / quit |

Everything is clickable too: categories, the disk meter, rows, the breadcrumb, the drive names and every action.

## Linux, drives and dual boot

On Linux, fix-storage reads the mount table and treats each filesystem as one drive, however many times it is mounted. A bind-mounted `/home` or a set of btrfs subvolumes is measured once, and a drive mounted inside a folder of another (say `~/games`) counts only on its own drive. The drive holding your home folder opens first; `v` cycles through the rest.

| Drive | What you see | Can it remove things? |
| --- | --- | --- |
| Your home and system drives | The usual categories, mapped to Linux: Flatpak, Snap, `/opt`, `~/.local/share` and `~/.config` under Apps; your XDG folders under Photos, Videos, Music and Documents; `~/.cache` under Caches; the freedesktop.org trash. System data lists `/usr`, package caches, the journal, crash dumps and swap, each labelled with the command that shrinks it, like `sudo paccache -rk1` or `sudo journalctl --vacuum-size=500M`. | Yes, the same rules as on macOS. |
| Other drives | Everything on the drive, sorted into Photos, Videos, Music and Apps (Steam libraries) by folder name, the rest under Documents. Active swap files count as System data. | Yes. Moved items go to that drive's own `.Trash-$UID`, like a file manager does. |
| A Windows partition | Windows, `Program Files`, each user's `AppData`, `Downloads` and so on, with labels for `hiberfil.sys`, `pagefile.sys`, `WinSxS`, `Windows.old` and Windows Update downloads. | No, look only. Clean it up from Windows. |
| Another Linux install, or a boot/EFI partition | What is on it. | No, look only. |

Partitions that are not mounted, such as the Windows side of a dual boot, are listed by `fix-storage --drives` with the command that mounts them read-only (`udisksctl mount -b /dev/… -o ro`). If an NTFS partition comes up read-only, Windows is probably hibernated by Fast Startup; shut Windows down fully before writing to it from Linux.

## How it decides

### Labels

| Label | Meaning | Examples |
| --- | --- | --- |
| `junk` | Rebuilds by itself or is a leftover. Removing it loses nothing. | `node_modules`, `.next`, `__pycache__`, Pods, Xcode DerivedData, iOS DeviceSupport, `.dmg`/`.pkg`/`.deb`/`.rpm` installers, Steam shader caches, caches, the Trash |
| `unused` | Probably not needed, but your call. | build output, `.venv`, old simulators, Xcode archives, iPhone backups, archives in Downloads, screen recordings older than two weeks, anything not opened in a year |
| `system` | A tool manages it; removing it by hand breaks the tool. The reason says which command to use instead. | Docker's disk image, Ollama models, Homebrew, Flatpak, Snap, packages under `/usr` and `/opt` |
| *(none)* | Yours and in use. | everything else |

The rules live in [`src/core/classify.ts`](src/core/classify.ts). They are deliberately conservative; pull requests with new patterns are very welcome.

### Culprits

For a folder, fix-storage runs one `du` pass over it, then follows the biggest child down for as long as that child holds more than half of its parent. It stops at things that are one unit to you, like `node_modules`, `.app` bundles or a Photos library, and ends at a single file if one file is most of the folder. When no one thing dominates, it shows the three biggest instead. Sizes measured along the way are reused, so opening those folders afterwards is instant.

### What it will and won't remove

- **Caches and Trash** items are deleted for good. Apps rebuild caches when they need them.
- **Everything else** is moved to the Trash (with macOS's own `trash` command, or Finder on older systems; on Linux, the freedesktop.org trash your file manager uses), so you can drag it back out. The space comes back once you empty the Trash.
- **Never removed:** System data, anything under `/System` or `/private`, your Keychains, Preferences, Mail, Messages, Photos and Safari data, the top-level folders the scan measures, and anything outside them.
- **Never removed on Linux:** anything under `/usr`, `/etc`, `/var`, `/opt`, `/boot` and the other system folders, Flatpak's own folders, active swap files, `~/.ssh`, `~/.gnupg`, your keyrings and browser profiles, and anything on a Windows partition, another Linux install or a boot partition.
- `--dry-run` and `--demo` never touch the disk.

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/govijr/fix-storage/main/install.sh | sh -s -- --uninstall
```

## Development

```bash
git clone https://github.com/govijr/fix-storage && cd fix-storage
npm install
npm run demo        # build and open the demo disk
npm run typecheck
```

The interface is React rendered by [pixel](https://www.npmjs.com/package/@zenbu-labs/pixel), which draws real pixels into terminals that support the kitty graphics protocol.

```
src/
  main.tsx          entry point and key handling
  plain.ts          --plain / --json / --drives output
  core/
    scan.ts         measures a drive with du
    categories.ts   the categories, and which folders count toward them on macOS
    layout.ts       which folders count toward which category on each Linux drive
    drives.ts       mounted drives and unmounted partitions (Linux)
    platform.ts     the few things that differ between macOS and Linux
    classify.ts     junk / unused / system labels and their reasons
    browse.ts       folder listing, culprits, last-used dates, reveal, trash
    trash.ts        the freedesktop.org trash (Linux)
    clean.ts        clearing a whole category
    demo.ts         the made-up demo disks
  ui/
    app.tsx         the interface
    bar.ts          the dot-matrix disk meter
    store.ts        app state and actions
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes and cut a release.

## License

[MIT](LICENSE)
