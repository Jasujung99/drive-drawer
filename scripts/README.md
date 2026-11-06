# build_preview.py

Builds a local preview of Drive Drawer from a folder on this computer, so the drawer can be checked before anything is installed in Google. It needs only Python 3.8 or newer (standard library), uses no network, reads only the folder you name and `template/`, and writes only the file you name with `--out` (it refuses to overwrite).

## Commands

```bash
# The fictional sample drawer, in English
python build_preview.py --drawer ../examples/sample-drive --out preview.html

# The user's own drawer folder, synced by Google Drive for desktop, in Korean
python build_preview.py --drawer "<synced drawer folder>" --out drawer-preview.html --lang ko --owner "Sam"

# The first-visit setup screen
python build_preview.py --out setup-preview.html --setup

# The self-test page
python build_preview.py --selftest --out selftest.html
```

Open the written file in a browser. In the preview, the real `Code.gs` conversion and `Index.html` run in the page, and the calls to Google are replaced by an in-memory stand-in: moving to the trash, restoring, memos, and settings work, but nothing is saved.

| Option | Meaning |
| --- | --- |
| `--drawer` | the drawer folder (default: `examples/sample-drive`) |
| `--out` | the HTML file to write; must not exist yet |
| `--lang` | `en` (default) or `ko` |
| `--title`, `--owner` | page title and your name, as on the setup screen |
| `--services` | a JSON list like `DRAWER_SERVICES` |
| `--setup` | open on the first-visit setup screen |
| `--no-badge` | leave out the "Local preview" label, for screenshots |
| `--selftest` | write the self-test page instead of a preview |

## The self-test

`selftest.html` runs `Code.gs` against a fake Drive and prints `SELFTEST passed/total` with one line per check:

- paging past 1,000 files in a folder;
- moving files to the trash in batches, checking every file before any moves, and refusing files outside the drawer or more than 500 at once;
- recognising folder links, saving settings, and falling back to the default service list;
- dates in both languages, AI Chat Archive frontmatter with files, grouping of writing, conversations, files, and trash.

## Privacy

A preview of a real folder contains that folder's text and pictures inside one HTML file. Keep it private, don't send it to anyone or upload it, and delete it when you are done. Pictures over 8 MB are left out of the preview.
