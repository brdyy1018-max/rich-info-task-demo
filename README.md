# Rich Info Task Templates

Schema-driven collection demo: four layouts (gallery, labeled slots, repeatable group, form) and four capture actions (photo, video, text, select). Presets are JSON. The phone is a renderer, not a page per task.

```bash
npm install
npm run dev
```

Open http://localhost:5173

- Left: switch presets, edit section chrome, change layout / capture / bind field.
- Right: collector UI. **Take Photo** drops a generated demo shot; **Album** picks a real file.
- **Fill sample** completes the current template so you can hit Submit and inspect the bound payload.
