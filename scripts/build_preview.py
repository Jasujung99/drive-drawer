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
import base64
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


def read_drawer(folder, services):
    """The drawer folder as the tree Code.gs builds from Drive: md text, pictures, and other files per folder."""
    tree, images, notes, n = {}, {}, [], 0
    for name in ["texts"] + [s["folder"] for s in services]:
        sub = folder / name
        if not sub.is_dir():
            continue
        node = {"files": [], "images": {}, "others": {}}
        for path in sorted(sub.iterdir()):
            if not path.is_file() or path.name.startswith("_"):
                continue
            n += 1
            file_id = "preview-%05d" % n
            ext = path.suffix.lower()
            if ext in IMAGE_TYPES:
                node["images"][path.name] = file_id
                if path.stat().st_size <= MAX_IMAGE:
                    images[file_id] = "data:%s;base64,%s" % (IMAGE_TYPES[ext], base64.b64encode(path.read_bytes()).decode("ascii"))
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
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return { date: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()), time: p(d.getHours()) + ':' + p(d.getMinutes()) };
  };
  function take(id) {
    for (const folder of Object.keys(FIX.tree)) {
      const node = FIX.tree[folder];
      const i = node.files.findIndex(f => f.id === id);
      if (i >= 0) {
        const f = node.files.splice(i, 1)[0];
        return { folder, kind: 'files', item: f, entry: { id, name: f.name, folder, mimeType: 'text/markdown', text: f.text } };
      }
      for (const kind of ['images', 'others']) {
        const name = Object.keys(node[kind]).find(k => node[kind][k] === id);
        if (name) {
          delete node[kind][name];
          return { folder, kind, name, entry: { id, name, folder, mimeType: kind === 'images' ? 'image/*' : 'application/octet-stream', text: '' } };
        }
      }
    }
    return null;
  }
  function put(t) {
    const node = FIX.tree[t.folder];
    if (t.kind === 'files') node.files.push(t.item); else node[t.kind][t.name] = t.entry.id;
  }
  const API = {
    getDrawer() {
      if (settings.needsSetup) return { needsSetup: true, lang: settings.lang, title: settings.title, owner: settings.owner, timeZone: '' };
      const tree = JSON.parse(JSON.stringify(FIX.tree));
      tree.trash = trash.map(t => t.entry);
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
      ids.forEach(id => { const t = take(id); if (t) { t.entry.trashedTime = when; trash.push(t); } });
      return ids.length;
    },
    restoreItem(ids) {
      ids.forEach(id => { const k = trash.findIndex(t => t.entry.id === id); if (k >= 0) put(trash.splice(k, 1)[0]); });
      return ids.length;
    },
    getMemos() { return settings.needsSetup ? { memos: [], notSetUp: true, lang: settings.lang } : { memos: memos, lang: settings.lang }; },
    saveMemos(list) { memos = JSON.parse(JSON.stringify(list)); return { ok: true }; },
    getSettings() {
      return { folderId: 'preview-folder', folderName: FIX.folderName, title: settings.title, owner: settings.owner,
        lang: settings.lang, timeZone: '', services: settings.services.map(s => s.label) };
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
  function runner(ok, fail) {
    return new Proxy({}, {
      get(_, prop) {
        if (prop === 'withSuccessHandler') return f => runner(f, fail);
        if (prop === 'withFailureHandler') return f => runner(ok, f);
        return arg => setTimeout(() => {
          let result;
          try { result = API[prop](arg); } catch (e) { if (fail) fail(e); return; }
          if (ok) ok(result);
        }, 40);
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
  const attempt = (name, fn) => { try { fn(); } catch (e) { results.push({ name: name, ok: false, detail: 'threw: ' + (e && e.message) }); } };

  /* Fake Apps Script services and a fake Drive. */
  let props = {};
  globalThis.PropertiesService = { getScriptProperties: () => ({
    getProperties: () => Object.assign({}, props),
    setProperty: (k, v) => { props[k] = String(v); },
    deleteProperty: k => { delete props[k]; },
  }) };
  globalThis.Session = { getScriptTimeZone: () => 'Etc/UTC' };
  globalThis.ScriptApp = { getOAuthToken: () => 'token' };
  const drive = {};
  const addFile = (id, name, mimeType, parent) => { drive[id] = { id: id, name: name, mimeType: mimeType, parents: [parent], trashed: false }; };
  addFile('ROOTFOLDER01', 'Drawer', 'application/vnd.google-apps.folder', 'MYDRIVEROOT0');
  addFile('TEXTSFOLDER1', 'texts', 'application/vnd.google-apps.folder', 'ROOTFOLDER01');
  addFile('CHATGPTFOLD1', 'chatgpt', 'application/vnd.google-apps.folder', 'ROOTFOLDER01');
  addFile('OTHERFOLDER1', 'notes-elsewhere', 'application/vnd.google-apps.folder', 'ROOTFOLDER01');
  for (let i = 0; i < 2345; i++) addFile('CGPFILE' + String(i).padStart(7, '0'), 'chat-' + i + '.md', 'text/markdown', 'CHATGPTFOLD1');
  for (let i = 0; i < 10; i++) addFile('TXTFILE' + String(i).padStart(7, '0'), 'text-' + i + '.en.md', 'text/markdown', 'TEXTSFOLDER1');
  addFile('OUTSIDEFILE01', 'elsewhere.md', 'text/markdown', 'SOMEWHERE0001');
  const log = [];
  const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body), getAllHeaders: () => ({}) });
  function respond(r) {
    log.push(r);
    const url = String(r.url);
    const query = {};
    (url.split('?')[1] || '').split('&').forEach(kv => { const p = kv.split('='); query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    const path = url.split('?')[0];
    if (path === DRIVE_API) {
      const m = query.q.match(/^'([^']+)' in parents and trashed=(true|false)$/);
      const all = Object.values(drive).filter(f => f.parents.indexOf(m[1]) >= 0 && String(f.trashed) === m[2]);
      const offset = Number(query.pageToken || 0), size = Number(query.pageSize);
      const page = all.slice(offset, offset + size).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType }));
      return reply(200, offset + size < all.length ? { files: page, nextPageToken: String(offset + size) } : { files: page });
    }
    const id = path.slice(DRIVE_API.length + 1);
    const f = drive[id];
    if (!f) return reply(404, { error: { status: 'NOT_FOUND', message: 'File not found' } });
    if (r.method === 'patch') { f.trashed = JSON.parse(r.payload).trashed; return reply(200, { id: f.id, trashed: f.trashed }); }
    return reply(200, { id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents, trashed: f.trashed });
  }
  globalThis.UrlFetchApp = { fetchAll: rs => rs.map(respond), fetch: (url, params) => respond(Object.assign({ url: url }, params || {})) };

  attempt('paging reads every file past 1,000 in each folder', () => {
    log.length = 0;
    const lists = listChildren_(['CHATGPTFOLD1', 'TEXTSFOLDER1'], false, 'en');
    const listCalls = log.filter(r => String(r.url).indexOf(DRIVE_API + '?') === 0).length;
    check('paging reads every file past 1,000 in each folder', lists[0].length === 2345 && lists[1].length === 10 && listCalls === 4,
      lists[0].length + ' and ' + lists[1].length + ' files in ' + listCalls + ' list calls');
  });

  props = { DRAWER_FOLDER_ID: 'ROOTFOLDER01' };
  attempt('trash checks every file before moving any, in batches', () => {
    log.length = 0;
    const ids = Object.keys(drive).filter(id => id.indexOf('CGPFILE') === 0).slice(0, 120);
    const moved = setTrashed_(ids, true);
    const patches = log.map((r, i) => [r, i]).filter(x => x[0].method === 'patch');
    const lastCheck = Math.max.apply(null, log.map((r, i) => (r.method !== 'patch' && String(r.url).indexOf(DRIVE_API + '/') === 0 ? i : -1)));
    check('trash checks every file before moving any, in batches', moved === 120 && patches.length === 120 && patches[0][1] > lastCheck,
      moved + ' moved, ' + patches.length + ' patches');
    setTrashed_(ids, false);
    check('restore puts the files back', ids.every(id => drive[id].trashed === false));
  });
  attempt('a file outside the drawer stops the whole move', () => {
    log.length = 0;
    let threw = '';
    try { setTrashed_(['CGPFILE0000001', 'OUTSIDEFILE01'], true); } catch (e) { threw = e.message; }
    check('a file outside the drawer stops the whole move', threw && !log.some(r => r.method === 'patch') && drive.CGPFILE0000001.trashed === false, threw);
  });
  attempt('more than 500 files at once is refused', () => {
    let threw = '';
    try { setTrashed_(new Array(501).fill('CGPFILE0000001'), true); } catch (e) { threw = e.message; }
    check('more than 500 files at once is refused', threw === MESSAGES.en.badFiles, threw);
  });

  attempt('folder links and ids are recognised', () => {
    const cases = {
      'https://drive.google.com/drive/folders/ABCdef12345_-x?usp=sharing': 'ABCdef12345_-x',
      'https://drive.google.com/drive/u/1/folders/ABCdef12345_-x': 'ABCdef12345_-x',
      'https://drive.google.com/open?id=ABCdef12345_-x': 'ABCdef12345_-x',
      'ABCdef12345_-x': 'ABCdef12345_-x', 'not a link': '', '': '',
    };
    const bad = Object.keys(cases).filter(k => folderIdFrom(k) !== cases[k]);
    check('folder links and ids are recognised', !bad.length, bad.join(' | '));
  });
  attempt('the setup screen saves settings for a folder only', () => {
    props = {};
    const res = saveSettings({ folder: 'https://drive.google.com/drive/folders/ROOTFOLDER01', title: '  My   drawer ', owner: 'Sam', lang: 'ko', timeZone: 'Asia/Seoul' });
    const s = settings_();
    let threw = '';
    try { saveSettings({ folder: 'CGPFILE0000001', lang: 'en' }); } catch (e) { threw = e.message; }
    check('the setup screen saves settings for a folder only', res.ok && s.folderId === 'ROOTFOLDER01' && s.title === 'My drawer' && s.lang === 'ko' &&
      s.owner === 'Sam' && s.timeZone === 'Asia/Seoul' && threw === MESSAGES.en.notAFolder, JSON.stringify(s.folderId + ' ' + s.title + ' ' + threw));
  });
  attempt('service lists fall back to the defaults when invalid', () => {
    const custom = parseServices('[{"folder":"perplexity","label":"Perplexity"},{"folder":"texts","label":"No"},{"folder":"Bad Name","label":"x"}]');
    check('service lists fall back to the defaults when invalid', parseServices('').length === 4 && parseServices('{oops').length === 4 &&
      custom.length === 1 && custom[0].folder === 'perplexity', custom.map(s => s.folder).join(','));
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
        { id: 'C2xxxxxxxxx', name: 'chat-2.md', text: '---\ntitle: "Other"\ndate: 2025-04-11\nchat_url: "https://evil.example.com/c/1"\n---\nHi' },
      ], images: { 'chat-1__01-a.svg': 'I1xxxxxxxxx' }, others: { 'chat-1__02-b.txt': 'O1xxxxxxxxx' } },
      trash: [
        { id: 'X1xxxxxxxxx', name: 'old.md', folder: 'chatgpt', trashedTime: '2026-11-01T10:00:00Z', text: '---\ntitle: "Old chat"\n---\n' },
        { id: 'X2xxxxxxxxx', name: 'old__01-pic.png', folder: 'chatgpt', trashedTime: '2026-11-01T10:00:01Z', text: '' },
        { id: 'X3xxxxxxxxx', name: 'old__02-notes.txt', folder: 'chatgpt', trashedTime: '2026-11-01T10:00:01Z', text: '' },
      ],
    };
    const d = buildDrawer(tree, { lang: 'en', owner: '', services: DEFAULT_SERVICES, today: '2026-11-06', time: '09:00' });
    const g = {}; d.groups.forEach(x => { g[x.key] = x.items; });
    const chat = g.chatgpt.find(i => i.file === 'chat-1.md'), other = g.chatgpt.find(i => i.file === 'chat-2.md');
    check('the drawer groups writing, conversations, files and trash',
      d.groups.map(x => x.key).join(',') === 'texts,chatgpt,claude,gemini,grok,trash' &&
      g.texts.length === 1 && g.texts[0].langs.join(',') === 'en,ko' && g.texts[0].own &&
      chat.assets.filter(a => a.found).length === 2 && chat.fileIds.length === 3 && chat.chatUrl && other.chatUrl === '' &&
      g.trash.length === 1 && g.trash[0].fileIds.length === 3 && g.trash[0].restoreId === 'chat-chatgpt-old' && g.trash[0].title === 'Old chat',
      JSON.stringify({ texts: g.texts.length, assets: chat.assets.length, ids: chat.fileIds.length, trash: g.trash.length }));
    const ko = buildDrawer(tree, { lang: 'ko', owner: '', services: DEFAULT_SERVICES, today: '2026-11-06', time: '09:00' });
    const kt = ko.groups[0].items[0];
    check('a text shows the title of the drawer language', kt.title === '산책' && kt.langs[0] === 'ko' && kt.byLang.en.title === 'Walk' &&
      ko.groups[0].label === '글' && ko.built === '2026. 11. 06. 09:00', kt.title + ' ' + kt.langs.join(','));
  });

  const passed = results.filter(r => r.ok).length;
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
    counts = ", ".join("%s %d" % (k, len(v["files"])) for k, v in tree.items()) or "no drawer folders found"
    print("Wrote %s (%s; %d picture(s))" % (out, counts, len(images)))
    for note in notes:
        print("note: " + note, file=sys.stderr)


if __name__ == "__main__":
    main()
