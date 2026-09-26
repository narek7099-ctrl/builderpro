/* lead-inbox: Cloudflare Email Worker for leads.builderpro-os.com.

   Every lead source in BuilderPro has its own address on this domain
   (ab3k9x2p7q@leads.builderpro-os.com). Cloudflare Email Routing hands each
   message for the domain to this worker, which passes it, whole, to the
   lead-email function. All reading and filing happens there, in one place.

   Cloudflare Email Routing receives mail for free and needs no build step:
   paste this into a new Worker in the Cloudflare dashboard.

   Two settings on the Worker (Settings > Variables):
     LEAD_EMAIL_URL     https://<project>.supabase.co/functions/v1/lead-email
     LEAD_EMAIL_SECRET  the same value as the lead-email function's secret

   It never bounces a message. lead-email answers 200 for anything it cannot
   use (a misaddressed message, a newsletter), and a failure to reach it is
   logged rather than bounced, because a bounce would land on a homeowner or
   on Angi, not on anyone who could fix it. */
export default {
  async email(message, env, ctx) {
    const raw = await new Response(message.raw).text();
    const url = env.LEAD_EMAIL_URL + '?k=' + encodeURIComponent(env.LEAD_EMAIL_SECRET || '');
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envelope_to: message.to, from: message.from, raw }),
      });
      if (!r.ok) console.log('lead-email answered', r.status, (await r.text()).slice(0, 300));
    } catch (e) {
      console.log('lead-email unreachable', String(e));
    }
  },
};
