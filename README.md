# Save8 UI fixes

A working copy of the save8.ai home page used to design and test UI fixes.

**Live preview:** https://siddharthpushkar.github.io/save8-ui-fixes/

## What's changed (all in `site/ui-fixes/`)

- **Location button** — cream pill on desktop ("Showing prices for / Set location") with the
  Save8 colour pin; white round button with the pin on phones.
- **Profile button** — the orange Login pill is now a round profile avatar (Save8 illustrated style).
- **Scrolled header (desktop)** — the green header softens to cream, the tabs slide out of view,
  and the bar's search fades in on top; location and Login stay perfectly still.
- **Scrolled header (phone)** — the hero search flies up and docks into the header as the small
  search (and back), the edge moves first and the tabs slide in after it.

## Run it locally

```bash
python serve.py          # http://localhost:5187  (task list at /tasks)
```

`serve.py` serves `site/`, fetches any missing file from save8.ai once, and proxies the API.

## Rebuild the GitHub Pages copy

```bash
python build_pages.py    # writes docs/
```

GitHub Pages serves `docs/` from the `main` branch. It is a static preview: live data (store
list, prices) and login need the real Save8 servers and won't work there.
