# What the drawer reads

## Folder layout

```
<drawer folder>/
  texts/
    2026-03-spring-walk.en.md
    2026-03-spring-walk.ko.md
  chatgpt/
    chatgpt-personal-002.md
    chatgpt-personal-002__01-cover.svg
  claude/  gemini/  grok/
  _memos.json
```

- Only `texts/` and the service folders directly inside the drawer folder are read. Folders inside them are not.
- Names starting with `_` are skipped: reports such as `_survey-chatgpt.md`, and `_memos.json`.
- A name containing `__` belongs to a conversation as one of its files, for example `chatgpt-personal-002__01-cover.svg`. It is never an item of its own, even when it ends in `.md`.
- Files are UTF-8 Markdown with a frontmatter block between `---` lines. Every key is optional.

## Writing: texts/

One piece of writing per file and language, named `YYYY-MM-<slug>.<lang>.md`. Files with the same `slug` show as one item with a language switch.

| Key | Shown as | Notes |
| --- | --- | --- |
| `title` | heading | "Untitled" when empty |
| `author` | byline | empty, or the name set as "Your name", shows as the user's own writing |
| `publisher` | byline | for texts copied from a book or site |
| `date` | list order, calendar | `YYYY-MM-DD`, or `YYYY-MM` when the day is unknown |
| `type`, `status` | line above the title | for example letter, poem, transcript |
| `tags` | footer, search | `[walk, spring]` |
| `lang` | language switch | `en`, `ko`, or another code; defaults to the drawer's language |
| `slug` | joins languages | lowercase letters, digits, and hyphens; defaults to the file name up to the first dot |
| `source` | byline | a web address (shown by its site name), or a service name such as `Claude` for writing kept from a chat |
| `related`, `related_title` | chip to the conversation | that conversation's file name in the service folder, and its title |
| `image`, `image_alt` | picture under the text | a picture file in `texts/` |
| `rights` | "Not for sharing" badge | for example `copyrighted, private copy` |
| `note` | footer | |

Other keys, such as `visibility` or `published`, are kept in the file but not shown. The body is plain text; line breaks stay as written.

```markdown
---
title: "A walk in early spring"
author:
date: 2026-03-14
type: essay
tags: [walk, spring]
lang: en
slug: spring-walk
---

The river was still cold, but the path had dried.
```

## Conversations: chatgpt/, claude/, gemini/, grok/

One conversation per `.md`, in the format AI Chat Archive writes. Only `title` and `date` matter; everything else shows when present.

| Key | Shown as |
| --- | --- |
| `title`, `date`, `date_end` | heading, list, calendar (`date_end` as a range) |
| `chat_url` | "Open in ChatGPT ↗", only when the address matches that service |
| `account`, `chat_no`, `project`, `category`, `tags` | byline, list line, footer, search |
| `authorship` | a flag when it is `check` |
| `user_turns`, `missing`, `attachments`, `ai_outputs`, `code_outputs` | footer facts |
| `related` | chips to other conversations in the drawer (file names) |
| `assets` | the conversation's files: `file`, `title`, `alt`, `kind`, `origin`, `turn`, `size_kb` |

The body is read as Markdown with these parts:

- headings (`#` to `####`), paragraphs, `-` lists, `|` tables, `` `code` ``, `**bold**`, and `[label](address)` links;
- fences `~~~text … ~~~`, shown exactly as written;
- a line `---` as a rule;
- a file on a line of its own: `![alt](file)` shows the picture, `[name](file)` opens the file in Drive.

Put a conversation's files next to its `.md`, named `<conversation>__NN-name.ext`, and list them under `assets`. Moving a conversation to the trash also moves the files whose names start with `<conversation>__`, and restoring brings them back together.

```markdown
---
title: "Poem draft: river at dusk"
date: "2025-04-10"
chat_url: "https://chatgpt.com/c/sample-river-0002"
account: "personal"
chat_no: 2
category: "creative"
tags: [poem, river]
user_turns: 4
assets:
  - file: "chatgpt-personal-002__01-cover.svg"
    title: "Cover"
    alt: "Blue river under an orange sky"
---
## My turns

### Turn 1
~~~text
Here is my sketch of the river. Can you help me title a poem about it?
~~~

## Files

![Blue river under an orange sky](chatgpt-personal-002__01-cover.svg)
```

## Pictures

JPEG, PNG, GIF, WebP, and SVG show in place. HEIC shows only in some browsers; open it in Drive or keep a JPEG copy. A picture loads only when its item opens.

## Memos

`_memos.json` is written by the drawer. Avoid editing it by hand while the page is open: the last save wins.
