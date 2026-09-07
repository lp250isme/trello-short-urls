# trello-short-urls

Tampermonkey / Violentmonkey userscript that shortens Trello URLs.

```
https://trello.com/c/aBcDeFgH/42-weekend-trip-tokyo
→ https://trello.com/c/aBcDeFgH
```

Also works for boards (`/b/{id}/...` → `/b/{id}`).

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open the raw script: [trello-short-urls.user.js](https://raw.githubusercontent.com/lp250isme/trello-short-urls/main/trello-short-urls.user.js)
3. Confirm install.

## What it does

- Rewrites the address bar when you open a card or board, so copying the URL is already short.
- Rewrites card/board `href`s on the page, so right-click → copy link is also short.

Inspired by Felix Exter's "Undress your Trello links" gist (now 404). That version targeted the old `.list-card` DOM; this one works on current Trello.

## License

MIT
