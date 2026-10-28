# First client day: the checklist

Use this the day your first real contractor is ready to sign up. Allow about an hour. Steps marked **(you)** are things only you can do. Everything else, BuilderPro does by itself; you just check it.

## The day before (or right when they say yes)
1. **(you) Unfreeze HighLevel.** Your plan charges when you do, so do it once you're sure. Stay on the **$297 Unlimited** plan; you don't need Agency Pro.
2. Wait 10 minutes, then open the **Command Center → Accounts**. In the **"When HighLevel is back"** card, work down the list:
   - **(you) Wallet:** Agency Settings → Billing → Wallet: turn on auto-recharge with a monthly cap you're comfortable with, so phone costs can never run away.
   - **Limits:** check whether HighLevel offers per-sub-account limits for texts and minutes, and set them if it does.
   - **Minutes permission:** in the BuilderPro Connect app (marketplace.gohighlevel.com → My Apps), add the scope `voice-ai-dashboard.readonly` if the Call minutes card shows an error.
   - **AZ Test check:** AZ Test Roofing (sample) → Settings → Custom Values shows Business Name, Trade and `ridge_assistant_name` = Lisa.
   - **(you) Review link:** in BuilderPro OS → Settings → Custom Values, add `review_link` with your Google review link.
   - Tick each item off as you go.
3. **(you) Real-phone test:** text and call the Lisa demo line from your own phone and make sure she answers. That's the only thing we couldn't test with HighLevel frozen.

## When the client signs up
4. **They sign up on builderpro-os.com** and add their card in Stripe. Their 14 days free starts then, and nothing is charged today.
5. **Within about 5 minutes, check Command Center → Accounts:**
   - Their row shows **GHL built**.
   - Hover over the Setup column to see the log. It should say **"Business details filled in (… custom values)"**.
   - If it says **"Failed"**, press **Retry setup**. If it says **"not filled in"**, wait 10 minutes; the watcher fills them in.
   - If the log says **"rename it … by hand"**: in HighLevel, open the sub-account named "BuilderPro pool · …" and rename it to their business name.
6. **In HighLevel, open their new sub-account** and check:
   - **Custom Values:** their business name, phone, trade and hours.
   - **Calendars:** an Inspection calendar.
   - **Workflows:** published, the same as the plan's template.
7. **(you) Get their phone number set up.** This is the decision you made: a new local number in their sub-account, with forwarding from their old number if they want.
   - Buy the number in their sub-account. It costs about $1/month, paid by you.
   - **Start the texting registration (A2P) the same day.** Approval takes days to 2 weeks, and texts won't send until it's approved.
   - Connect the number to Lisa (Voice AI) and to missed-call text-back.
8. **Your own customer list:** in BuilderPro OS, the client shows up with the `bp-trial-started` tag and a card in "BuilderPro customers → Trial". Your welcome workflow (W2) starts by itself.

## Their first week
9. **(you) Walk them through BuilderPro.** Show them how to:
   - publish Lisa (Settings → Lisa)
   - add their first job
   - invite their crew
10. **(you) Watch the first real card payment.** The first time one of their homeowners pays an invoice, check that:
    - it shows in their Finances,
    - the money lands in their Stripe,
    - nothing errors.
    
    This is the one money path we haven't seen live yet.
11. **Call minutes:** Command Center → "Lisa call minutes this month" fills in each hour. Check that their number looks believable after a few calls.
    - Leave **"Bill extra minutes"** off until you've seen a full month of real numbers.

## Day 3 before their trial ends
12. Your W3 workflow texts and emails them by itself. **(you)** Give them a call too. The first clients are worth the personal touch.

## If something goes wrong
- **Setup failed or details blank:** Command Center → Accounts → Retry setup, or wait for the watcher, which runs every 5 minutes.
- **HighLevel errors everywhere:** check that HighLevel isn't frozen or downgraded below Unlimited.
- **The pool runs low:** the Command Center warns you. Refill it on an Agency Pro day, or make a sub-account by hand and use **Add key**.
- **Anything else:** open a Claude Code session and say "read docs/FIRST-CLIENT-CHECKLIST.md and ghl-build-log.md; here's what happened: …"
