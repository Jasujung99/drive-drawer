# Examples

Everything here is fictional: the writing, conversations, links, and files were made for this package. No real account data is included.

## sample-drive/

A small drawer folder with every kind of item the drawer shows:

- `texts/`: an essay in English and Korean (one item with a language switch), a copied passage marked "not for sharing", and a list kept from a Gemini chat that links back to it.
- `chatgpt/`: a poem drafted over four turns, with its cover picture (`__01-cover.svg`), and a budget chat with an attached notes file.
- `claude/`: a landing page made as an artifact, with its HTML file, a table, and a date range.
- `gemini/`: the tea shop naming chat the Gemini list links to.
- `_memos.json`: one memo.

The conversation files are in the format AI Chat Archive writes, so an archive made with it drops in the same way.

## Try it

From the skill folder:

```bash
python scripts/build_preview.py --drawer examples/sample-drive --out preview.html
python scripts/build_preview.py --drawer examples/sample-drive --out preview-ko.html --lang ko --owner "Sam"
```

Open the file in a browser. The [practical prompts](practical-prompts.md) show how to ask an agent for each task.
