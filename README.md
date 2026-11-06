# Drive Drawer · 드라이브 서랍

A private one-page reader for a Google Drive folder of Markdown writing and AI chat archives. It runs as your own Google Apps Script web app that only you can open, on your phone or your desktop, with search, a calendar, sticky memos, and a trash you can restore from.

Google Drive 폴더에 모아 둔 글과 AI 대화 기록을, 나만 여는 한 페이지로 보여 주는 개인 열람실입니다. 내 계정의 Apps Script 웹앱으로 돌아가고, 휴대폰과 컴퓨터에서 검색·달력·메모·휴지통(되살리기 포함)을 씁니다.

## What it does

- **Reads one Drive folder:** `texts/` for your writing, and `chatgpt/`, `claude/`, `gemini/`, `grok/` (or your own list) for conversations in the format AI Chat Archive writes.
- **Shows it privately:** the web app runs as you and opens only for you. Nothing passes through another server.
- **Search and calendar:** search titles, text, tags, and sources; jump to any day with records.
- **Writing in two languages:** `name.en.md` and `name.ko.md` with the same slug become one item with a language switch.
- **Conversations with their files:** your turns verbatim, the final outputs, and pictures shown in place; other files open in Drive.
- **Memos and trash:** sticky notes saved in one `_memos.json`; "Move to trash" uses the Drive trash, and items come back with one click.

It edits nothing else: no file contents are changed and nothing is deleted for good.

## Quick start

0. Put this folder where your agent loads skills, for example `~/.claude/skills/drive-drawer/` for Claude Code.
1. Ask your agent: "Set up Drive Drawer for my folder 'Drawer'."
2. It walks you through a new Apps Script project: paste three files, approve the permissions, deploy as a web app for **Only myself**.
3. Open the web app address and paste your folder link on the setup screen.

More starting points: [practical prompts](examples/practical-prompts.md).

## What's inside

- `SKILL.md`: the workflow and ground rules
- `template/`: `Code.gs`, `Index.html`, and `appsscript.json` to paste into Apps Script, plus `clasp.json.example`
- `references/`: setup, the file formats, settings, and troubleshooting
- `scripts/build_preview.py`: a local preview and self-test (Python standard library, no network)
- `examples/`: a fictional sample drawer and practical prompts in English and Korean

## Requirements

- A Google account with Drive, and a browser where you can sign in to it.
- An agent that can read and write local files to guide you, such as Claude Code, Codex, Cursor, or Gemini CLI.
- Python 3.8+ only for the optional local preview.

## Limits

- Writing and adding files happen in Drive or through your agent; the drawer itself reads, moves to the trash, and keeps memos.
- Every `.md` is read when the page opens, so very large folders open more slowly. Folders are read in full past 1,000 files, up to 50,000 per folder.
- Google shows a "hasn't verified this app" warning on first run, as it does for any script you make yourself.
- Not affiliated with Google, OpenAI, Anthropic, or xAI.

## License

MIT. See [LICENSE](LICENSE).

## 한국어 요약

- **하는 일:** Drive 폴더 하나를 읽어 글(`texts/`)과 AI 대화(`chatgpt/`·`claude/`·`gemini/`·`grok/`)를 나만 보는 한 페이지로 보여 줍니다.
- **안전:** 내 계정으로 실행되고 나만 열 수 있습니다. 바꾸는 것은 휴지통으로 옮기기·되살리기와 메모 파일 하나뿐이고, 내용 수정이나 영구 삭제는 하지 않습니다.
- **설치:** Apps Script에 파일 세 개를 붙여 넣고, 권한을 승인하고, "나만"으로 배포한 뒤, 첫 화면에 폴더 주소를 붙여 넣습니다. 에이전트가 단계마다 안내합니다.
- **함께 쓰기:** AI Chat Archive가 만든 폴더를 그대로 넣으면 대화 묶음으로 보입니다.
- **언어:** 화면은 영어가 기본이고 한국어로 바꿀 수 있습니다.
