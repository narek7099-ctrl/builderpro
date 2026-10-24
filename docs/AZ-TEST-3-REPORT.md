# BuilderPro round 3: test and improve run

Run: Oct 24, 2026, in the owner's Chrome. Desktop window is 3440px and maximized (can't be resized by the tools), so the phone layout is tested in a same-site 400×860 preview frame (`index.html?bpframe=1`, allowed by commit a3bb1e0; other sites still can't frame the app).

## Re-checks
| Check | Result |
|---|---|
| HighLevel sub-account for AZ Test Roofing (sample) | Not made yet. Setup column now says why: "HighLevel plan doesn't allow creating sub-accounts by API. Make it by hand and Add key." |
| AI answers | Out of Anthropic credit ("credit balance is too low"). Saved chats work: the CEO chat reopened the last conversation by itself. |
| Stripe | AZ Test still on "Add a card" (billing webhook not set). |

## Fixed and shipped
- a3bb1e0 Same-site phone preview frame allowed (for testing).
- dd38417 Command Center chat: plain-words AI errors (out of credit / busy / key turned down) instead of raw API JSON.
- fe0f498 Avatar initials skip punctuation and "(sample)"-style notes ("A(" became "AR").

## Results
| Area | Result | Notes |
|---|---|---|

## Needs the owner
1. Add Anthropic credit (at least $10; the first $5.50 pays the negative balance).
2. HighLevel: upgrade to Agency Pro, or make the sub-account by hand and use Add key.
3. Stripe billing webhook (see earlier instructions).

## Server fixes for the cloud session
