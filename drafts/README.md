# drafts/

Section drafts that Grok Bot (Max's assistant) writes for the weekly meetup decks. The site does not read or publish anything in this folder.

- **Naming:** `drafts/YYYY-WXX-<section>.json` (for example `drafts/2026-W44-robotics-corner.json`).
- **Format:** each file is one topic object in the `weeks/*.json` topic format (`id`, `title`, `description`, `type`, `slides`), the same shape as one entry in a week's `topics` array.
- **Workflow:** the deck builder merges a chosen draft into the `topics` array of `weeks/YYYY-WXX.json` and may delete the draft afterward.
