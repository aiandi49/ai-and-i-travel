# AI&I Travel

A trip planner you talk to in plain words, plus the travel guide it reasons from.

- **`/` — the planner (engine).** Describe any trip. It asks one question at a time when it needs to, then ranks your best options with a fit score and a concrete next step.
- **`/guide` — the guide.** Cheapest-route tactics, holiday timing, bags, REAL ID, bereavement and senior fares, rail passes, meeting family at an airport, and a dated Thanksgiving 2026 fare check.

## 1. Put it on GitHub with GitHub Desktop

This folder is already a Git repository on branch `main`, with no commits yet, so the first commit is yours.

1. Unzip `ai-and-i-travel.zip`.
2. Open GitHub Desktop and choose **File → Add local repository…**, then pick the unzipped `ai-and-i-travel` folder. It opens directly; there's no "create a repository" step.
3. In the **Summary** box, type `Initial commit`, then click **Commit to main**.
4. Click **Publish repository**. Leave **Keep this code private** ticked, then click **Publish repository**.
5. On github.com, open the repo's **Settings → Advanced Security** (called **Code security** on some accounts) and turn on **Secret Protection** (secret scanning) and **Push protection**. GitHub moves these settings from time to time, so search the settings page for "secret scanning" if they aren't there.

## 2. Deploy on Vercel

1. In Vercel, choose **Add New… → Project** and import the GitHub repo.
2. Leave the framework preset as **Other**. There's no build step.
3. Before deploying, open **Environment Variables** and add `ANTHROPIC_API_KEY`. Get the value from the Claude Console, in a workspace made just for this project with a monthly spend limit. Set it for **Production** only. Give Preview a separate low-limit key, or none.
4. Click **Deploy**. If you add or change a variable later, redeploy so it takes effect.
5. Add the rate-limit rule in **Firewall** (fields below).

### Environment variables

| Name | Required | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | The planner's key. Read only on the server, in `api/chat.js`. |
| `ANTHROPIC_MODEL` | No | Overrides the model. Default: `claude-sonnet-5-5`, checked against Anthropic's model docs on October 7, 2026. |
| `LIVE_FLIGHT_SEARCH` | No | Set to `on` to let the planner search live flight prices on Kiwi.com. Leave it unset to keep the planner on guide data only. |

For local development, copy `.env.example` to `.env.local` and fill it in. `.env.local` is ignored by Git.

### Vercel Firewall rate-limit rule

Project → **Firewall** → **Configure** → **New Rule**:

- **Name:** `Rate limit chat API`
- **Description:** `Limits each visitor to 20 AI&I Travel planner messages per 10 minutes.`
- **If:** Request Path, Equals, `/api/chat`
- **Then:** Rate Limit, Fixed Window, `600` seconds, `20` requests, key **IP Address**, action **Too Many Requests (429)**

Then click **Add Rule**, then **Review Changes** and **Publish**. These numbers match the backstop limiter inside `api/chat.js`. If your plan's window field won't accept 600 seconds, use `60` seconds and `2` requests instead.

## Live flight prices (optional)

With `LIVE_FLIGHT_SEARCH` set to `on`, the planner can search real, current flight prices and times while it talks with you. It uses Kiwi.com's public flight-search server through Anthropic's MCP connector (beta header `mcp-client-2025-11-20`). No extra key or account is needed, and nothing is added to the repository.

What to know before turning it on:

- **What's shared:** when the planner searches, the route, dates and passenger counts go from Anthropic to Kiwi.com. Nothing else from the conversation is sent to Kiwi.com.
- **Only searching:** the planner can use Kiwi.com's search tool and nothing else. It can't book or pay. Results include Kiwi.com booking links you open yourself.
- **Cost:** search results add text the model reads, so each reply that searches costs more than one that doesn't. Watch the first few days of usage in the Claude Console.
- **Not covered by zero data retention:** Anthropic's docs say MCP connector data is kept under its standard retention policy.
- **Terms not confirmed:** Kiwi.com publishes this server for AI assistants and requires no sign-up, but I couldn't find terms that say whether it may be used behind a public website. If the site goes public or gets sold, ask Kiwi.com first.
- **Trains, buses and rental cars:** there's no live data for these. Amtrak has no public fare API, and bus and rental-car data is only available through partner agreements. The planner gives guidance and tells you where to check.

To turn it off, delete the variable or set it to anything other than `on`, then redeploy.

## Conversation length

Long conversations keep working. The browser always sends your first message (the trip description) plus as many recent turns as fit, and drops the oldest turns in between once the conversation passes about 30 KB. The settings live at the top of `api/chat.js` (`MAX_MESSAGES`, `MAX_USER_CHARS`, `MAX_ASSISTANT_CHARS`, `MAX_BODY_BYTES`, `MAX_TOKENS`) and `assets/engine.js` (`HISTORY_BYTES`, `HISTORY_MAX`, `ASSISTANT_MAX`). Raising them makes each reply cost more, so raise them a little at a time.

## Voice input

The mic keeps listening through pauses and turns off after 10 seconds of silence, or when you tap it again. Speech only fills the text box; you still press Send. Change `SILENCE_MS` in `assets/engine.js` to use a different length.

## What works and what doesn't

**Works now:** a download button that saves the trip plan (ranked options, latest plan and the full conversation) as a text file, made in the browser with no extra API cost; three animated dots while the planner works; the real conversation, one clarifying question at a time, ranked options with fit scores, the details and next-step cards, voice input in browsers that support it, Full page mode, text size and theme controls, and the guide. The planner reads the same `data/gub.json` the guide shows, so it reasons from the guide's own content.

**Optional:** live flight prices (see above).

**Not built (would need a bigger build):** live train, bus and rental-car prices, booking or paying, sending emails or texts, user accounts, and saved trip history. The chat lives only in the browser tab and clears when the tab closes.

**Until `ANTHROPIC_API_KEY` is set in Vercel, the chat can't answer.** It shows a plain "isn't set up yet" message instead.

Voice input uses the browser's built-in speech recognition, so speech may be processed by the browser's maker (Google for Chrome, Apple for Safari). The mic button hides itself in browsers without it, such as Firefox.

## Updating the guide

Edit `data/gub.json`. Each entry has `id`, `title`, `summary`, `body` (a list of paragraphs), `tags` and `details` (label → value). The guide page and the planner both pick up changes on the next deploy. Fare checks go stale quickly, so keep the "checked" date in each price.

## Files

```
index.html          planner (home page)
guide/index.html    guide page, rendered from data/gub.json
data/gub.json       guide content, shared with the planner
api/chat.js         server function: key, safety checks, guide retrieval, model call
assets/             styles, scripts, favicon
vercel.json         security headers, function settings
.env.example        variable names, no values
```

## Security

- The key lives only in Vercel's environment variables and is read with `process.env` inside `api/chat.js`. Browser code only calls `/api/chat`.
- `/api/chat` accepts POST only, JSON only, bodies up to 32 KB, up to 30 messages of 4,000 characters, and only user/assistant roles. The server alone picks the model, token limit and instructions.
- Requests from other websites get a 403. That blocks other sites, not scripts, so it doesn't replace the rate limit or the spend cap.
- Errors are generic, and logs record status codes only.
- Every page is served with a strict Content-Security-Policy (only this site plus Google Fonts), and the one inline script is allowed by its hash. If you edit that inline script in either HTML file, the hash in `vercel.json` must be updated to match.
- No third-party scripts, analytics or dependencies.
