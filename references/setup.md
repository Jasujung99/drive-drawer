# Setup

The user does every step in their own Google account while you guide. Labels are given in English with the Korean label in brackets for Korean-language accounts. Google renames menus from time to time; when a label is missing, look for the closest one.

## Before you start

- Use a browser window where only this Google account is signed in, such as a private window or a separate browser profile. Apps Script often fails to open when several Google accounts are signed in at once.
- Have the drawer folder ready in Drive. The setup screen asks for its address.

## 1. Create the project

1. Open https://script.google.com and choose **New project** [새 프로젝트]. Rename it, for example "Drawer".
2. Open **Project Settings** (gear icon) [프로젝트 설정] and turn on **Show "appsscript.json" manifest file in editor** ["편집기에서 'appsscript.json' 매니페스트 파일 표시"].

## 2. Paste the files

1. Go back to the **Editor** (`< >` icon) [편집기].
2. `Code.gs`: replace everything in it with `template/Code.gs`.
3. `appsscript.json`: replace everything in it with `template/appsscript.json`. This turns on the Drive service and keeps the web app private.
4. Next to Files, choose **+** → **HTML**, name it `Index` (the editor adds `.html`), and replace its content with `template/Index.html`.
5. Save (Ctrl+S or Cmd+S).

Offer the files one at a time so the user can copy each in full. Paste them unchanged: settings are entered later on the setup screen.

## 3. Approve the permissions

1. In the function menu above the code, choose **checkSetup**, then **Run** [실행].
2. **Review permissions** [권한 검토] → choose the account → on "Google hasn't verified this app" [Google에서 확인하지 않은 앱] choose **Advanced** [고급] → **Go to Drawer (unsafe)** [(으)로 이동] → **Allow** [허용].
   - The warning is normal for a script the user made. Google lists two permissions: see, edit, create, and delete Drive files (the drawer uses it only to move drawer files to the trash and back and to save `_memos.json`), and connect to an external service (used to read Drive in parallel).
3. The execution log ends with "Authorized. No drawer folder yet…".

## 4. Deploy as a web app

1. **Deploy** [배포] → **New deployment** [새 배포] → gear icon → **Web app** [웹 앱].
2. Description: "Drawer". Execute as: **Me** [나]. Who has access: **Only myself** [나만].
3. Choose **Deploy** and copy the **Web app URL**, ending in `/exec`. This is the drawer's address; it opens only for this account, but treat it as private anyway.

## 5. First visit

Open the address. The setup screen asks for:

- **Drive folder:** the folder's address from the Drive address bar, or its id.
- **Page title**, **Your name** (writing by this author, or with no author, shows as the user's own), and **Language**.
- The time zone is taken from the browser.

Save, and the drawer opens. The settings are stored as script properties (Project Settings → Script properties) and can be changed later from **Settings** under the calendar.

## On a phone

Open the address in a browser signed in to the same account and add it to the home screen.

## Updating to a new version

1. Paste the new `Code.gs` and `Index.html`, and `appsscript.json` if it changed, over the old content. Save.
2. **Deploy** → **Manage deployments** [배포 관리] → pencil icon [수정] → Version: **New version** [새 버전] → **Deploy**.

The address stays the same. "New deployment" would create a new address. Settings and memos are kept because they live in script properties and in the drawer folder.

## clasp (advanced, optional)

For users who already have Node.js and clasp:

1. Run `clasp login` and turn on the Apps Script API at https://script.google.com/home/usersettings.
2. Copy `template/` to a working folder, rename `clasp.json.example` to `.clasp.json`, and put the script id in it (Project Settings → IDs).
3. Run `clasp push`, then deploy from the editor as above. To update an existing deployment and keep its address, use `clasp deploy -i <deployment id>`.

This path is documented for convenience; it was not tested with this package.
