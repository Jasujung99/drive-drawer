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
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

/* ---------- settings: script properties, set from the web app's setup screen ---------- */
const PROP = {
  folder: 'DRAWER_FOLDER_ID', title: 'DRAWER_TITLE', owner: 'DRAWER_OWNER', lang: 'DRAWER_LANG',
  timeZone: 'DRAWER_TIME_ZONE', services: 'DRAWER_SERVICES',
};

function settings_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const lang = p[PROP.lang] === 'ko' ? 'ko' : 'en';
  return {
    folderId: p[PROP.folder] || '',
    title: p[PROP.title] || MESSAGES[lang].defaultTitle,
    owner: p[PROP.owner] || '',
    lang: lang,
    timeZone: p[PROP.timeZone] || Session.getScriptTimeZone() || 'Etc/UTC',
    services: parseServices(p[PROP.services]),
  };
}

/** The conversation folders to read. DRAWER_SERVICES may hold a JSON list like the default one. */
function parseServices(raw) {
  if (!raw) return DEFAULT_SERVICES;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return DEFAULT_SERVICES; }
  if (!Array.isArray(parsed)) return DEFAULT_SERVICES;
  const seen = {};
  const out = parsed.map(s => ({ folder: str(s && s.folder).toLowerCase(), label: str(s && s.label).slice(0, 40), url: str(s && s.url) }))
    .filter(s => {
      if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(s.folder) || s.folder === TEXTS_FOLDER || !s.label || seen[s.folder]) return false;
      seen[s.folder] = true;
      return true;
    });
  return out.length ? out : DEFAULT_SERVICES;
}

/** A Drive folder link (…/folders/<id>, ?id=<id>) or a bare id → the id. */
function folderIdFrom(text) {
  const s = str(text);
  const m = s.match(/\/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/^([\w-]{10,})$/);
  return m ? m[1] : '';
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
  const s = settings_();
  const p = PropertiesService.getScriptProperties().getProperties();
  let folderName = '';
  if (s.folderId) {
    const res = UrlFetchApp.fetch(DRIVE_API + '/' + s.folderId + '?fields=name&' + ALL_DRIVES, auth_());
    if (res.getResponseCode() === 200) folderName = JSON.parse(res.getContentText()).name || '';
  }
  return {
    folderId: s.folderId, folderName: folderName, title: p[PROP.title] || '', owner: s.owner, lang: s.lang,
    timeZone: p[PROP.timeZone] || '', services: s.services.map(x => x.label),
  };
}

/** Setup screen: check that the folder opens and is a folder, then save the settings. */
function saveSettings(input) {
  input = input || {};
  const lang = input.lang === 'ko' ? 'ko' : 'en';
  const M = MESSAGES[lang];
  const id = folderIdFrom(input.folder);
  if (!id) throw new Error(M.folderMissing);
  const res = UrlFetchApp.fetch(DRIVE_API + '/' + id + '?fields=id,name,mimeType,trashed&' + ALL_DRIVES, auth_());
  if (res.getResponseCode() !== 200) throw new Error(fill_(M.folderNotFound, { reason: driveError_(res) }));
  const info = JSON.parse(res.getContentText());
  if (info.mimeType !== FOLDER_MIME) throw new Error(M.notAFolder);
  if (info.trashed) throw new Error(M.folderTrashed);
  const props = PropertiesService.getScriptProperties();
  const values = {};
  values[PROP.folder] = info.id;
  values[PROP.lang] = lang;
  values[PROP.title] = str(input.title).replace(/\s+/g, ' ').slice(0, 60);
  values[PROP.owner] = str(input.owner).replace(/\s+/g, ' ').slice(0, 80);
  values[PROP.timeZone] = validTimeZone_(input.timeZone) ? str(input.timeZone) : '';
  Object.keys(values).forEach(k => (values[k] ? props.setProperty(k, values[k]) : props.deleteProperty(k)));
  return { ok: true, folderName: info.name || '' };
}

/** Run once from the editor: asks for permission and logs what the drawer can see. */
function checkSetup() {
  const s = settings_();
  if (!s.folderId) {
    console.log('Authorized. No drawer folder yet: open the web app and choose one.');
    return 'not set up';
  }
  const names = [TEXTS_FOLDER].concat(s.services.map(x => x.folder));
  const [root] = listChildren_([s.folderId], false, s.lang);
  const found = root.filter(f => f.mimeType === FOLDER_MIME && names.indexOf(f.name) >= 0);
  const counts = listChildren_(found.map(f => f.id), false, s.lang).map((files, i) => found[i].name + ': ' + files.length);
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

/** Children of each folder, following nextPageToken so folders with more than 1,000 files are read in full. */
function listChildren_(folderIds, trashed, lang) {
  const M = MESSAGES[lang === 'ko' ? 'ko' : 'en'];
  const fields = 'nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,size,trashedTime,imageMediaMetadata(time,width,height))';
  const results = folderIds.map(() => []);
  let pending = folderIds.map((id, i) => ({ i: i, token: '', pages: 0 }));
  while (pending.length) {
    const responses = UrlFetchApp.fetchAll(pending.map(p => request_(DRIVE_API + '?pageSize=' + PAGE_SIZE +
      '&fields=' + encodeURIComponent(fields) +
      '&q=' + encodeURIComponent("'" + folderIds[p.i] + "' in parents and trashed=" + (trashed ? 'true' : 'false')) +
      '&includeItemsFromAllDrives=true&' + ALL_DRIVES + (p.token ? '&pageToken=' + encodeURIComponent(p.token) : ''))));
    const next = [];
    responses.forEach((res, j) => {
      const p = pending[j];
      if (res.getResponseCode() !== 200) {
        throw new Error(fill_(M.listFailed, { code: res.getResponseCode(), folder: folderIds[p.i], reason: driveError_(res) }));
      }
      const body = JSON.parse(res.getContentText());
      results[p.i] = results[p.i].concat(body.files || []);
      if (body.nextPageToken) {
        if (p.pages + 1 >= MAX_PAGES) throw new Error(fill_(M.tooManyPages, { max: PAGE_SIZE * MAX_PAGES }));
        next.push({ i: p.i, token: body.nextPageToken, pages: p.pages + 1 });
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
  } catch (e) {
    return res.getContentText().slice(0, 300);
  }
}

function readTexts_(files) {
  const cache = CacheService.getUserCache();
  const keys = files.map(f => 'md:' + f.id + ':' + f.modifiedTime);
  const found = keys.length ? cache.getAll(keys) : {};
  const missing = files.filter((f, i) => found[keys[i]] == null);
  for (let start = 0; start < missing.length; start += 40) {
    const chunk = missing.slice(start, start + 40);
    const responses = UrlFetchApp.fetchAll(chunk.map(f => request_(DRIVE_API + '/' + f.id + '?alt=media&' + ALL_DRIVES)));
    const toCache = {};
    responses.forEach((res, j) => {
      const key = 'md:' + chunk[j].id + ':' + chunk[j].modifiedTime;
      const text = res.getResponseCode() === 200 ? res.getContentText('UTF-8') : '';
      found[key] = text;
      if (text && Utilities.newBlob(text).getBytes().length < 95000) toCache[key] = text;
    });
    if (Object.keys(toCache).length) cache.putAll(toCache, CACHE_SECONDS);
  }
  return files.map((f, i) => found[keys[i]] || '');
}

function drawerFolders_(s) {
  const names = [TEXTS_FOLDER].concat(s.services.map(x => x.folder));
  const [root] = listChildren_([s.folderId], false, s.lang);
  const folders = {};
  root.filter(f => f.mimeType === FOLDER_MIME && names.indexOf(f.name) >= 0).forEach(f => { folders[f.name] = f.id; });
  return { names: names.filter(n => folders[n]), ids: folders, root: root };
}

/** The page's first call: everything in the drawer, with the text of every Markdown file. */
function getDrawer() {
  const s = settings_();
  const base = { lang: s.lang, title: s.title, owner: s.owner };
  if (!s.folderId) return Object.assign({ needsSetup: true, timeZone: s.timeZone }, base);
  const found = drawerFolders_(s);
  const listed = listChildren_(found.names.map(n => found.ids[n]), false, s.lang);
  const tree = {};
  const mdFiles = [];
  found.names.forEach((name, i) => {
    tree[name] = { files: [], images: {}, others: {} };
    listed[i].forEach(f => {
      if (f.mimeType === FOLDER_MIME || f.name.startsWith('_')) return;
      if (/^image\//.test(f.mimeType)) tree[name].images[f.name] = f.id;
      // A name with '__' belongs to a conversation as one of its files (even a .md); it is not an item of its own.
      else if (/\.md$/i.test(f.name) && f.name.indexOf('__') < 0) mdFiles.push({ folder: name, file: f });
      else tree[name].others[f.name] = f.id;
    });
  });
  const texts = readTexts_(mdFiles.map(m => m.file));
  mdFiles.forEach((m, i) => tree[m.folder].files.push({ id: m.file.id, name: m.file.name, text: texts[i] }));
  // Trash: files from these folders that are in the Drive trash (shown while Drive keeps them).
  const trashedLists = listChildren_(found.names.map(n => found.ids[n]), true, s.lang);
  const trashed = [];
  found.names.forEach((name, i) => trashedLists[i].forEach(f => { if (f.mimeType !== FOLDER_MIME) trashed.push({ folder: name, file: f }); }));
  const trashedMd = trashed.filter(t => /\.md$/i.test(t.file.name));
  const trashedTexts = readTexts_(trashedMd.map(t => t.file));
  tree.trash = trashed.map(t => {
    const k = trashedMd.indexOf(t);
    return { id: t.file.id, name: t.file.name, folder: t.folder, mimeType: t.file.mimeType, trashedTime: t.file.trashedTime || '', text: k >= 0 ? trashedTexts[k] : '' };
  });
  const now = new Date();
  return Object.assign(base, buildDrawer(tree, {
    lang: s.lang, owner: s.owner, services: s.services,
    today: Utilities.formatDate(now, s.timeZone, 'yyyy-MM-dd'), time: Utilities.formatDate(now, s.timeZone, 'HH:mm'),
  }));
}

function allowedFolderIds_(s) {
  const found = drawerFolders_(s);
  return found.names.map(n => found.ids[n]);
}

/** Photos load only when their item is opened, and only from the drawer's folders. */
function getImage(fileId) {
  const s = settings_();
  const M = MESSAGES[s.lang];
  if (!/^[\w-]{10,}$/.test(String(fileId))) throw new Error(M.badPhoto);
  const meta = UrlFetchApp.fetch(DRIVE_API + '/' + fileId + '?fields=mimeType,parents&' + ALL_DRIVES, auth_());
  if (meta.getResponseCode() !== 200) throw new Error(M.photoInfo);
  const info = JSON.parse(meta.getContentText());
  const allowed = allowedFolderIds_(s);
  if (!/^image\//.test(info.mimeType) || !(info.parents || []).some(p => allowed.indexOf(p) >= 0)) throw new Error(M.photoOutside);
  const res = UrlFetchApp.fetch(DRIVE_API + '/' + fileId + '?alt=media&' + ALL_DRIVES, auth_());
  if (res.getResponseCode() !== 200) throw new Error(M.photoRead);
  return 'data:' + info.mimeType + ';base64,' + Utilities.base64Encode(res.getContent());
}

/** "Move to trash": into the Drive trash (Google deletes it after 30 days). */
function trashItem(fileIds) { return setTrashed_(fileIds, true); }
/** Undo and restore: from the trash back to the original folder. */
function restoreItem(fileIds) { return setTrashed_(fileIds, false); }

function setTrashed_(fileIds, trashed) {
  const s = settings_();
  const M = MESSAGES[s.lang];
  if (!Array.isArray(fileIds) || !fileIds.length || fileIds.length > MAX_MOVE || fileIds.some(id => !/^[\w-]{10,}$/.test(String(id)))) {
    throw new Error(M.badFiles);
  }
  const allowed = allowedFolderIds_(s);
  // Check every file first, so that nothing moves unless all of them are inside the drawer.
  for (let start = 0; start < fileIds.length; start += 50) {
    const metas = UrlFetchApp.fetchAll(fileIds.slice(start, start + 50).map(id =>
      request_(DRIVE_API + '/' + id + '?fields=id,name,mimeType,parents&' + ALL_DRIVES)));
    metas.forEach(res => {
      if (res.getResponseCode() !== 200) throw new Error(fill_(M.fileInfo, { reason: driveError_(res) }));
      const info = JSON.parse(res.getContentText());
      const inDrawer = (info.parents || []).some(p => allowed.indexOf(p) >= 0);
      if (!inDrawer || info.mimeType === FOLDER_MIME) throw new Error(fill_(M.fileOutside, { name: info.name }));
    });
  }
  for (let start = 0; start < fileIds.length; start += 50) {
    const results = UrlFetchApp.fetchAll(fileIds.slice(start, start + 50).map(id => request_(DRIVE_API + '/' + id + '?fields=id,trashed&' + ALL_DRIVES, {
      method: 'patch', contentType: 'application/json', payload: JSON.stringify({ trashed: trashed }),
    })));
    results.forEach(res => {
      if (res.getResponseCode() !== 200) throw new Error(fill_(trashed ? M.trashFailed : M.restoreFailed, { reason: driveError_(res) }));
    });
  }
  return fileIds.length;
}

/* ---------- memos (sticky notes): all in one file, _memos.json in the drawer folder ---------- */
const MEMO_FILE = '_memos.json';
const MEMO_COLORS = ['butter', 'apricot', 'lilac'];
const MEMO_LIMIT = 100;

function memoFile_(s) {
  const [children] = listChildren_([s.folderId], false, s.lang);
  return children.find(f => f.name === MEMO_FILE && f.mimeType !== FOLDER_MIME) || null;
}

function cleanMemo_(m) {
  if (!m || typeof m !== 'object') return null;
  const num = (v, lo, hi, d) => { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  return {
    id: String(m.id || '').replace(/[^\w-]/g, '').slice(0, 40) || Utilities.getUuid(),
    text: String(m.text == null ? '' : m.text).slice(0, 5000),
    x: num(m.x, 0, 1, 0.7),
    y: num(m.y, 0, 20000, 80),
    color: MEMO_COLORS.indexOf(m.color) >= 0 ? m.color : 'butter',
    folded: !!m.folded,
    updated: String(m.updated || '').slice(0, 40),
  };
}

/** The memo list. If the file does not exist yet, memos is null (the page then adds a first memo). */
function getMemos() {
  const s = settings_();
  if (!s.folderId) return { memos: [], notSetUp: true, lang: s.lang };
  const M = MESSAGES[s.lang];
  const file = memoFile_(s);
  if (!file) return { memos: null, lang: s.lang };
  const res = UrlFetchApp.fetch(DRIVE_API + '/' + file.id + '?alt=media&' + ALL_DRIVES, auth_());
  if (res.getResponseCode() !== 200) throw new Error(fill_(M.memoRead, { reason: driveError_(res) }));
  let parsed;
  try { parsed = JSON.parse(res.getContentText('UTF-8')); } catch (e) { throw new Error(M.memoBroken); }
  const memos = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.memos) ? parsed.memos : []);
  return { memos: memos.map(cleanMemo_).filter(Boolean), savedAt: file.modifiedTime, lang: s.lang };
}

/** Save every memo at once (the last save wins). Creates or updates only _memos.json in the drawer folder. */
function saveMemos(memos) {
  const s = settings_();
  const M = MESSAGES[s.lang];
  if (!s.folderId) throw new Error(M.notSetUp);
  if (!Array.isArray(memos)) throw new Error(M.memoNotList);
  if (memos.length > MEMO_LIMIT) throw new Error(fill_(M.memoLimit, { max: MEMO_LIMIT }));
  const body = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), memos: memos.map(cleanMemo_).filter(Boolean) }, null, 2);
  const headers = auth_().headers;
  const file = memoFile_(s);
  let res;
  if (file) {
    res = UrlFetchApp.fetch(UPLOAD_API + '/' + file.id + '?uploadType=media&fields=id,modifiedTime&' + ALL_DRIVES, {
      method: 'patch', contentType: 'application/json; charset=UTF-8',
      payload: Utilities.newBlob(body).getBytes(), headers: headers, muteHttpExceptions: true,
    });
  } else {
    const boundary = 'drawer-memo-' + Date.now();
    const meta = JSON.stringify({ name: MEMO_FILE, parents: [s.folderId], mimeType: 'application/json' });
    const multipart = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
      '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + body + '\r\n--' + boundary + '--';
    res = UrlFetchApp.fetch(UPLOAD_API + '?uploadType=multipart&fields=id,modifiedTime&' + ALL_DRIVES, {
      method: 'post', contentType: 'multipart/related; boundary=' + boundary,
      payload: Utilities.newBlob(multipart).getBytes(), headers: headers, muteHttpExceptions: true,
    });
  }
  if (res.getResponseCode() >= 300) throw new Error(fill_(M.memoSave, { reason: driveError_(res) }));
  return { ok: true, savedAt: JSON.parse(res.getContentText()).modifiedTime || '' };
}

/* ---------- from here on, plain conversion with no Drive calls (also runs in the local preview) ---------- */

function buildDrawer(tree, opts) {
  opts = opts || {};
  const lang = opts.lang === 'ko' ? 'ko' : 'en';
  const ctx = { lang: lang, M: MESSAGES[lang], owner: str(opts.owner), services: opts.services || DEFAULT_SERVICES };
  const folder = name => tree[name] || { files: [], images: {}, others: {} };
  return {
    built: dateLabel(opts.today, lang) + (opts.time ? ' ' + opts.time : ''),
    services: ctx.services.map(s => s.label),
    groups: [{ key: TEXTS_FOLDER, label: ctx.M.texts, items: buildTexts(folder(TEXTS_FOLDER), ctx) }]
      .concat(ctx.services.map(s => ({ key: s.folder, label: s.label, items: buildChats(folder(s.folder), s, ctx) })))
      .concat([{ key: 'trash', label: ctx.M.trash, items: buildTrash(tree.trash || [], ctx) }]),
  };
}

function splitFrontmatter(src) {
  const text = String(src || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  return { meta: parseYaml(m[1]) || {}, body: m[2] };
}

/** As much YAML as the drawer needs: key-value, quoted strings, [lists], - lists, key-value inside lists, | blocks. */
function parseYaml(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  let i = 0;
  const indentOf = l => l.match(/^ */)[0].length;
  const isBlank = l => !l.trim() || /^\s*#/.test(l);
  const skip = () => { while (i < lines.length && isBlank(lines[i])) i++; };
  const isItem = l => /^\s*-(\s|$)/.test(l);
  function flow(s) {
    const out = []; let cur = '', quote = null;
    for (const c of s) {
      if (quote) { if (c === quote) quote = null; else cur += c; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ',') { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out.filter(Boolean);
  }
  function scalar(raw) {
    raw = raw.trim();
    if (!raw) return '';
    if (raw[0] === '"') {
      let out = '';
      for (let j = 1; j < raw.length; j++) {
        const c = raw[j];
        if (c === '\\') { const n = raw[++j]; out += n === 'n' ? '\n' : n === 't' ? '\t' : n; }
        else if (c === '"') break;
        else out += c;
      }
      return out;
    }
    if (raw[0] === "'") {
      let out = '';
      for (let j = 1; j < raw.length; j++) {
        if (raw[j] === "'") { if (raw[j + 1] === "'") { out += "'"; j++; } else break; }
        else out += raw[j];
      }
      return out;
    }
    if (raw[0] === '[') { const end = raw.lastIndexOf(']'); return flow(raw.slice(1, end > 0 ? end : raw.length)); }
    return raw.replace(/\s+#.*$/, '').trim();
  }
  function node(indent) {
    skip();
    if (i >= lines.length || indentOf(lines[i]) < indent) return '';
    return isItem(lines[i]) ? sequence(indentOf(lines[i])) : mapping(indentOf(lines[i]));
  }
  function sequence(ind) {
    const arr = [];
    while (true) {
      skip();
      if (i >= lines.length || indentOf(lines[i]) !== ind || !isItem(lines[i])) break;
      const rest = lines[i].slice(ind).replace(/^-\s?/, '');
      if (/^[^"'\[\s#][^:]*:(\s|$)/.test(rest)) { lines[i] = ' '.repeat(ind + 2) + rest; arr.push(mapping(ind + 2)); }
      else { i++; arr.push(scalar(rest)); }
    }
    return arr;
  }
  function mapping(ind) {
    const obj = {};
    while (true) {
      skip();
      if (i >= lines.length) break;
      const line = lines[i];
      const cur = indentOf(line);
      if (cur < ind || (cur === ind && isItem(line))) break;
      if (cur > ind) { i++; continue; }
      const m = line.slice(ind).match(/^([^:#][^:]*?):(?:[ \t]+(.*))?$/);
      if (!m) { i++; continue; }
      const key = m[1].trim(), rest = (m[2] || '').trim();
      i++;
      if (/^[|>][+-]?\s*(#.*)?$/.test(rest)) {
        const buf = []; let base = null;
        while (i < lines.length) {
          const l = lines[i];
          if (l.trim() && indentOf(l) <= ind) break;
          if (l.trim() && base === null) base = indentOf(l);
          buf.push(l); i++;
        }
        const text = buf.map(l => l.slice(Math.min(base || 0, indentOf(l)))).join('\n').replace(/\s+$/, '');
        obj[key] = rest[0] === '>' ? text.replace(/([^\n])\n(?!\n)/g, '$1 ') : text;
      } else if (rest === '' || rest[0] === '#') {
        const save = i; skip();
        const next = lines[i];
        if (next !== undefined && (indentOf(next) > ind || (indentOf(next) === ind && isItem(next)))) obj[key] = node(indentOf(next));
        else { i = save; obj[key] = ''; }
      } else {
        obj[key] = scalar(rest);
      }
    }
    return obj;
  }
  return node(0) || {};
}

function str(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(str).join(', ');
  return String(v).trim();
}
function list(v) {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  const s = str(v);
  return s ? [s] : [];
}
/** 2026-11-06 → "2026-11-06" in English, "2026. 11. 06." in Korean. A month alone stays a month. */
function dateLabel(v, lang) {
  const parts = str(v).slice(0, 10).split('-').filter(Boolean);
  if (!parts.length) return '';
  return lang === 'ko' ? parts.join('. ') + '.' : parts.join('-');
}
function sourceView(source, deleted, ctx) {
  source = str(source);
  if (str(deleted) || !source) return { label: '', url: '' };
  const m = source.match(/^https?:\/\/([^/]+)(\/[^?#]*)?/);
  if (!m) return { label: source, url: '' };
  const host = m[1], path = m[2] || '';
  let label = host.replace(/^www\./, '');
  if (host.indexOf('classroom.google.com') >= 0) label = ctx.M.classroom;
  else if (host.indexOf('docs.google.com') >= 0 && path.indexOf('/forms/') === 0) label = ctx.M.forms;
  return { label: label, url: source };
}
function imageView(folder, meta, title, ctx) {
  const name = str(meta.image).split('/').pop();
  if (!name || !folder.images[name]) return null;
  return { id: folder.images[name], alt: str(meta.image_alt) || fill_(ctx.M.photo, { title: title }) };
}
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** Writing (texts/): files with the same slug are one item, one body per language (name.ko.md, name.en.md). */
function buildTexts(folder, ctx) {
  const groups = {};
  const serviceLabels = ctx.services.map(s => s.label);
  folder.files.slice().sort(byName).forEach(f => {
    const { meta, body } = splitFrontmatter(f.text);
    const slug = str(meta.slug) || f.name.split('.')[0];
    const lang = str(meta.lang) || ctx.lang;
    const title = str(meta.title) || ctx.M.untitled;
    const entry = groups[slug] || (groups[slug] = {
      id: 'text-' + slug, kind: 'text', title: title,
      author: str(meta.author), publisher: str(meta.publisher), type: str(meta.type), status: str(meta.status),
      date: str(meta.date), tags: list(meta.tags), source: sourceView(meta.source, meta.source_deleted, ctx),
      rights: str(meta.rights), note: str(meta.note), image: null, bodies: {}, byLang: {}, fileIds: [],
      // Kept from an AI chat: when source is a service name, the item links to that conversation.
      service: serviceLabels.indexOf(str(meta.source)) >= 0 ? str(meta.source) : '',
      related: str(meta.related), relatedTitle: str(meta.related_title),
    });
    if (f.id) entry.fileIds.push(f.id);
    entry.bodies[lang] = body.trim().split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
    // Title, type, status and tags can differ by language; the reader shows the ones of the language being read.
    entry.byLang[lang] = { title: title, type: str(meta.type), status: str(meta.status), tags: list(meta.tags) };
    entry.image = entry.image || imageView(folder, meta, title, ctx);
  });
  return Object.keys(groups).map(k => groups[k]).sort(byDateDesc).map(e => {
    e.dateLabel = dateLabel(e.date, ctx.lang);
    e.langs = ['en', 'ko'].filter(l => e.bodies[l] !== undefined).concat(Object.keys(e.bodies).filter(l => l !== 'ko' && l !== 'en'));
    if (ctx.lang === 'ko') e.langs.sort((a, b) => (a === 'ko' ? -1 : b === 'ko' ? 1 : 0));
    const shown = e.byLang[ctx.lang] || e.byLang[e.langs[0]];
    e.title = shown.title;
    e.type = shown.type;
    e.status = shown.status;
    if (shown.tags.length) e.tags = shown.tags;
    e.own = e.author === '' || (ctx.owner !== '' && e.author === ctx.owner);
    e.sub = [e.own ? e.dateLabel : e.author, e.status || e.type, e.langs.length > 1 ? e.langs.map(l => l.toUpperCase()).join('/') : '']
      .filter(Boolean).join(' · ');
    return e;
  });
}

function chatUrlOk_(service, url) {
  if (!/^https:\/\//.test(url)) return false;
  if (!service.url) return true;
  try { return new RegExp(service.url).test(url); } catch (e) { return true; }
}

/** AI conversations: one .md per conversation, in the format AI Chat Archive writes. Only title and date matter; the rest shows when present. */
function buildChats(folder, service, ctx) {
  return folder.files.map(f => {
    const { meta, body } = splitFrontmatter(f.text);
    const stem = f.name.replace(/\.md$/i, '');
    const account = str(meta.account), chatNo = str(meta.chat_no), date = str(meta.date), category = str(meta.category);
    const assets = chatAssets(folder, meta.assets);
    // Moving a conversation to the trash takes only the files named after it (files shared with other conversations stay).
    const ownAssetIds = assets.filter(a => a.id && a.file.indexOf(stem + '__') === 0).map(a => a.id);
    const url = str(meta.chat_url);
    return {
      id: 'chat-' + service.folder + '-' + stem, file: f.name, kind: 'chat', service: service.label, folder: service.folder,
      title: str(meta.title) || stem, project: str(meta.project), account: account, chatNo: chatNo,
      chatUrl: chatUrlOk_(service, url) ? url : '',
      date: date, dateEnd: str(meta.date_end), dateLabel: dateLabel(date, ctx.lang), dateEndLabel: dateLabel(meta.date_end, ctx.lang),
      category: category, tags: list(meta.tags), authorship: str(meta.authorship), userTurns: str(meta.user_turns),
      missing: str(meta.missing), attachments: list(meta.attachments), aiOutputs: list(meta.ai_outputs),
      codeOutputs: list(meta.code_outputs), related: list(meta.related), overlaps: str(meta.overlaps),
      surveyMemo: str(meta.survey_memo), body: body.trim(), assets: assets,
      fileIds: (f.id ? [f.id] : []).concat(ownAssetIds),
      sub: [[account, chatNo && '#' + chatNo].filter(Boolean).join(' '), dateLabel(date, ctx.lang), category].filter(Boolean).join(' · '),
    };
  }).sort((a, b) => byDateDesc(a, b) || (a.id < b.id ? -1 : 1));
}

/** The assets list in the frontmatter, joined to the real files in the same folder. Images show in place; other files open in Drive. */
function chatAssets(folder, items) {
  return (Array.isArray(items) ? items : []).map(a => {
    if (!a || typeof a !== 'object') return null;
    const name = str(a.file).split('/').pop();
    if (!name) return null;
    const imageId = (folder.images || {})[name];
    const otherId = (folder.others || {})[name];
    const id = imageId || otherId || '';
    return {
      file: name, id: id, image: !!imageId, found: !!id, title: str(a.title) || name, alt: str(a.alt) || str(a.title) || name,
      kind: str(a.kind), origin: str(a.origin), turn: str(a.turn), sizeKb: str(a.size_kb),
      url: otherId ? 'https://drive.google.com/file/d/' + otherId + '/view' : '',
    };
  }).filter(Boolean);
}

/** Trash: a conversation and its files, or a text in all its languages, come back as one item. */
function buildTrash(files, ctx) {
  const chatFolders = ctx.services.map(s => s.folder);
  const folderLabel = name => (name === TEXTS_FOLDER ? ctx.M.texts : ((ctx.services.find(s => s.folder === name) || {}).label || name));
  const byKey = {}, out = [];
  files.forEach(f => {
    const md = /\.md$/i.test(f.name);
    const meta = md ? splitFrontmatter(f.text).meta : {};
    const stem = f.name.replace(/\.md$/i, '');
    let key = 'file:' + f.id, restoreId = '';
    if (f.folder === TEXTS_FOLDER && md) {
      const slug = str(meta.slug) || f.name.split('.')[0];
      key = 'texts:' + slug; restoreId = 'text-' + slug;
    } else if (chatFolders.indexOf(f.folder) >= 0) {
      const base = md && f.name.indexOf('__') < 0 ? stem : (f.name.indexOf('__') > 0 ? f.name.split('__')[0] : '');
      if (base) { key = f.folder + ':' + base; restoreId = 'chat-' + f.folder + '-' + base; }
    }
    const when = str(f.trashedTime);
    let item = byKey[key];
    if (!item) {
      item = byKey[key] = {
        id: 'trash-' + f.id, kind: 'trash', title: '', fileName: f.name, folder: f.folder, folderLabel: folderLabel(f.folder),
        trashedTime: when, fileIds: [], restoreId: restoreId, hasMd: false,
      };
      out.push(item);
    }
    item.fileIds.push(f.id);
    if (md && f.name.indexOf('__') < 0 && !item.hasMd) { item.hasMd = true; item.fileName = f.name; item.title = str(meta.title); }
    if (when > item.trashedTime) item.trashedTime = when;
  });
  return out.map(t => {
    const label = dateLabel(t.trashedTime.slice(0, 10), ctx.lang);
    t.title = t.title || t.fileName;
    t.trashedLabel = label;
    t.fileCount = t.fileIds.length;
    t.sub = [t.folderLabel, label ? fill_(ctx.M.deleted, { date: label }) : ''].filter(Boolean).join(' · ');
    delete t.hasMd;
    return t;
  }).sort((a, b) => (a.trashedTime < b.trashedTime ? 1 : a.trashedTime > b.trashedTime ? -1 : 0));
}

if (typeof module !== 'undefined') module.exports = { buildDrawer, parseYaml, splitFrontmatter, parseServices, folderIdFrom, dateLabel, MESSAGES };
