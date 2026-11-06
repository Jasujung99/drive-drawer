# Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Could not read the Drive list (403 …)" | The Drive service is off in the project | Paste `template/appsscript.json` again (it turns the service on), or Services **+** → Drive API v3 → Add |
| The editor or the web app will not open, or opens the wrong account | Several Google accounts are signed in | Use a window with only this account signed in |
| "Google hasn't verified this app" | A script the user made | Advanced → Go to … → Allow. It is expected |
| The setup screen comes back | `DRAWER_FOLDER_ID` is empty | Choose the folder again; check Project Settings → Script properties |
| "Could not open that folder" | Wrong address, or this account cannot open it | Paste the address of the folder itself, from its own page in Drive |
| Files edited on the computer do not show | Google Drive for desktop has not synced yet | Wait a few minutes, then refresh |
| The address changed after an update | "New deployment" was used instead of a new version | Use Manage deployments → edit → New version. Give the user the new address if one was already made |
| A conversation has no "Open in …" link | `chat_url` does not match the service's `url` pattern | Fix `chat_url`, or the `url` in `DRAWER_SERVICES` |
| A picture says it is not in the drawer folder | The file is not next to the `.md`, or its name differs from `assets` | Put it in the same folder with exactly that name |
| HEIC pictures do not show | Browser support | Open in Drive, or keep a JPEG copy next to it |
| "Nothing was moved: this file is outside the drawer" | A listed file sits outside the drawer's folders | Move the file into the conversation's folder, or remove it from `assets` |
| Memos from another device are gone | The last save wins | Edit memos on one device at a time |
| The first open is slow | Every `.md` is read once | Normal for large drawers; later opens use the cache |
| A group is missing | Its folder is absent, empty, or not in the service list | Check the folder name and `DRAWER_SERVICES` |

If a fix needs code changes, change only what the user agreed, tell them which file changed, and redeploy as a new version.
