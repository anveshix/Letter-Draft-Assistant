# Letter Desk (पत्र-व्यवस्था) — CM School of Excellence Girls' Dumka

School letter system: auto **Ref. No. + Date**, outward/inward register, ready letter templates (English / हिंदी), one-click A4 print. Works from a few commands.

## Start (शुरू करें)
**A. Server mode — recommended (any device, one shared register)**
1. Install Node.js LTS from nodejs.org (once).
2. Double-click `start.bat` (Windows) or run `./start.sh`. Browser opens at `http://localhost:3000`.
3. To use from phone / other PC: open `data/config.json`, set `"pin": "your-pin"`, restart. Same Wi-Fi: `http://<school-PC-IP>:3000`.
4. From anywhere (internet): install *Cloudflare Tunnel* (`cloudflared tunnel --url http://localhost:3000`) or *Tailscale* on the school PC. Always keep a PIN set.

**B. Local mode — no install:** double-click `public/index.html`. Data stays in that one browser; take backups (Home page warns).

## Daily use — 3 steps
`Ctrl+K` → `n bon.hi name="Anita Kumari" father="Ramesh Tudu" cls=XII purpose="scholarship"` → `Ctrl+Enter` (issues, assigns Ref No., prints).

| Command | Meaning |
|---|---|
| `n req @dc topic="…" details="…" ask="…"` | new letter to DC (templates below; add `.hi` for Hindi) |
| `f text` or just type text | search register |
| `ref 321` · `dup 321` | open · copy a letter |
| `d 321 speed post` | mark dispatched |
| `x 321 reason` | cancel (Ref No. stays, no gaps) |
| `in "BEO Dumka" "Teacher data"` | log inward letter |
| `set next 330` · `bk` · `csv` · `help` | set next number · backup · Excel export · help |

Templates: `req rem fwd inv perm leave pm thx not circ bon char blank`. `@alias`: `cm sec dc dse beo` (edit in Settings).

## Design rules (why it works for a school)
- **Ref No. is given only when you Issue** (drafts have none) → no gaps/duplicates; the server allocates numbers, so two people can't clash. Cancelled letters keep their number.
- Numbering: `{n}/{yy}` (e.g. 321/26), calendar or Apr–Mar session, resets each year, editable in Settings. **First run assumes 320/26 was the last number used — set the real one in Settings → "Next number".**
- **Printing on pre-printed pad:** Settings → tick "pre-printed letterhead" (blank header space, mm adjustable). Otherwise the letterhead is printed with the letter.
- Letter edited after issue is flagged "edited". Typing mistakes: unfilled details show `[ … ]` and warn before issue.
- Signature/stamp image is optional per letter (`private/sign.png`, protected by PIN in server mode).
- Inward register links to replies: issuing a reply auto-closes the inward entry.
- Data: `data/db.json` + automatic daily copies (30 days) in `data/backups`. Also Settings → Download backup.

## Files
`server.js` (zero-dependency) · `public/` (app) · `data/` (your records — back this folder up).
