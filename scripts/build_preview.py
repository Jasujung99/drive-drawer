#!/usr/bin/env python3
"""Build a local preview of Drive Drawer from a folder on this computer, with no Google account and no network.

  python build_preview.py --drawer ../examples/sample-drive --out preview.html
  python build_preview.py --drawer "<synced drawer folder>" --out drawer-preview.html --lang ko --owner "Your name"
  python build_preview.py --selftest --out selftest.html

The preview runs the real template (Code.gs conversion and Index.html) in the browser, with google.script.run
replaced by an in-memory stand-in: moving to the trash, restoring, and memos work but save nothing.
The self-test page checks paging past 1,000 files, trash batching, settings, and format parsing with fake Drive answers.

Standard library only. Reads only the folder you name and the template, writes only the --out file and never overwrites
it. A preview of a real folder contains that folder's text, so keep the file private.
"""

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
SKILL = HERE.parent
DEFAULT_SERVICES = [
    {"folder": "chatgpt", "label": "ChatGPT", "url": "^https://(chatgpt\\.com|chat\\.openai\\.com)/"},
    {"folder": "claude", "label": "Claude", "url": "^https://claude\\.ai/"},
    {"folder": "gemini", "label": "Gemini", "url": "^https://gemini\\.google\\.com/"},
    {"folder": "grok", "label": "Grok", "url": "^https://(www\\.)?grok\\.com/"},
]
IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
               ".webp": "image/webp", ".svg": "image/svg+xml", ".heic": "image/heic", ".heif": "image/heif"}
MAX_IMAGE = 8 * 1024 * 1024


def kept_as_is(byte):
    """ASCII letters, digits and -_.~ appear as themselves in a percent-encoded data: address."""
    char = chr(byte)
    return byte < 128 and (char.isalnum() or char in "-_.~")


# Each byte of a picture as it appears in a percent-encoded data: address.
BYTE_TEXT = [chr(byte) if kept_as_is(byte) else "%%%02X" % byte for byte in range(256)]


def data_address(mime, data):
    """A picture turned into a data: address that the page shows directly, in plain percent-encoding."""
    return "data:%s,%s" % (mime, "".join(BYTE_TEXT[byte] for byte in data))


def read_drawer(folder, services):
    """The drawer folder as the tree Code.gs builds from Drive: md text, pictures, and other files per folder."""
    tree, images, notes, count = {}, {}, [], 0
    for name in ["texts"] + [service["folder"] for service in services]:
        sub = folder / name
        if not sub.is_dir():
            continue
        node = {"files": [], "images": {}, "others": {}}
        for path in sorted(sub.iterdir()):
            if not path.is_file() or path.name.startswith("_"):
                continue
            count += 1
            file_id = "preview-%05d" % count
            ext = path.suffix.lower()
            if ext in IMAGE_TYPES:
                node["images"][path.name] = file_id
                if path.stat().st_size <= MAX_IMAGE:
                    images[file_id] = data_address(IMAGE_TYPES[ext], path.read_bytes())
                else:
                    notes.append("picture over 8 MB left out of the preview: %s/%s" % (name, path.name))
            elif ext == ".md" and "__" not in path.name:
                node["files"].append({"id": file_id, "name": path.name, "text": path.read_text(encoding="utf-8", errors="replace")})
            else:
                node["others"][path.name] = file_id
        tree[name] = node
    memos = None
    memo_path = folder / "_memos.json"
    if memo_path.is_file():
        try:
            data = json.loads(memo_path.read_text(encoding="utf-8"))
            memos = data.get("memos") if isinstance(data, dict) else data
        except ValueError:
            notes.append("_memos.json is not valid JSON; the preview starts without memos")
    return tree, images, memos, notes


def script_json(value):
    """JSON that is safe inside a <script> element."""
    return json.dumps(value, ensure_ascii=False).replace("</", "<\\/")


MOCK = r"""
(function () {
  const FIX = __FIXTURE__;
  const settings = FIX.settings;
  const trash = [];
  let memos = FIX.memos;
  const stamp = () => {
    const now = new Date(), pad = num => String(num).padStart(2, '0');
    return { date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()), time: pad(now.getHours()) + ':' + pad(now.getMinutes()) };
  };
  function take(id) {
    for (const folder of Object.keys(FIX.tree)) {
      const node = FIX.tree[folder];
      const index = node.files.findIndex(file => file.id === id);
      if (index >= 0) {
        const file = node.files.splice(index, 1)[0];
        return { folder, kind: 'files', item: file, entry: { id, name: file.name, folder, mimeType: 'text/markdown', text: file.text } };
      }
      for (const kind of ['images', 'others']) {
        const name = Object.keys(node[kind]).find(key => node[kind][key] === id);
        if (name) {
          delete node[kind][name];
          return { folder, kind, name, entry: { id, name, folder, mimeType: kind === 'images' ? 'image/*' : 'application/octet-stream', text: '' } };
        }
      }
    }
    return null;
  }
  function put(taken) {
    const node = FIX.tree[taken.folder];
    if (taken.kind === 'files') node.files.push(taken.item); else node[taken.kind][taken.name] = taken.entry.id;
  }
  const API = {
    getDrawer() {
      if (settings.needsSetup) return { needsSetup: true, lang: settings.lang, title: settings.title, owner: settings.owner, timeZone: '' };
      const tree = JSON.parse(JSON.stringify(FIX.tree));
      tree.trash = trash.map(taken => taken.entry);
      const now = stamp();
      const built = buildDrawer(tree, { lang: settings.lang, owner: settings.owner, services: settings.services, today: now.date, time: now.time });
      return Object.assign({ lang: settings.lang, title: settings.title || MESSAGES[settings.lang].defaultTitle, owner: settings.owner }, built);
    },
    getImage(id) {
      if (!FIX.images[id]) throw new Error('This picture is not in the preview.');
      return FIX.images[id];
    },
    trashItem(ids) {
      const when = new Date().toISOString();
      ids.forEach(id => { const taken = take(id); if (taken) { taken.entry.trashedTime = when; trash.push(taken); } });
      return ids.length;
    },
    restoreItem(ids) {
      ids.forEach(id => { const index = trash.findIndex(taken => taken.entry.id === id); if (index >= 0) put(trash.splice(index, 1)[0]); });
      return ids.length;
    },
    getMemos() { return settings.needsSetup ? { memos: [], notSetUp: true, lang: settings.lang } : { memos: memos, lang: settings.lang }; },
    saveMemos(list) { memos = JSON.parse(JSON.stringify(list)); return { ok: true }; },
    getSettings() {
      return { folderId: 'preview-folder', folderName: FIX.folderName, title: settings.title, owner: settings.owner,
        lang: settings.lang, timeZone: '', services: settings.services.map(svc => svc.label) };
    },
    saveSettings(input) {
      if (!String(input.folder || '').trim()) throw new Error(MESSAGES[input.lang === 'ko' ? 'ko' : 'en'].folderMissing);
      settings.needsSetup = false;
      settings.lang = input.lang === 'ko' ? 'ko' : 'en';
      settings.title = String(input.title || '');
      settings.owner = String(input.owner || '');
      return { ok: true, folderName: FIX.folderName };
    },
  };
  // Like google.script.run: the answer arrives later, never inside the call itself.
  function runner(onSuccess, onFailure) {
    return new Proxy({}, {
      get(target, prop) {
        if (prop === 'withSuccessHandler') return handler => runner(handler, onFailure);
        if (prop === 'withFailureHandler') return handler => runner(onSuccess, handler);
        return arg => {
          Promise.resolve().then(() => {
            let result;
            try { result = API[prop](arg); } catch (err) { if (onFailure) onFailure(err); return; }
            if (onSuccess) onSuccess(result);
          });
        };
      },
    });
  }
  window.google = { script: { run: runner(null, null) } };
})();
"""

BADGE = ('<div style="position:fixed;left:12px;bottom:12px;z-index:50;padding:5px 10px;border-radius:999px;'
         'background:#2a2330;color:#fcfbfd;font:12px/1.4 system-ui,sans-serif;opacity:.85">'
         'Local preview · nothing is saved</div>')

SELFTEST = r"""
(function () {
  const results = [];
  const check = (name, ok, detail) => results.push({ name: name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  const attempt = (name, fn) => { try { fn(); } catch (err) { results.push({ name: name, ok: false, detail: 'threw: ' + (err && err.message) }); } };

  /* Fake Apps Script services and a fake Drive. */
  let props = {};
  globalThis.PropertiesService = { getScriptProperties: () => ({
    getProperties: () => Object.assign({}, props),
    setProperty: (name, value) => { props[name] = String(value); },
    deleteProperty: name => { delete props[name]; },
  }) };
  globalThis.Session = { getScriptTimeZone: () => 'Etc/UTC' };
  globalThis.ScriptApp = { getOAuthToken: () => 'test' };
  const drive = {};
  const addFile = (id, name, mimeType, parent) => { drive[id] = { id: id, name: name, mimeType: mimeType, parents: [parent], trashed: false }; };
  addFile('ROOTFOLDER01', 'Drawer', 'application/vnd.google-apps.folder', 'MYDRIVEROOT0');
  addFile('TEXTSFOLDER1', 'texts', 'application/vnd.google-apps.folder', 'ROOTFOLDER01');
  addFile('CHATGPTFOLD1', 'chatgpt', 'application/vnd.google-apps.folder', 'ROOTFOLDER01');
  addFile('OTHERFOLDER1', 'notes-elsewhere', 'application/vnd.google-apps.folder', 'ROOTFOLDER01');
  for (let index = 0; index < 2345; index++) addFile('CGPFILE' + String(index).padStart(7, '0'), 'chat-' + index + '.md', 'text/markdown', 'CHATGPTFOLD1');
  for (let index = 0; index < 10; index++) addFile('TXTFILE' + String(index).padStart(7, '0'), 'text-' + index + '.en.md', 'text/markdown', 'TEXTSFOLDER1');
  addFile('OUTSIDEFILE01', 'elsewhere.md', 'text/markdown', 'SOMEWHERE0001');
  const log = [];
  const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body), getAllHeaders: () => ({}) });
  function respond(request) {
    log.push(request);
    const url = String(request.url);
    const query = {};
    (url.split('?')[1] || '').split('&').forEach(pair => { const parts = pair.split('='); query[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || ''); });
    const path = url.split('?')[0];
    if (path === DRIVE_API) {
      const match = query.q.match(/^'([^']+)' in parents and trashed=(true|false)$/);
      const all = Object.values(drive).filter(file => file.parents.indexOf(match[1]) >= 0 && String(file.trashed) === match[2]);
      const offset = Number(query.pageToken || 0), size = Number(query.pageSize);
      const page = all.slice(offset, offset + size).map(file => ({ id: file.id, name: file.name, mimeType: file.mimeType }));
      return reply(200, offset + size < all.length ? { files: page, nextPageToken: String(offset + size) } : { files: page });
    }
    const id = path.slice(DRIVE_API.length + 1);
    const file = drive[id];
    if (!file) return reply(404, { error: { status: 'NOT_FOUND', message: 'File not found' } });
    if (request.method === 'patch') { file.trashed = JSON.parse(request.payload).trashed; return reply(200, { id: file.id, trashed: file.trashed }); }
    return reply(200, { id: file.id, name: file.name, mimeType: file.mimeType, parents: file.parents, trashed: file.trashed });
  }
  // The template sends every request through fetchAll, one at a time or in batches.
  globalThis.UrlFetchApp = { fetchAll: requests => requests.map(respond) };

  attempt('paging reads every file past 1,000 in each folder', () => {
    log.length = 0;
    const lists = listChildren_(['CHATGPTFOLD1', 'TEXTSFOLDER1'], false, 'en');
    const listCalls = log.filter(entry => String(entry.url).indexOf(DRIVE_API + '?') === 0).length;
    check('paging reads every file past 1,000 in each folder', lists[0].length === 2345 && lists[1].length === 10 && listCalls === 4,
      lists[0].length + ' and ' + lists[1].length + ' files in ' + listCalls + ' list calls');
  });

  props = { DRAWER_FOLDER_ID: 'ROOTFOLDER01' };
  attempt('trash checks every file before moving any, in batches', () => {
    log.length = 0;
    const ids = Object.keys(drive).filter(id => id.indexOf('CGPFILE') === 0).slice(0, 120);
    const moved = setTrashed_(ids, true);
    const patches = log.map((entry, index) => [entry, index]).filter(pair => pair[0].method === 'patch');
    const lastCheck = Math.max.apply(null, log.map((entry, index) => (entry.method !== 'patch' && String(entry.url).indexOf(DRIVE_API + '/') === 0 ? index : -1)));
    check('trash checks every file before moving any, in batches', moved === 120 && patches.length === 120 && patches[0][1] > lastCheck,
      moved + ' moved, ' + patches.length + ' patches');
    setTrashed_(ids, false);
    check('restore puts the files back', ids.every(id => drive[id].trashed === false));
  });
  attempt('a file outside the drawer stops the whole move', () => {
    log.length = 0;
    let threw = '';
    try { setTrashed_(['CGPFILE0000001', 'OUTSIDEFILE01'], true); } catch (err) { threw = err.message; }
    check('a file outside the drawer stops the whole move', threw && !log.some(entry => entry.method === 'patch') && drive.CGPFILE0000001.trashed === false, threw);
  });
  attempt('more than 500 files at once is refused', () => {
    let threw = '';
    try { setTrashed_(new Array(501).fill('CGPFILE0000001'), true); } catch (err) { threw = err.message; }
    check('more than 500 files at once is refused', threw === MESSAGES.en.badFiles, threw);
  });

  attempt('folder links and ids are recognised', () => {
    const cases = {
      'https://drive.google.com/drive/folders/ABCdef12345_-x?usp=sharing': 'ABCdef12345_-x',
      'https://drive.google.com/drive/u/1/folders/ABCdef12345_-x': 'ABCdef12345_-x',
      'https://drive.google.com/open?id=ABCdef12345_-x': 'ABCdef12345_-x',
      'ABCdef12345_-x': 'ABCdef12345_-x', 'not a link': '', '': '',
    };
    const bad = Object.keys(cases).filter(link => folderIdFrom(link) !== cases[link]);
    check('folder links and ids are recognised', !bad.length, bad.join(' | '));
  });
  attempt('the setup screen saves settings for a folder only', () => {
    props = {};
    const res = saveSettings({ folder: 'https://drive.google.com/drive/folders/ROOTFOLDER01', title: '  My   drawer ', owner: 'Sam', lang: 'ko', timeZone: 'Asia/Seoul' });
    const cfg = settings_();
    let threw = '';
    try { saveSettings({ folder: 'CGPFILE0000001', lang: 'en' }); } catch (err) { threw = err.message; }
    check('the setup screen saves settings for a folder only', res.ok && cfg.folderId === 'ROOTFOLDER01' && cfg.title === 'My drawer' && cfg.lang === 'ko' &&
      cfg.owner === 'Sam' && cfg.timeZone === 'Asia/Seoul' && threw === MESSAGES.en.notAFolder, JSON.stringify(cfg.folderId + ' ' + cfg.title + ' ' + threw));
  });
  attempt('service lists fall back to the defaults when invalid', () => {
    const custom = parseServices('[{"folder":"perplexity","label":"Perplexity"},{"folder":"texts","label":"No"},{"folder":"Bad Name","label":"x"}]');
    check('service lists fall back to the defaults when invalid', parseServices('').length === 4 && parseServices('{oops').length === 4 &&
      custom.length === 1 && custom[0].folder === 'perplexity', custom.map(svc => svc.folder).join(','));
  });
  attempt('dates read in both languages', () => {
    check('dates read in both languages', dateLabel('2026-11-06', 'ko') === '2026. 11. 06.' && dateLabel('2026-11-06', 'en') === '2026-11-06' &&
      dateLabel('2026-11', 'en') === '2026-11' && dateLabel('', 'en') === '');
  });
  attempt('AI Chat Archive frontmatter parses, files included', () => {
    const fm = splitFrontmatter('---\ntitle: "A: b"\ntags: [x, "y z"]\nuser_turns: 4\nassets:\n  - file: "c__01-a.svg"\n    kind: "image"\n    size_kb: 3\n  - file: "c__02-b.txt"\n---\nBody').meta;
    check('AI Chat Archive frontmatter parses, files included', fm.title === 'A: b' && fm.tags.join('|') === 'x|y z' && fm.assets.length === 2 &&
      fm.assets[0].size_kb === '3' && fm.assets[1].file === 'c__02-b.txt', JSON.stringify(fm.assets));
  });
  attempt('the drawer groups writing, conversations, files and trash', () => {
    const tree = {
      texts: { files: [
        { id: 'T1xxxxxxxxx', name: '2026-03-walk.en.md', text: '---\ntitle: "Walk"\nslug: walk\nlang: en\ndate: 2026-03-14\n---\nEnglish' },
        { id: 'T2xxxxxxxxx', name: '2026-03-walk.ko.md', text: '---\ntitle: "산책"\nslug: walk\nlang: ko\ndate: 2026-03-14\n---\n한국어' },
      ], images: {}, others: {} },
      chatgpt: { files: [
        { id: 'C1xxxxxxxxx', name: 'chat-1.md', text: '---\ntitle: "Chat"\ndate: 2025-04-10\nchat_url: "https://chatgpt.com/c/sample-0001"\nassets:\n  - file: "chat-1__01-a.svg"\n  - file: "chat-1__02-b.txt"\n  - file: "chat-1__03-gone.png"\n---\nHi' },
        { id: 'C2xxxxxxxxx', name: 'chat-2.md', text: '---\ntitle: "Other"\ndate: 2025-04-11\nchat_url: "https://other.example.com/c/1"\n---\nHi' },
      ], images: { 'chat-1__01-a.svg': 'I1xxxxxxxxx' }, others: { 'chat-1__02-b.txt': 'O1xxxxxxxxx' } },
      trash: [
        { id: 'X1xxxxxxxxx', name: 'old.md', folder: 'chatgpt', trashedTime: '2026-11-01T10:00:00Z', text: '---\ntitle: "Old chat"\n---\n' },
        { id: 'X2xxxxxxxxx', name: 'old__01-pic.png', folder: 'chatgpt', trashedTime: '2026-11-01T10:00:01Z', text: '' },
        { id: 'X3xxxxxxxxx', name: 'old__02-notes.txt', folder: 'chatgpt', trashedTime: '2026-11-01T10:00:01Z', text: '' },
      ],
    };
    const drawer = buildDrawer(tree, { lang: 'en', owner: '', services: DEFAULT_SERVICES, today: '2026-11-06', time: '09:00' });
    const groups = {}; drawer.groups.forEach(group => { groups[group.key] = group.items; });
    const chat = groups.chatgpt.find(item => item.file === 'chat-1.md'), other = groups.chatgpt.find(item => item.file === 'chat-2.md');
    check('the drawer groups writing, conversations, files and trash',
      drawer.groups.map(group => group.key).join(',') === 'texts,chatgpt,claude,gemini,grok,trash' &&
      groups.texts.length === 1 && groups.texts[0].langs.join(',') === 'en,ko' && groups.texts[0].own &&
      chat.assets.filter(asset => asset.found).length === 2 && chat.fileIds.length === 3 && chat.chatUrl && other.chatUrl === '' &&
      groups.trash.length === 1 && groups.trash[0].fileIds.length === 3 && groups.trash[0].restoreId === 'chat-chatgpt-old' && groups.trash[0].title === 'Old chat',
      JSON.stringify({ texts: groups.texts.length, assets: chat.assets.length, ids: chat.fileIds.length, trash: groups.trash.length }));
    const ko = buildDrawer(tree, { lang: 'ko', owner: '', services: DEFAULT_SERVICES, today: '2026-11-06', time: '09:00' });
    const kt = ko.groups[0].items[0];
    check('a text shows the title of the drawer language', kt.title === '산책' && kt.langs[0] === 'ko' && kt.byLang.en.title === 'Walk' &&
      ko.groups[0].label === '글' && ko.built === '2026. 11. 06. 09:00', kt.title + ' ' + kt.langs.join(','));
  });

  const passed = results.filter(entry => entry.ok).length;
  const out = document.getElementById('results');
  out.textContent = 'SELFTEST ' + passed + '/' + results.length + '\n' + JSON.stringify(results, null, 1);
})();
"""


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--drawer", default=str(SKILL / "examples" / "sample-drive"), help="drawer folder on this computer")
    parser.add_argument("--template", default=str(SKILL / "template"), help="folder with Code.gs and Index.html")
    parser.add_argument("--out", required=True, help="HTML file to write; must not exist yet")
    parser.add_argument("--lang", choices=("en", "ko"), default="en")
    parser.add_argument("--title", default="")
    parser.add_argument("--owner", default="")
    parser.add_argument("--services", default="", help="JSON list like DRAWER_SERVICES (default: the four services)")
    parser.add_argument("--no-badge", action="store_true", help="leave out the 'Local preview' label (for screenshots)")
    parser.add_argument("--setup", action="store_true", help="open on the first-visit setup screen")
    parser.add_argument("--selftest", action="store_true", help="write the self-test page instead of a preview")
    args = parser.parse_args(argv)

    out = pathlib.Path(args.out)
    if out.exists():
        raise SystemExit("%s already exists; choose a new file name." % out)
    template = pathlib.Path(args.template)
    code = (template / "Code.gs").read_text(encoding="utf-8")
    if "</script" in code.lower():
        raise SystemExit("Code.gs contains '</script'; it cannot be inlined.")

    if args.selftest:
        page = ("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Drive Drawer self-test</title></head>"
                "<body><pre id=\"results\">running</pre>\n<script>\n" + code + "\n</script>\n<script>\n" + SELFTEST +
                "\n</script></body></html>\n")
        with open(out, "x", encoding="utf-8", newline="\n") as handle:
            handle.write(page)
        print("Wrote %s" % out)
        return

    services = DEFAULT_SERVICES
    if args.services:
        try:
            services = json.loads(args.services)
        except ValueError:
            raise SystemExit("--services is not valid JSON.")
    drawer = pathlib.Path(args.drawer)
    if not drawer.is_dir():
        raise SystemExit("Drawer folder not found: %s" % drawer)
    tree, images, memos, notes = read_drawer(drawer, services)
    fixture = {"tree": tree, "images": images, "memos": memos, "folderName": drawer.name,
               "settings": {"lang": args.lang, "title": args.title, "owner": args.owner, "services": services,
                            "needsSetup": args.setup}}
    index = (template / "Index.html").read_text(encoding="utf-8")
    marker = "<script>"
    at = index.find(marker)
    if at < 0:
        raise SystemExit("Index.html has no <script> element.")
    inject = "<script>\n" + code + "\n</script>\n<script>\n" + MOCK.replace("__FIXTURE__", script_json(fixture)) + "\n</script>\n"
    page = index[:at] + inject + index[at:]
    if not args.no_badge:
        page = page.replace("</body>", BADGE + "\n</body>", 1)
    with open(out, "x", encoding="utf-8", newline="\n") as handle:
        handle.write(page)
    counts = ", ".join("%s %d" % (name, len(node["files"])) for name, node in tree.items()) or "no drawer folders found"
    print("Wrote %s (%s; %d picture(s))" % (out, counts, len(images)))
    for note in notes:
        print("note: " + note, file=sys.stderr)


if __name__ == "__main__":
    main()
