# Settings

All settings are script properties (Apps Script editor → Project Settings → Script properties). The setup screen writes the folder, title, name, language, and time zone; edit the service list there by hand. Changes apply the next time the page opens, with no redeploy.

| Property | Meaning | Default |
| --- | --- | --- |
| `DRAWER_FOLDER_ID` | the drawer folder | none: the setup screen asks for it |
| `DRAWER_TITLE` | page title and the name at the top left | Drawer (서랍 in Korean) |
| `DRAWER_OWNER` | your name: writing by this author, or with no author, shows as yours | empty |
| `DRAWER_LANG` | `en` or `ko` | `en` |
| `DRAWER_TIME_ZONE` | time zone for "Updated", such as `Europe/Berlin` | the browser's at setup, otherwise the project's |
| `DRAWER_SERVICES` | conversation folders, as JSON | ChatGPT, Claude, Gemini, Grok |

## Services

`DRAWER_SERVICES` replaces the default list, so include the defaults you still want. Paste the JSON on one line in the property editor.

```json
[
  {"folder": "chatgpt", "label": "ChatGPT", "url": "^https://(chatgpt\\.com|chat\\.openai\\.com)/"},
  {"folder": "chatgpt-business", "label": "ChatGPT Business", "url": "^https://chatgpt\\.com/"},
  {"folder": "claude", "label": "Claude", "url": "^https://claude\\.ai/"},
  {"folder": "perplexity", "label": "Perplexity", "url": "^https://(www\\.)?perplexity\\.ai/"}
]
```

- `folder`: lowercase letters, digits, and hyphens, and not `texts`. It is the folder name inside the drawer folder.
- `label`: the group name, and the name writing uses in `source` when it was kept from that service.
- `url`: optional regular expression. "Open in …" links appear only for chat addresses that match; without it, any `https` address is linked.
- Invalid JSON, or a list with no valid entry, falls back to the default list.

## Language

English or Korean for every label, set on the setup screen or in `DRAWER_LANG`. The writing itself can be in any language; each file says its own `lang`.

## Limits

- Up to 50,000 files per folder, read 1,000 at a time.
- Every `.md` is read when the page opens, so a very large drawer opens more slowly. Apps Script stops a call after 6 minutes, which is the outer limit.
- Files are cached for 6 hours and read again when they change. Files over 95,000 bytes are read every time.
- One "Move to trash" handles up to 500 files.
