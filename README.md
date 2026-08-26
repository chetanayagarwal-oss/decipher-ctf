# DECIPHER — campus CTF site

Plain HTML, CSS and JavaScript. No build step, no framework, no npm install.

Two pages:

| Page | What it is | First load |
|---|---|---|
| `index.html` | **The homepage.** A 3D arcade cabinet. Its CRT screen carries the whole briefing: what a CTF is, what a flag is, and all six rules. | ~1 MB |
| `vault.html` | **The world.** The 3D museum from Andrew Woan's Codrops fan museum, with Decipher text on the exhibit plaques. Optional — linked as "Enter the world". | ~29 MB, streamed in four chunks |

The heavy 3D world is deliberately **not** on the homepage, so a phone or a weak
laptop never downloads it unless someone asks for it.

---

## Editing the content

Everything you'll want to change lives in one file: **`js/config.js`**.

Both pages read from it, so editing it once updates the cabinet screen, the
countdown, and the museum plaques together.

Placeholders you should fill in before the event:

```js
venue: "TBA",              // your actual venue
organizer: "Cybersecurity Club",
registerUrl: "#",          // your Google Form / Unstop / CTFd link
```

The rules in `config.js` are placeholder text — replace the six entries with
your final wording. Add or remove rules freely; the cabinet screen, the
progress dots, and the museum plaques all resize themselves.

The event date drives the live countdown:

```js
eventDateISO: "2026-09-10T10:30:00+05:30",
eventDateLabel: "10 SEPT 2026",
```

---

## Running it

The pages load ES modules and `.glb` models, so they need to be served over
HTTP — opening `index.html` by double-clicking will not work (browsers block
module and model loading on `file://`).

Any static server works:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Publishing it

It is already a static site. Drag the whole `decipher/` folder onto Netlify
Drop, or push it to a GitHub repo and turn on GitHub Pages. Nothing to build.

---

## Performance

Both pages adapt to the machine they land on:

- **Adaptive resolution.** Frame time is sampled continuously; if it drops
  below ~44 fps the render scale steps down, and it climbs back up when there's
  headroom. Weak laptops stay smooth instead of stuttering.
- **Rendering pauses** whenever the tab is hidden.
- **Compressed assets.** The world's models use Draco mesh compression and KTX2
  (Basis) textures, decoded in the browser — 28 MB on disk instead of hundreds.
- **Chunked loading.** The world loads in four batches so the progress bar
  reflects real work.
- **Cheap materials.** The world's lighting is baked into its textures and every
  material is unlit, so there are no realtime lights or shadow maps in it.
- **Reduced motion** is respected on both pages.

---

## Credits

The 3D world, camera path, look keyframes, chunked loading, split-screen reveal
and audio come from **[Andrew Woan's Codrops fan museum](https://github.com/andrewwoan/codrops-fan-museum)**,
used under the MIT licence. The arcade cabinet, the interface and all Decipher
text are this project's own.
