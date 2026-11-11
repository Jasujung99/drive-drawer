/**
 * Drive Drawer: a private page that shows one Google Drive folder of Markdown writing and AI chat archives.
 *
 * Deploy as a web app with "Execute as: Me" and "Who has access: Only myself".
 * Permissions: Drive (to move files to and from the Drive trash and to save _memos.json) and
 * external requests (to call the Drive API in parallel).
 * Reads: the folder saved in the script property DRAWER_FOLDER_ID, and inside it only texts/ and the
 * conversation folders in the service list (chatgpt/, claude/, gemini/, grok/ unless DRAWER_SERVICES says otherwise).
 * Changes: the trash flag of files in those folders (trashItem/restoreItem) and the single file _memos.json in the
 * drawer folder (saveMemos). It never edits other files and never deletes anything permanently.
 * File contents stay in the user cache for at most 6 hours.
 */
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const ALL_DRIVES = 'supportsAllDrives=true';
const TEXTS_FOLDER = 'texts';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const CACHE_SECONDS = 6 * 60 * 60;
const PAGE_SIZE = 1000;
const MAX_PAGES = 50; // up to 50,000 files in one folder
const MAX_MOVE = 500;
const DEFAULT_SERVICES = [
  { folder: 'chatgpt', label: 'ChatGPT', url: '^https://(chatgpt\\.com|chat\\.openai\\.com)/' },
  { folder: 'claude', label: 'Claude', url: '^https://claude\\.ai/' },
  { folder: 'gemini', label: 'Gemini', url: '^https://gemini\\.google\\.com/' },
  { folder: 'grok', label: 'Grok', url: '^https://(www\\.)?grok\\.com/' },
];

/* ---------- words shown to the user ---------- */
const MESSAGES = {
  en: {
    defaultTitle: 'Drawer', texts: 'Writing', trash: 'Trash', untitled: 'Untitled', photo: '{title} photo',
    deleted: 'deleted {date}', classroom: 'Google Classroom', forms: 'Google Forms',
    notSetUp: 'The drawer folder is not chosen yet. Open the web app and choose a folder.',
    listFailed: 'Could not read the Drive list ({code}, {folder}): {reason}',
    tooManyPages: 'A folder has more than {max} files. Split it into smaller folders.',
    badPhoto: 'That photo id is not valid.', photoInfo: 'Could not read the photo details.',
    photoOutside: 'That file is outside the drawer.', photoRead: 'Could not read the photo.',
    badFiles: 'The files to move are not valid.', fileInfo: 'Could not read the file details: {reason}',
    fileOutside: 'Nothing was moved: this file is outside the drawer: {name}',
    trashFailed: 'Could not move it to the trash: {reason}', restoreFailed: 'Could not restore it: {reason}',
    memoRead: 'Could not read the memos: {reason}', memoBroken: 'The memo file (_memos.json) is damaged.',
    memoNotList: 'That is not a memo list.', memoLimit: 'You can keep up to {max} memos.',
    memoSave: 'Could not save the memos: {reason}',
    folderMissing: 'Paste the link or id of a Drive folder.',
    folderNotFound: 'Could not open that folder ({reason}). Check the link and that this account can open it.',
    notAFolder: 'That link is not a folder.', folderTrashed: 'That folder is in the Drive trash.',
  },
  ko: {
    defaultTitle: '서랍', texts: '글', trash: '휴지통', untitled: '무제', photo: '{title} 사진',
    deleted: '{date} 지움', classroom: 'Google 클래스룸', forms: 'Google 폼',
    notSetUp: '서랍 폴더가 아직 정해지지 않았어요. 웹앱을 열어 폴더를 골라 주세요.',
    listFailed: 'Drive 목록을 읽지 못했어요 ({code}, {folder}): {reason}',
    tooManyPages: '파일이 {max}개가 넘는 폴더가 있어요. 폴더를 나눠 주세요.',
    badPhoto: '잘못된 사진 번호예요.', photoInfo: '사진 정보를 읽지 못했어요.',
    photoOutside: '서랍 밖의 파일이에요.', photoRead: '사진을 읽지 못했어요.',
    badFiles: '옮길 파일 정보가 올바르지 않아요.', fileInfo: '파일 정보를 읽지 못했어요: {reason}',
    fileOutside: '서랍 밖의 파일이 있어 아무것도 옮기지 않았어요: {name}',
    trashFailed: '휴지통으로 옮기지 못했어요: {reason}', restoreFailed: '되살리지 못했어요: {reason}',
    memoRead: '메모를 읽지 못했어요: {reason}', memoBroken: '메모 파일(_memos.json) 형식이 깨졌어요.',
    memoNotList: '메모 목록이 아니에요.', memoLimit: '메모는 {max}개까지 저장할 수 있어요.',
    memoSave: '메모를 저장하지 못했어요: {reason}',
    folderMissing: 'Drive 폴더 주소나 ID를 붙여 넣어 주세요.',
    folderNotFound: '그 폴더를 열지 못했어요 ({reason}). 주소와, 이 계정으로 열 수 있는 폴더인지 확인해 주세요.',
    notAFolder: '폴더 주소가 아니에요.', folderTrashed: '그 폴더는 Drive 휴지통에 있어요.',
  },
};

function fill_(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (whole, name) => (vars && vars[name] != null ? String(vars[name]) : whole));
}

/* ---------- settings: script properties, set from the web app's setup screen ---------- */
const PROP = {
  folder: 'DRAWER_FOLDER_ID', title: 'DRAWER_TITLE', owner: 'DRAWER_OWNER', lang: 'DRAWER_LANG',
  timeZone: 'DRAWER_TIME_ZONE', services: 'DRAWER_SERVICES',
};

function settings_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const lang = props[PROP.lang] === 'ko' ? 'ko' : 'en';
  return {
    folderId: props[PROP.folder] || '',
    title: props[PROP.title] || MESSAGES[lang].defaultTitle,
    owner: props[PROP.owner] || '',
    lang: lang,
    timeZone: props[PROP.timeZone] || Session.getScriptTimeZone() || 'Etc/UTC',
    services: parseServices(props[PROP.services]),
  };
}

/** The conversation folders to read. DRAWER_SERVICES may hold a JSON list like the default one. */
function parseServices(raw) {
  if (!raw) return DEFAULT_SERVICES;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (err) { return DEFAULT_SERVICES; }
  if (!Array.isArray(parsed)) return DEFAULT_SERVICES;
  const seen = {};
  const out = parsed.map(entry => ({ folder: str(entry && entry.folder).toLowerCase(), label: str(entry && entry.label).slice(0, 40), url: str(entry && entry.url) }))
    .filter(svc => {
      if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(svc.folder) || svc.folder === TEXTS_FOLDER || !svc.label || seen[svc.folder]) return false;
      seen[svc.folder] = true;
      return true;
    });
  return out.length ? out : DEFAULT_SERVICES;
}

/** A Drive folder link (…/folders/<id>, ?id=<id>) or a bare id → the id. */
function folderIdFrom(text) {
  const value = str(text);
  const match = value.match(/\/folders\/([\w-]{10,})/) || value.match(/[?&]id=([\w-]{10,})/) || value.match(/^([\w-]{10,})$/);
  return match ? match[1] : '';
}

function validTimeZone_(tz) {
  return /^(UTC|GMT|Etc\/GMT[+-]\d{1,2}|[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2})$/.test(str(tz));
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(settings_().title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Settings for the setup screen. */
function getSettings() {
  const cfg = settings_();
  const props = PropertiesService.getScriptProperties().getProperties();
  let folderName = '';
  if (cfg.folderId) {
    const res = fetchOne_(DRIVE_API + '/' + cfg.folderId + '?fields=name&' + ALL_DRIVES);
    if (res.getResponseCode() === 200) folderName = JSON.parse(res.getContentText()).name || '';
  }
  return {
    folderId: cfg.folderId, folderName: folderName, title: props[PROP.title] || '', owner: cfg.owner, lang: cfg.lang,
    timeZone: props[PROP.timeZone] || '', services: cfg.services.map(svc => svc.label),
  };
}

/** Setup screen: check that the folder opens and is a folder, then save the settings. */
function saveSettings(input) {
  input = input || {};
  const lang = input.lang === 'ko' ? 'ko' : 'en';
  const words = MESSAGES[lang];
  const id = folderIdFrom(input.folder);
  if (!id) throw new Error(words.folderMissing);
  const res = fetchOne_(DRIVE_API + '/' + id + '?fields=id,name,mimeType,trashed&' + ALL_DRIVES);
  if (res.getResponseCode() !== 200) throw new Error(fill_(words.folderNotFound, { reason: driveError_(res) }));
  const info = JSON.parse(res.getContentText());
  if (info.mimeType !== FOLDER_MIME) throw new Error(words.notAFolder);
  if (info.trashed) throw new Error(words.folderTrashed);
  const props = PropertiesService.getScriptProperties();
  const values = {};
  values[PROP.folder] = info.id;
  values[PROP.lang] = lang;
  values[PROP.title] = str(input.title).replace(/\s+/g, ' ').slice(0, 60);
  values[PROP.owner] = str(input.owner).replace(/\s+/g, ' ').slice(0, 80);
  values[PROP.timeZone] = validTimeZone_(input.timeZone) ? str(input.timeZone) : '';
  Object.keys(values).forEach(name => (values[name] ? props.setProperty(name, values[name]) : props.deleteProperty(name)));
  return { ok: true, folderName: info.name || '' };
}

/** Run once from the editor: asks for permission and logs what the drawer can see. */
function checkSetup() {
  const cfg = settings_();
  if (!cfg.folderId) {
    console.log('Authorized. No drawer folder yet: open the web app and choose one.');
    return 'not set up';
  }
  const names = [TEXTS_FOLDER].concat(cfg.services.map(svc => svc.folder));
  const [root] = listChildren_([cfg.folderId], false, cfg.lang);
  const found = root.filter(file => file.mimeType === FOLDER_MIME && names.indexOf(file.name) >= 0);
  const counts = listChildren_(found.map(file => file.id), false, cfg.lang).map((files, index) => found[index].name + ': ' + files.length);
  const line = 'Drawer folder OK. ' + (counts.length ? counts.join(', ') : 'No texts/ or conversation folders yet.');
  console.log(line);
  return line;
}

/* ---------- reading Drive ---------- */

function auth_() {
  return { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
}
function request_(url, extra) {
  return Object.assign({ url: url }, auth_(), extra || {});
}
/** One Drive request. Single calls go through fetchAll too, so every request is built the same way. */
function fetchOne_(url, extra) {
  return UrlFetchApp.fetchAll([request_(url, extra)])[0];
}
/** A query string from named values; empty values are left out. */
function query_(params) {
  return Object.keys(params)
    .filter(name => params[name] !== '' && params[name] !== undefined && params[name] !== null)
    .map(name => name + '=' + encodeURIComponent(params[name]))
    .join('&');
}

/** Children of each folder, following nextPageToken so folders with more than 1,000 files are read in full. */
function listChildren_(folderIds, trashed, lang) {
  const words = MESSAGES[lang === 'ko' ? 'ko' : 'en'];
  const fields = 'nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,size,trashedTime,imageMediaMetadata(time,width,height))';
  const results = folderIds.map(() => []);
  // cursor: where the next page of a folder starts (Drive's nextPageToken); empty for the first page.
  let pending = folderIds.map((id, index) => ({ index: index, cursor: '', pages: 0 }));
  while (pending.length) {
    const responses = UrlFetchApp.fetchAll(pending.map(page => request_(DRIVE_API + '?' + query_({
      pageSize: PAGE_SIZE,
      fields: fields,
      q: "'" + folderIds[page.index] + "' in parents and trashed=" + (trashed ? 'true' : 'false'),
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
      pageToken: page.cursor,
    }))));
    const next = [];
    responses.forEach((res, position) => {
      const page = pending[position];
      if (res.getResponseCode() !== 200) {
        throw new Error(fill_(words.listFailed, { code: res.getResponseCode(), folder: folderIds[page.index], reason: driveError_(res) }));
      }
      const body = JSON.parse(res.getContentText());
      results[page.index] = results[page.index].concat(body.files || []);
      if (body.nextPageToken) {
        if (page.pages + 1 >= MAX_PAGES) throw new Error(fill_(words.tooManyPages, { max: PAGE_SIZE * MAX_PAGES }));
        next.push({ index: page.index, cursor: body.nextPageToken, pages: page.pages + 1 });
      }
    });
    pending = next;
  }
  return results;
}

/** The reason Drive gave for refusing (API turned off, missing permission…), kept short. */
function driveError_(res) {
  try {
    const err = JSON.parse(res.getContentText()).error || {};
    const reason = (err.errors && err.errors[0] && err.errors[0].reason) || err.status || '';
    return [reason, err.message].filter(Boolean).join(' — ').slice(0, 300);
  } catch (failure) {
    return res.getContentText().slice(0, 300);
  }
}

function readTexts_(files) {
  const cache = CacheService.getUserCache();
  const keys = files.map(file => 'md:' + file.id + ':' + file.modifiedTime);
  const found = keys.length ? cache.getAll(keys) : {};
  const missing = files.filter((file, index) => found[keys[index]] == null);
  for (let start = 0; start < missing.length; start += 40) {
    const chunk = missing.slice(start, start + 40);
    const responses = UrlFetchApp.fetchAll(chunk.map(file => request_(DRIVE_API + '/' + file.id + '?alt=media&' + ALL_DRIVES)));
    const toCache = {};
    responses.forEach((res, position) => {
      const key = 'md:' + chunk[position].id + ':' + chunk[position].modifiedTime;
      const text = res.getResponseCode() === 200 ? res.getContentText('UTF-8') : '';
      found[key] = text;
      if (text && Utilities.newBlob(text).getBytes().length < 95000) toCache[key] = text;
    });
    if (Object.keys(toCache).length) cache.putAll(toCache, CACHE_SECONDS);
  }
  return files.map((file, index) => found[keys[index]] || '');
}

function drawerFolders_(cfg) {
  const names = [TEXTS_FOLDER].concat(cfg.services.map(svc => svc.folder));
  const [root] = listChildren_([cfg.folderId], false, cfg.lang);
  const folders = {};
  root.filter(file => file.mimeType === FOLDER_MIME && names.indexOf(file.name) >= 0).forEach(file => { folders[file.name] = file.id; });
  return { names: names.filter(name => folders[name]), ids: folders, root: root };
}

/** The page's first call: everything in the drawer, with the text of every Markdown file. */
function getDrawer() {
  const cfg = settings_();
  const base = { lang: cfg.lang, title: cfg.title, owner: cfg.owner };
  if (!cfg.folderId) return Object.assign({ needsSetup: true, timeZone: cfg.timeZone }, base);
  const found = drawerFolders_(cfg);
  const listed = listChildren_(found.names.map(name => found.ids[name]), false, cfg.lang);
  const tree = {};
  const mdFiles = [];
  found.names.forEach((name, index) => {
    tree[name] = { files: [], images: {}, others: {} };
    listed[index].forEach(file => {
      if (file.mimeType === FOLDER_MIME || file.name.startsWith('_')) return;
      if (/^image\//.test(file.mimeType)) tree[name].images[file.name] = file.id;
      // A name with '__' belongs to a conversation as one of its files (even a .md); it is not an item of its own.
      else if (/\.md$/i.test(file.name) && file.name.indexOf('__') < 0) mdFiles.push({ folder: name, file: file });
      else tree[name].others[file.name] = file.id;
    });
  });
  const texts = readTexts_(mdFiles.map(entry => entry.file));
  mdFiles.forEach((entry, index) => tree[entry.folder].files.push({ id: entry.file.id, name: entry.file.name, text: texts[index] }));
  // Trash: files from these folders that are in the Drive trash (shown while Drive keeps them).
  const trashedLists = listChildren_(found.names.map(name => found.ids[name]), true, cfg.lang);
  const trashed = [];
  found.names.forEach((name, index) => trashedLists[index].forEach(file => { if (file.mimeType !== FOLDER_MIME) trashed.push({ folder: name, file: file }); }));
  const trashedMd = trashed.filter(item => /\.md$/i.test(item.file.name));
  const trashedTexts = readTexts_(trashedMd.map(item => item.file));
  tree.trash = trashed.map(item => {
    const position = trashedMd.indexOf(item);
    return { id: item.file.id, name: item.file.name, folder: item.folder, mimeType: item.file.mimeType, trashedTime: item.file.trashedTime || '', text: position >= 0 ? trashedTexts[position] : '' };
  });
  const now = new Date();
  return Object.assign(base, buildDrawer(tree, {
    lang: cfg.lang, owner: cfg.owner, services: cfg.services,
    today: Utilities.formatDate(now, cfg.timeZone, 'yyyy-MM-dd'), time: Utilities.formatDate(now, cfg.timeZone, 'HH:mm'),
  }));
}

function allowedFolderIds_(cfg) {
  const found = drawerFolders_(cfg);
  return found.names.map(name => found.ids[name]);
}

/** Photos load only when their item is opened, and only from the drawer's folders. */
function getImage(fileId) {
  const cfg = settings_();
  const words = MESSAGES[cfg.lang];
  if (!/^[\w-]{10,}$/.test(String(fileId))) throw new Error(words.badPhoto);
  const meta = fetchOne_(DRIVE_API + '/' + fileId + '?fields=mimeType,parents&' + ALL_DRIVES);
  if (meta.getResponseCode() !== 200) throw new Error(words.photoInfo);
  const info = JSON.parse(meta.getContentText());
  const allowed = allowedFolderIds_(cfg);
  if (!/^image\//.test(info.mimeType) || !(info.parents || []).some(parent => allowed.indexOf(parent) >= 0)) throw new Error(words.photoOutside);
  const res = fetchOne_(DRIVE_API + '/' + fileId + '?alt=media&' + ALL_DRIVES);
  if (res.getResponseCode() !== 200) throw new Error(words.photoRead);
  return 'data:' + info.mimeType + ';base64,' + Utilities.base64Encode(res.getContent());
}

/** "Move to trash": into the Drive trash (Google deletes it after 30 days). */
function trashItem(fileIds) { return setTrashed_(fileIds, true); }
/** Undo and restore: from the trash back to the original folder. */
function restoreItem(fileIds) { return setTrashed_(fileIds, false); }

function setTrashed_(fileIds, trashed) {
  const cfg = settings_();
  const words = MESSAGES[cfg.lang];
  if (!Array.isArray(fileIds) || !fileIds.length || fileIds.length > MAX_MOVE || fileIds.some(id => !/^[\w-]{10,}$/.test(String(id)))) {
    throw new Error(words.badFiles);
  }
  const allowed = allowedFolderIds_(cfg);
  // Check every file first, so that nothing moves unless all of them are inside the drawer.
  for (let start = 0; start < fileIds.length; start += 50) {
    const metas = UrlFetchApp.fetchAll(fileIds.slice(start, start + 50).map(id =>
      request_(DRIVE_API + '/' + id + '?fields=id,name,mimeType,parents&' + ALL_DRIVES)));
    metas.forEach(res => {
      if (res.getResponseCode() !== 200) throw new Error(fill_(words.fileInfo, { reason: driveError_(res) }));
      const info = JSON.parse(res.getContentText());
      const inDrawer = (info.parents || []).some(parent => allowed.indexOf(parent) >= 0);
      if (!inDrawer || info.mimeType === FOLDER_MIME) throw new Error(fill_(words.fileOutside, { name: info.name }));
    });
  }
  for (let start = 0; start < fileIds.length; start += 50) {
    const results = UrlFetchApp.fetchAll(fileIds.slice(start, start + 50).map(id => request_(DRIVE_API + '/' + id + '?fields=id,trashed&' + ALL_DRIVES, {
      method: 'patch', contentType: 'application/json', payload: JSON.stringify({ trashed: trashed }),
    })));
    results.forEach(res => {
      if (res.getResponseCode() !== 200) throw new Error(fill_(trashed ? words.trashFailed : words.restoreFailed, { reason: driveError_(res) }));
    });
  }
  return fileIds.length;
}

/* ---------- memos (sticky notes): all in one file, _memos.json in the drawer folder ---------- */
const MEMO_FILE = '_memos.json';
const MEMO_COLORS = ['butter', 'apricot', 'lilac'];
const MEMO_LIMIT = 100;

function memoFile_(cfg) {
  const [children] = listChildren_([cfg.folderId], false, cfg.lang);
  return children.find(file => file.name === MEMO_FILE && file.mimeType !== FOLDER_MIME) || null;
}

function cleanMemo_(memo) {
  if (!memo || typeof memo !== 'object') return null;
  const num = (value, low, high, fallback) => { value = Number(value); return isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback; };
  return {
    id: String(memo.id || '').replace(/[^\w-]/g, '').slice(0, 40) || Utilities.getUuid(),
    text: String(memo.text == null ? '' : memo.text).slice(0, 5000),
    x: num(memo.x, 0, 1, 0.7),
    y: num(memo.y, 0, 20000, 80),
    color: MEMO_COLORS.indexOf(memo.color) >= 0 ? memo.color : 'butter',
    folded: !!memo.folded,
    updated: String(memo.updated || '').slice(0, 40),
  };
}

/** The memo list. If the file does not exist yet, memos is null (the page then adds a first memo). */
function getMemos() {
  const cfg = settings_();
  if (!cfg.folderId) return { memos: [], notSetUp: true, lang: cfg.lang };
  const words = MESSAGES[cfg.lang];
  const file = memoFile_(cfg);
  if (!file) return { memos: null, lang: cfg.lang };
  const res = fetchOne_(DRIVE_API + '/' + file.id + '?alt=media&' + ALL_DRIVES);
  if (res.getResponseCode() !== 200) throw new Error(fill_(words.memoRead, { reason: driveError_(res) }));
  let parsed;
  try { parsed = JSON.parse(res.getContentText('UTF-8')); } catch (err) { throw new Error(words.memoBroken); }
  const memos = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.memos) ? parsed.memos : []);
  return { memos: memos.map(cleanMemo_).filter(Boolean), savedAt: file.modifiedTime, lang: cfg.lang };
}

/** Save every memo at once (the last save wins). Creates or updates only _memos.json in the drawer folder. */
function saveMemos(memos) {
  const cfg = settings_();
  const words = MESSAGES[cfg.lang];
  if (!cfg.folderId) throw new Error(words.notSetUp);
  if (!Array.isArray(memos)) throw new Error(words.memoNotList);
  if (memos.length > MEMO_LIMIT) throw new Error(fill_(words.memoLimit, { max: MEMO_LIMIT }));
  const body = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), memos: memos.map(cleanMemo_).filter(Boolean) }, null, 2);
  const file = memoFile_(cfg);
  let res;
  if (file) {
    res = fetchOne_(UPLOAD_API + '/' + file.id + '?uploadType=media&fields=id,modifiedTime&' + ALL_DRIVES, {
      method: 'patch', contentType: 'application/json; charset=UTF-8', payload: Utilities.newBlob(body).getBytes(),
    });
  } else {
    const boundary = 'drawer-memo-' + Date.now();
    const meta = JSON.stringify({ name: MEMO_FILE, parents: [cfg.folderId], mimeType: 'application/json' });
    const multipart = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
      '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + body + '\r\n--' + boundary + '--';
    res = fetchOne_(UPLOAD_API + '?uploadType=multipart&fields=id,modifiedTime&' + ALL_DRIVES, {
      method: 'post', contentType: 'multipart/related; boundary=' + boundary, payload: Utilities.newBlob(multipart).getBytes(),
    });
  }
  if (res.getResponseCode() >= 300) throw new Error(fill_(words.memoSave, { reason: driveError_(res) }));
  return { ok: true, savedAt: JSON.parse(res.getContentText()).modifiedTime || '' };
}

/* ---------- from here on, plain conversion with no Drive calls (also runs in the local preview) ---------- */

function buildDrawer(tree, opts) {
  opts = opts || {};
  const lang = opts.lang === 'ko' ? 'ko' : 'en';
  const ctx = { lang: lang, words: MESSAGES[lang], owner: str(opts.owner), services: opts.services || DEFAULT_SERVICES };
  const folder = name => tree[name] || { files: [], images: {}, others: {} };
  return {
    built: dateLabel(opts.today, lang) + (opts.time ? ' ' + opts.time : ''),
    services: ctx.services.map(svc => svc.label),
    groups: [{ key: TEXTS_FOLDER, label: ctx.words.texts, items: buildTexts(folder(TEXTS_FOLDER), ctx) }]
      .concat(ctx.services.map(svc => ({ key: svc.folder, label: svc.label, items: buildChats(folder(svc.folder), svc, ctx) })))
      .concat([{ key: 'trash', label: ctx.words.trash, items: buildTrash(tree.trash || [], ctx) }]),
  };
}

function splitFrontmatter(src) {
  const text = String(src || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  return { meta: parseYaml(match[1]) || {}, body: match[2] };
}

/** As much YAML as the drawer needs: key-value, quoted strings, [lists], - lists, key-value inside lists, | blocks. */
function parseYaml(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  let row = 0;
  const indentOf = line => line.match(/^ */)[0].length;
  const isBlank = line => !line.trim() || /^\s*#/.test(line);
  const skip = () => { while (row < lines.length && isBlank(lines[row])) row++; };
  const isItem = line => /^\s*-(\s|$)/.test(line);
  function flow(text) {
    const out = []; let cur = '', quote = null;
    for (const ch of text) {
      if (quote) { if (ch === quote) quote = null; else cur += ch; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ',') { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out.filter(Boolean);
  }
  function scalar(raw) {
    raw = raw.trim();
    if (!raw) return '';
    if (raw[0] === '"') {
      let out = '';
      for (let at = 1; at < raw.length; at++) {
        const ch = raw[at];
        if (ch === '\\') { const next = raw[++at]; out += next === 'n' ? '\n' : next === 't' ? '\t' : next; }
        else if (ch === '"') break;
        else out += ch;
      }
      return out;
    }
    if (raw[0] === "'") {
      let out = '';
      for (let at = 1; at < raw.length; at++) {
        if (raw[at] === "'") { if (raw[at + 1] === "'") { out += "'"; at++; } else break; }
        else out += raw[at];
      }
      return out;
    }
    if (raw[0] === '[') { const end = raw.lastIndexOf(']'); return flow(raw.slice(1, end > 0 ? end : raw.length)); }
    return raw.replace(/\s+#.*$/, '').trim();
  }
  function node(indent) {
    skip();
    if (row >= lines.length || indentOf(lines[row]) < indent) return '';
    return isItem(lines[row]) ? sequence(indentOf(lines[row])) : mapping(indentOf(lines[row]));
  }
  function sequence(ind) {
    const arr = [];
    while (true) {
      skip();
      if (row >= lines.length || indentOf(lines[row]) !== ind || !isItem(lines[row])) break;
      const rest = lines[row].slice(ind).replace(/^-\s?/, '');
      if (/^[^"'\[\s#][^:]*:(\s|$)/.test(rest)) { lines[row] = ' '.repeat(ind + 2) + rest; arr.push(mapping(ind + 2)); }
      else { row++; arr.push(scalar(rest)); }
    }
    return arr;
  }
  function mapping(ind) {
    const obj = {};
    while (true) {
      skip();
      if (row >= lines.length) break;
      const line = lines[row];
      const cur = indentOf(line);
      if (cur < ind || (cur === ind && isItem(line))) break;
      if (cur > ind) { row++; continue; }
      const match = line.slice(ind).match(/^([^:#][^:]*?):(?:[ \t]+(.*))?$/);
      if (!match) { row++; continue; }
      const key = match[1].trim(), rest = (match[2] || '').trim();
      row++;
      if (/^[|>][+-]?\s*(#.*)?$/.test(rest)) {
        const buf = []; let base = null;
        while (row < lines.length) {
          const blockLine = lines[row];
          if (blockLine.trim() && indentOf(blockLine) <= ind) break;
          if (blockLine.trim() && base === null) base = indentOf(blockLine);
          buf.push(blockLine); row++;
        }
        const text = buf.map(piece => piece.slice(Math.min(base || 0, indentOf(piece)))).join('\n').replace(/\s+$/, '');
        obj[key] = rest[0] === '>' ? text.replace(/([^\n])\n(?!\n)/g, '$1 ') : text;
      } else if (rest === '' || rest[0] === '#') {
        const save = row; skip();
        const next = lines[row];
        if (next !== undefined && (indentOf(next) > ind || (indentOf(next) === ind && isItem(next)))) obj[key] = node(indentOf(next));
        else { row = save; obj[key] = ''; }
      } else {
        obj[key] = scalar(rest);
      }
    }
    return obj;
  }
  return node(0) || {};
}

function str(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(str).join(', ');
  return String(value).trim();
}
function list(value) {
  if (Array.isArray(value)) return value.map(str).filter(Boolean);
  const text = str(value);
  return text ? [text] : [];
}
/** 2026-11-06 → "2026-11-06" in English, "2026. 11. 06." in Korean. A month alone stays a month. */
function dateLabel(value, lang) {
  const parts = str(value).slice(0, 10).split('-').filter(Boolean);
  if (!parts.length) return '';
  return lang === 'ko' ? parts.join('. ') + '.' : parts.join('-');
}
function sourceView(source, deleted, ctx) {
  source = str(source);
  if (str(deleted) || !source) return { label: '', url: '' };
  const match = source.match(/^https?:\/\/([^/]+)(\/[^?#]*)?/);
  if (!match) return { label: source, url: '' };
  const host = match[1], path = match[2] || '';
  let label = host.replace(/^www\./, '');
  if (host.indexOf('classroom.google.com') >= 0) label = ctx.words.classroom;
  else if (host.indexOf('docs.google.com') >= 0 && path.indexOf('/forms/') === 0) label = ctx.words.forms;
  return { label: label, url: source };
}
function imageView(folder, meta, title, ctx) {
  const name = str(meta.image).split('/').pop();
  if (!name || !folder.images[name]) return null;
  return { id: folder.images[name], alt: str(meta.image_alt) || fill_(ctx.words.photo, { title: title }) };
}
const byName = (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
const byDateDesc = (left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : 0);

/** Writing (texts/): files with the same slug are one item, one body per language (name.ko.md, name.en.md). */
function buildTexts(folder, ctx) {
  const groups = {};
  const serviceLabels = ctx.services.map(svc => svc.label);
  folder.files.slice().sort(byName).forEach(file => {
    const { meta, body } = splitFrontmatter(file.text);
    const slug = str(meta.slug) || file.name.split('.')[0];
    const lang = str(meta.lang) || ctx.lang;
    const title = str(meta.title) || ctx.words.untitled;
    const entry = groups[slug] || (groups[slug] = {
      id: 'text-' + slug, kind: 'text', title: title,
      author: str(meta.author), publisher: str(meta.publisher), type: str(meta.type), status: str(meta.status),
      date: str(meta.date), tags: list(meta.tags), source: sourceView(meta.source, meta.source_deleted, ctx),
      rights: str(meta.rights), note: str(meta.note), image: null, bodies: {}, byLang: {}, fileIds: [],
      // Kept from an AI chat: when source is a service name, the item links to that conversation.
      service: serviceLabels.indexOf(str(meta.source)) >= 0 ? str(meta.source) : '',
      related: str(meta.related), relatedTitle: str(meta.related_title),
    });
    if (file.id) entry.fileIds.push(file.id);
    entry.bodies[lang] = body.trim().split('\n').map(line => line.replace(/\s+$/, '')).join('\n');
    // Title, type, status and tags can differ by language; the reader shows the ones of the language being read.
    entry.byLang[lang] = { title: title, type: str(meta.type), status: str(meta.status), tags: list(meta.tags) };
    entry.image = entry.image || imageView(folder, meta, title, ctx);
  });
  return Object.keys(groups).map(key => groups[key]).sort(byDateDesc).map(item => {
    item.dateLabel = dateLabel(item.date, ctx.lang);
    item.langs = ['en', 'ko'].filter(code => item.bodies[code] !== undefined).concat(Object.keys(item.bodies).filter(code => code !== 'ko' && code !== 'en'));
    if (ctx.lang === 'ko') item.langs.sort((left, right) => (left === 'ko' ? -1 : right === 'ko' ? 1 : 0));
    const shown = item.byLang[ctx.lang] || item.byLang[item.langs[0]];
    item.title = shown.title;
    item.type = shown.type;
    item.status = shown.status;
    if (shown.tags.length) item.tags = shown.tags;
    item.own = item.author === '' || (ctx.owner !== '' && item.author === ctx.owner);
    item.sub = [item.own ? item.dateLabel : item.author, item.status || item.type, item.langs.length > 1 ? item.langs.map(code => code.toUpperCase()).join('/') : '']
      .filter(Boolean).join(' · ');
    return item;
  });
}

function chatUrlOk_(service, url) {
  if (!/^https:\/\//.test(url)) return false;
  if (!service.url) return true;
  try { return new RegExp(service.url).test(url); } catch (err) { return true; }
}

/** AI conversations: one .md per conversation, in the format AI Chat Archive writes. Only title and date matter; the rest shows when present. */
function buildChats(folder, service, ctx) {
  return folder.files.map(file => {
    const { meta, body } = splitFrontmatter(file.text);
    const stem = file.name.replace(/\.md$/i, '');
    const account = str(meta.account), chatNo = str(meta.chat_no), date = str(meta.date), category = str(meta.category);
    const assets = chatAssets(folder, meta.assets);
    // Moving a conversation to the trash takes only the files named after it (files shared with other conversations stay).
    const ownAssetIds = assets.filter(asset => asset.id && asset.file.indexOf(stem + '__') === 0).map(asset => asset.id);
    const url = str(meta.chat_url);
    return {
      id: 'chat-' + service.folder + '-' + stem, file: file.name, kind: 'chat', service: service.label, folder: service.folder,
      title: str(meta.title) || stem, project: str(meta.project), account: account, chatNo: chatNo,
      chatUrl: chatUrlOk_(service, url) ? url : '',
      date: date, dateEnd: str(meta.date_end), dateLabel: dateLabel(date, ctx.lang), dateEndLabel: dateLabel(meta.date_end, ctx.lang),
      category: category, tags: list(meta.tags), authorship: str(meta.authorship), userTurns: str(meta.user_turns),
      missing: str(meta.missing), attachments: list(meta.attachments), aiOutputs: list(meta.ai_outputs),
      codeOutputs: list(meta.code_outputs), related: list(meta.related), overlaps: str(meta.overlaps),
      surveyMemo: str(meta.survey_memo), body: body.trim(), assets: assets,
      fileIds: (file.id ? [file.id] : []).concat(ownAssetIds),
      sub: [[account, chatNo && '#' + chatNo].filter(Boolean).join(' '), dateLabel(date, ctx.lang), category].filter(Boolean).join(' · '),
    };
  }).sort((left, right) => byDateDesc(left, right) || (left.id < right.id ? -1 : 1));
}

/** The assets list in the frontmatter, joined to the real files in the same folder. Images show in place; other files open in Drive. */
function chatAssets(folder, items) {
  return (Array.isArray(items) ? items : []).map(item => {
    if (!item || typeof item !== 'object') return null;
    const name = str(item.file).split('/').pop();
    if (!name) return null;
    const imageId = (folder.images || {})[name];
    const otherId = (folder.others || {})[name];
    const id = imageId || otherId || '';
    return {
      file: name, id: id, image: !!imageId, found: !!id, title: str(item.title) || name, alt: str(item.alt) || str(item.title) || name,
      kind: str(item.kind), origin: str(item.origin), turn: str(item.turn), sizeKb: str(item.size_kb),
      url: otherId ? 'https://drive.google.com/file/d/' + otherId + '/view' : '',
    };
  }).filter(Boolean);
}

/** Trash: a conversation and its files, or a text in all its languages, come back as one item. */
function buildTrash(files, ctx) {
  const chatFolders = ctx.services.map(svc => svc.folder);
  const folderLabel = name => (name === TEXTS_FOLDER ? ctx.words.texts : ((ctx.services.find(svc => svc.folder === name) || {}).label || name));
  const byKey = {}, out = [];
  files.forEach(file => {
    const md = /\.md$/i.test(file.name);
    const meta = md ? splitFrontmatter(file.text).meta : {};
    const stem = file.name.replace(/\.md$/i, '');
    let key = 'file:' + file.id, restoreId = '';
    if (file.folder === TEXTS_FOLDER && md) {
      const slug = str(meta.slug) || file.name.split('.')[0];
      key = 'texts:' + slug; restoreId = 'text-' + slug;
    } else if (chatFolders.indexOf(file.folder) >= 0) {
      const base = md && file.name.indexOf('__') < 0 ? stem : (file.name.indexOf('__') > 0 ? file.name.split('__')[0] : '');
      if (base) { key = file.folder + ':' + base; restoreId = 'chat-' + file.folder + '-' + base; }
    }
    const when = str(file.trashedTime);
    let item = byKey[key];
    if (!item) {
      item = byKey[key] = {
        id: 'trash-' + file.id, kind: 'trash', title: '', fileName: file.name, folder: file.folder, folderLabel: folderLabel(file.folder),
        trashedTime: when, fileIds: [], restoreId: restoreId, hasMd: false,
      };
      out.push(item);
    }
    item.fileIds.push(file.id);
    if (md && file.name.indexOf('__') < 0 && !item.hasMd) { item.hasMd = true; item.fileName = file.name; item.title = str(meta.title); }
    if (when > item.trashedTime) item.trashedTime = when;
  });
  return out.map(entry => {
    const label = dateLabel(entry.trashedTime.slice(0, 10), ctx.lang);
    entry.title = entry.title || entry.fileName;
    entry.trashedLabel = label;
    entry.fileCount = entry.fileIds.length;
    entry.sub = [entry.folderLabel, label ? fill_(ctx.words.deleted, { date: label }) : ''].filter(Boolean).join(' · ');
    delete entry.hasMd;
    return entry;
  }).sort((left, right) => (left.trashedTime < right.trashedTime ? 1 : left.trashedTime > right.trashedTime ? -1 : 0));
}

if (typeof module !== 'undefined') module.exports = { buildDrawer, parseYaml, splitFrontmatter, parseServices, folderIdFrom, dateLabel, MESSAGES };
