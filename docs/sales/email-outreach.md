# Getting trials by email

How to email contractors so the emails land in the inbox, get opened, and turn into trials. This goes with sales-kit.md (the email wording) and the prospect tracker (who to email and when).

---

## 1. About the animated logo

The GIF is ready: `assets/email/builderpro-mark-animated.gif` (75 KB). It's the BuilderPro mark alone, no name, in a round white badge: a light sweeps across it, it lifts slightly, then it rests. The signature (`docs/sales/email-signature.html`) shows it at 64×64 with your name beside it. A still version for profile pictures is `assets/email/builderpro-mark.png`.

**The moving picture next to your name in the inbox** (like TikTok's): Gmail shows the sender's **Google account profile photo** there, and a GIF profile photo can play. Your email runs on Microsoft 365, not Google, so you make a free Google account *for your existing work address*:

1. Go to accounts.google.com/signup, enter your name, then pick **Use your existing email** and type your @builderpro-os.com address (not a new Gmail address). Google emails that address a code to confirm it.
2. Open myaccount.google.com > **Personal info** > **Profile picture**, and upload `assets/email/builderpro-profile-animated.gif` (500×500, made for this).
3. Send a test email from Outlook to a Gmail address and look at it on a computer and in the Gmail phone app.

What to expect: Gmail users see your mark next to your name. On a computer it usually moves; the Gmail phone app often shows only the first frame, which is the complete mark, so it still looks right. Outlook, Apple Mail and Yahoo users don't see Google photos; for Outlook users, also set `assets/email/builderpro-mark.png` as your Microsoft 365 photo (Outlook on the web > your initials > Change photo). Google doesn't promise the animation, so treat the moving part as a bonus.

To be straight about what it does and doesn't do:

- **Inside the email, it won't raise opens.** People decide to open from what they see in the inbox: the sender's name and picture, the subject line and the first line. A GIF in the signature only appears after the email is opened. The inbox profile picture (below) is the part that can help someone notice you.
- **What it does help:** looking like a real company, people recognizing you on the second and third email, and clicks on your site.
- **Keep it out of the very first cold email.** A first email that's plain text from a real person lands in the inbox more often, while images in a first email from an unknown sender push it toward Promotions or spam. Use the signature with the logo in replies and follow-ups, and in every email to people who already talked to you.

**What actually raises opens:**

1. **Sender name.** Your first name plus the company, e.g. "Alex from BuilderPro", not "BuilderPro Sales".
2. **Subject.** Short, lower-key, about them, e.g. "missed your call Saturday" or "question about Rescue Roofer". Avoid "FREE", "!!!" and ALL CAPS.
3. **Preview line.** The first sentence shows in the inbox, so make it about them: "I called Rescue Roofer Saturday at 10 and got voicemail…"
4. **Timing.** Tuesday to Thursday, 6:30 to 8 am. Contractors read email before the first job.

---

## 2. Set up your email so it lands in the inbox (one time, about 20 minutes)

I checked builderpro-os.com:

- **Your email runs on Microsoft 365 through GoDaddy.** That's fine for sending.
- **Already in place:** SPF (which servers may send for you) and DMARC (set to quarantine).
- **Missing:** DKIM signing for your Outlook mail. Without it, cold emails are much more likely to land in spam, and the strict DMARC setting makes that matter more.

**To turn DKIM on:**

1. Sign in to GoDaddy, open **Email & Office**, then open the **Microsoft 365 admin center** for your mailbox.
2. Go to **security.microsoft.com > Email & collaboration > Policies > Threat policies > Email authentication settings > DKIM**.
3. Select builderpro-os.com. It shows two CNAME records, `selector1._domainkey` and `selector2._domainkey`.
4. In **GoDaddy > Domain > DNS**, add those two CNAME records exactly as shown.
5. Wait an hour, go back to the DKIM page and switch **Sign messages for this domain with DKIM signatures** on.

Tell me when it's done and I'll check that it's live.

**Send from a person.** Use an address like alex@builderpro-os.com with your own name. Don't send from support@ or info@ for outreach.

---

## 3. Who to email

The prospect tracker has 61 Stockton/Modesto contractors. I'm finding the email address each business publishes on its own site or listings and will add those to the tracker.

Only email addresses a business publishes for contact. Never guess or buy lists. It's against the spirit of the law, and bad addresses hurt your sender reputation.

**Before emailing a business**, do the missed-call test from the sales kit: call after 5 pm or on a Saturday and note whether anyone answers. It gives you the best first line there is.

---

## 4. How many and how often

- **Weeks 1–2:** 10 emails a day. **After that:** up to 25 a day. More than that from a new address looks like spam to Microsoft and Google.
- **Send each one by hand from Outlook,** one at a time. Personal emails get replies; mass tools from day one get you flagged.
- **Sequence:** email 1, then email 2 three days later, then email 3 a week after that (the wording is in sales-kit.md, section 5). Stop as soon as they reply.
- **Log every send and reply in the tracker** (status, last contact, next step and date), so the "due today" list tells you who's next.

---

## 5. The trial offer that works best

Contractors don't want to "try software". They want fewer missed calls. So make the offer concrete and low-effort:

> "If you want, reply 'yes' and I'll set up Lisa for [Business] myself: your services, hours and area. You get 14 days free to see how many calls she catches. No setup fee, no contract, and you can cancel in two clicks."

When they say yes:

1. Send them builderpro-os.com/signup.html, or set up a walkthrough.
2. Help them through sign-up on a short call.
3. On day 3, text them using the sales kit's check-in message: "Has Lisa answered any calls yet?"

---

## 6. The law (CAN-SPAM)

Every sales email must:

- use a truthful sender and subject
- say who you are
- include a **postal address**
- let people opt out, with a line like "Not interested? Reply 'no thanks' and I won't email again"

Honor opt-outs right away, and mark them "not now" in the tracker. Until the LLC has an address, use a mailing address you're allowed to use; a PO box or a virtual mailbox works too.

Business email to a published business address is legal in the US with these rules. Texting is different: don't cold-text (see sales-kit.md, section 6).

---

## 7. Week one checklist

- [ ] Turn on DKIM (section 2) and tell me, so I can confirm it's live.
- [ ] Paste the signature (`docs/sales/email-signature.html`) into Outlook, with your name.
- [ ] Do the missed-call test on 10 prospects from the tracker.
- [ ] Send 10 first emails (sales-kit.md email 1), plain text, to the published addresses I add to the tracker.
- [ ] Log each one in the tracker, and follow up on day 3.
