---
name: drive-drawer
description: Set up and look after Drive Drawer, a private one-page reader for a Google Drive folder of Markdown writing and AI chat archives (ChatGPT, Claude, Gemini, Grok), running as the user's own Google Apps Script web app that only they can open. Use whenever the user wants to read their notes or chat archive on a phone or desktop straight from Google Drive, install or update the drawer web app, change its folder, title, language or services, fix a drawer error, or write .md files the drawer shows, even if they never say "Drive Drawer", for example "make my AI chat archive readable on my phone", "set up a private reading page for my Drive folder", "update my drawer to the new version", "서랍 만들어 줘", "드라이브 서랍 설치해 줘", or "아카이브를 휴대폰에서 보고 싶어".
metadata:
  version: "1.0.1"
---

# Drive Drawer

Drive Drawer turns one Google Drive folder into a private page with search, a list of writing and conversations, a reading pane, a calendar, sticky memos, and a trash with restore. It runs as the user's own Apps Script web app ("Execute as: Me", "Who has access: Only myself"), so the pages are served by Google to the owner alone and pass through no other server.

Tell the user what it touches before installing:

- **Reads:** `texts/` and the conversation folders (`chatgpt/`, `claude/`, `gemini/`, `grok/` by default) inside the drawer folder.
- **Changes:** moves files in those folders to the Drive trash and back when the user presses the button, and writes one file, `_memos.json`, in the drawer folder. Nothing else is edited, and nothing is deleted for good; Google empties the trash after 30 days.
- **Asks Google for:** Drive access (needed to move files to the trash and save memos) and external requests (to read Drive in parallel).
- **Network:** the web app calls only the Google Drive API (`https://www.googleapis.com/drive/v3/files` and `https://www.googleapis.com/upload/drive/v3/files`), from the user's own Apps Script account, to list and read the drawer's files, move them to the trash and back, and save `_memos.json`. The page loads one font from Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`). Links to Drive files and to chats open only when the user selects them. The agent's steps and `scripts/build_preview.py` use no network, and the addresses inside `examples/` are sample text that is never fetched.

## Ground rules

1. **The user's account, the user's clicks.** Signing in, the permission screens ("Google hasn't verified this app"), and deploying are the user's steps in their own browser. Guide them click by click. Never ask for a password or type one.
2. **Only myself.** Deploy with "Who has access: Only myself". The page shows private writing, so never widen access, even for a quick test.
3. **Nothing overwritten, nothing removed.** When preparing the folder, create only missing folders. When copying files in, skip names that already exist and report them. Do not move or delete anything in the user's Drive.
4. **Paste the template unchanged.** Settings live in script properties, so the files in `template/` work for everyone and updates are paste-and-redeploy. Change code only when the user asks, and say exactly what changed.
5. **Private content stays private.** Do not quote the user's writing or chats in reports, issues, or messages to other services. Use the fictional samples in `examples/` for demonstrations.

## Workflow

### 1. Agree the setup

Settle these with the user first:

- **Google account:** a browser window with only this account signed in makes Apps Script far less error-prone.
- **Drawer folder:** a new folder, or an existing archive. A folder made by AI Chat Archive works as it is, because its service folders become the drawer's conversation groups.
- **Language** (English or Korean), **page title**, and the **name** shown on the user's own writing.
- **Services:** the default four, or another list ([settings](references/customize.md#services)).

### 2. Prepare the folder

```
<drawer folder>/
  texts/                         writing, one .md per piece and language
  chatgpt/ claude/ gemini/ grok/ conversations and their files
  _memos.json                    written by the drawer
```

- The folders sit directly inside the drawer folder. Folders the drawer does not know are ignored, so other things can live there too.
- If the user's Drive is synced to this computer (Google Drive for desktop), you may create the missing folders there with their OK; otherwise ask them to create the folders at drive.google.com.
- Files follow [what the drawer reads](references/content-format.md). To check a folder before installing, build a local preview with `scripts/build_preview.py` ([scripts](scripts/README.md)).

### 3. Install

Walk the user through [setup](references/setup.md). It takes about ten minutes:

1. Create an Apps Script project, show the manifest, and paste `Code.gs`, `Index.html` (as an HTML file named `Index`), and `appsscript.json` from `template/`.
2. Run `checkSetup` once and approve the permissions.
3. Deploy a web app: execute as **Me**, access **Only myself**. The user keeps the `/exec` address.
4. Open the address. The setup screen asks for the folder link, title, name, and language.

### 4. Check

- The group counts match the folders. Open one piece of writing (switch languages if it has two), one conversation with a picture, and the calendar. Add, move, and fold a memo.
- Try the trash only with the user's OK and on a throwaway file, then restore it.
- On a phone, open the address in a browser signed in to the same account and add it to the home screen.

### 5. Update later

Paste the new files over the old ones, then Deploy → Manage deployments → edit → Version: New version → Deploy. The address stays the same; "New deployment" would create a new one. Settings and memos are kept. Details: [updating](references/setup.md#updating-to-a-new-version).

### 6. Add content

Write or convert files by [what the drawer reads](references/content-format.md). To archive AI chats, AI Chat Archive produces exactly the format the conversation groups read; copy its service folders into the drawer folder.

When something goes wrong, check [troubleshooting](references/troubleshooting.md) before changing code.

## Final report

End every session with:

1. **Drawer:** the folder (by name, never its id), the services shown, and the language.
2. **Done:** folders created, files copied (counts), the deployed version. Do not repeat the web app address in notes that others may see.
3. **Checks:** each marked *done* or *not done*: opens, counts, conversation with picture, memo, trash test, phone.
4. **Open items:** errors seen, files skipped, and settings to revisit.

## References

- [Setup](references/setup.md): project, permissions, deployment, phone, updates, and clasp
- [What the drawer reads](references/content-format.md): folder layout and the .md formats
- [Settings](references/customize.md): script properties, services, language, and limits
- [Troubleshooting](references/troubleshooting.md): errors, causes, and fixes
- [Scripts](scripts/README.md): local preview and self-test
- [Examples](examples/README.md): a fictional sample drawer and practical prompts
