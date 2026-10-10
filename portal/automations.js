/* ==================================================================
   Leads → Automations: every workflow in the account's GHL template,
   drawn the way it sits in the GHL builder. Opens on the account's own
   plan (Foundation / OS / Enterprise); higher plans can be previewed.
   The data mirrors the three snapshots built from GHL-BUILD-SPEC.md.
   ================================================================== */
(function () {
  'use strict';
  var PLANS = [{ k: 'foundation', name: 'Foundation', price: '$99' }, { k: 'os', name: 'OS', price: '$199' }, { k: 'enterprise', name: 'Enterprise', price: '$299' }];
  var FOLDERS = { 1: 'Leads and AI', 2: 'Appointments', 3: 'Estimates and Payments', 4: 'Follow-up and Reviews', 5: 'Enterprise', 6: 'Project automations', 7: 'Alerts to you' };
  var I = {
    sms: '<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 7l9 6 9-6" fill="none" stroke="currentColor" stroke-width="2"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="7.5" cy="8.5" r="1.5" fill="currentColor"/>',
    person: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6" fill="none" stroke="currentColor" stroke-width="2"/>',
    pipe: '<rect x="3" y="4" width="5" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10" y="4" width="5" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="17" y="4" width="4" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2"/>',
    clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    exit: '<path d="M14 4h6v16h-6M4 12h11M11 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    fork: '<circle cx="6" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 7v10M6 12h10" fill="none" stroke="currentColor" stroke-width="2"/>',
    note: '<path d="M5 3h10l4 4v14H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 11h8M8 15h6" stroke="currentColor" stroke-width="2"/>',
    pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    form: '<rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8h8M8 12h8M8 16h4" stroke="currentColor" stroke-width="2"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2"/>',
    doc: '<path d="M6 3h9l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 13h7M9 17h5" stroke="currentColor" stroke-width="2"/>',
    spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    folderOpen: '<path d="M3 6h7l2 2h7v3H7l-4 8z M7 11h15l-4 8H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    folder: '<path d="M3 6h7l2 2h9v11H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
  };
  var LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var svg = function (k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + I[k] + '</svg>'; };
  var STEP = {
    sms: ['Send SMS', 'sms', 'msg'], email: ['Send email', 'email', 'msg'],
    tag: ['Add contact tag', 'tag', 'contact'], tagx: ['Remove contact tag', 'tag', 'contact'],
    field: ['Update contact field', 'pencil', 'contact'], contact: ['Create / update contact', 'person', 'contact'], note: ['Add note', 'note', 'contact'],
    opp: ['Create / update opportunity', 'pipe', 'pipe'], stage: ['Move opportunity stage', 'pipe', 'pipe'],
    alert: ['Internal notification', 'bell', 'alert'], wait: ['Wait', 'clock', 'wait'],
    hook: ['Webhook', 'bolt', 'sys'], rm: ['Remove from workflow', 'exit', 'sys']
  };
  var TRIG = { bp: ['BuilderPro event', 'bolt'], tag: ['Contact tag', 'tag'], form: ['Form submitted', 'form'], hook: ['Inbound webhook', 'bolt'], ai: ['Conversation AI', 'spark'], call: ['Call status', 'phone'], reply: ['Customer replied', 'sms'], appt: ['Appointment status', 'cal'], est: ['Estimate status', 'doc'], inv: ['Invoice status', 'doc'], opp: ['Opportunity status', 'pipe'], date: ['Custom date reminder', 'cal'] };
  var tg = function (t) { return '<span class="wa-tg">' + t + '</span>'; };
  var E = ['end'];
  function intent(k, t) { return { triggers: [['tag', 'Tag added: ' + tg('intent-' + k)], ['ai', 'Lisa action: ' + t]], steps: [['tag', tg('ai-qualified')], ['alert', 'All users (in-app): new ' + t.toLowerCase() + ' lead, opens the contact'], E] }; }
  function speed(extra) {
    return {
      triggers: [['tag', 'Tag added: ' + tg('new-lead')], ['tag', 'Tag added: ' + tg('calculator-lead')], ['form', 'Any form submitted']].concat(extra || []),
      settings: ['Re-entry off'],
      steps: [{ 'if': 'Lead type', paths: [
        { label: 'Excluded', when: 'system-test or do-not-contact', steps: [E] },
        { label: 'Calculator lead', when: 'Has tag calculator-lead', steps: [['field', 'BP Opener = “Thanks for getting an instant quote! Want us to come out and confirm the numbers with a free inspection?”'], ['tag', tg('bot-active') + ' → 01 AI Qualifier'], E] },
        { label: 'Everyone else', steps: [['field', 'BP Opener = “Thanks for reaching out! What kind of project can we help you with?”'], ['tag', tg('bot-active') + ' → 01 AI Qualifier'], E] }
      ] }]
    };
  }
  function est07(os) {
    return {
      triggers: [['est', 'Estimate status is Sent']],
      settings: ['Stop on response on', 'Contact time zone, 8am–8pm'],
      steps: [['tag', tg('estimate-sent') + ' (ends 06’s reminder loop)'], ['stage', 'Jobs → Estimate Sent (creates the opportunity if missing)'], ['wait', '2 days'], ['sms', 'Follow-up 1 about the estimate']]
        .concat(os ? [['stage', 'Jobs → Decision Pending', null, 1]] : [])
        .concat([['wait', '3 days'], ['sms', 'Follow-up 2'], ['wait', '4 days'], ['alert', '“Estimate still open. Call them.”'], E])
    };
  }
  function v(from, o) { o.from = from; return o; }
  var WF = [
    { id: '01', name: 'AI Qualifier', folder: 1, from: 0, v: [v(0, {
      triggers: [['tag', 'Tag added: ' + tg('bot-active')]],
      settings: ['Re-entry off', 'Multiple opportunities off', 'Contact time zone, 8am–8pm every day'],
      steps: [{ 'if': 'Who is this?', paths: [
        { label: 'Customer', when: 'Has tag customer', steps: [['tagx', tg('bot-active')], E] },
        { label: 'Already in pipeline', when: 'Has tag in-pipeline', steps: [E] },
        { label: 'Excluded', when: 'system-test or do-not-contact', steps: [E] },
        { label: 'New lead', when: 'None of the above', steps: [
          ['opp', 'Jobs → New Lead (no duplicates)'], ['tag', tg('in-pipeline')],
          ['sms', 'Hi {{contact.first_name}}, this is Lisa with {{custom_values.business_name}}. {{contact.bp_opener}}'],
          ['wait', 'For a reply, up to 1 day', 'Wait for reply'],
          { 'if': 'Replied?', paths: [
            { label: 'Replied', steps: [['stage', 'Jobs → Contacted. Lisa takes the conversation.'], E] },
            { label: 'No reply', steps: [['sms', 'Follow-up 2'], ['wait', 'For a reply, up to 2 days', 'Wait for reply'], ['sms', 'Follow-up 3 with {{custom_values.business_phone}}'], ['wait', 'For a reply, up to 3 days', 'Wait for reply'], ['tagx', tg('bot-active')], ['tag', tg('needs-time') + ' → 12 Reactivation'], E] }
          ] }
        ] }
      ] }] })] },
    { id: '02', name: 'Speed to Lead', folder: 1, from: 0, v: [v(0, speed()), v(1, (function () { var o = speed([['tag', 'Tag added: ' + tg('lead-source'), 1]]); o.change = 'Adds a lead-source trigger so Lead Sources leads start the flow (re-entry off, so they enroll once).'; return o; })())] },
    { id: '02a', name: 'Calculator Lead (webhook)', folder: 1, from: 0, v: [v(0, { triggers: [['hook', 'Calculator posts the estimate to this location’s webhook URL']], steps: [['contact', 'Name, phone, email, address and source from the payload'], ['note', 'Estimate range, project, address, roof score, notes'], ['tag', tg('calculator-lead') + ' → 02 Speed to Lead'], E] })] },
    { id: '03a', name: 'Repair Lead', folder: 1, from: 0, v: [v(0, intent('repair', 'Repair'))] },
    { id: '03b', name: 'Replacement Lead', folder: 1, from: 0, v: [v(0, intent('replacement', 'Replacement'))] },
    { id: '03c', name: 'Storm or Insurance Lead', folder: 1, from: 0, v: [v(0, intent('storm', 'Storm or insurance'))] },
    { id: '03d', name: 'Question', folder: 1, from: 0, v: [v(0, { triggers: [['tag', 'Tag added: ' + tg('intent-question')]], steps: [['tag', tg('ai-qualified')], E] })] },
    { id: '03e', name: 'Needs Time', folder: 1, from: 0, v: [v(0, { triggers: [['ai', 'Lisa action: Needs time']], steps: [['tag', tg('ai-qualified')], ['tagx', tg('bot-active') + ' (Lisa stops; 12 Reactivation follows up later)'], E] })] },
    { id: '04', name: 'Missed Call Text-Back', folder: 1, from: 0, v: [v(0, {
      triggers: [['call', 'Incoming call: busy, canceled, no answer or voicemail']],
      settings: ['Re-entry on (every missed call)', 'Contact time zone, 8am–8pm'],
      steps: [['tag', tg('missed-call')], ['alert', 'All users (in-app): missed call, opens the conversation'],
        { 'if': 'Caller', paths: [
          { label: 'Excluded', when: 'system-test or do-not-contact', steps: [E] },
          { label: 'Known contact', when: 'customer or in-pipeline', steps: [['sms', 'Direct text-back. No stage change.'], E] },
          { label: 'New caller', steps: [['field', 'BP Opener = “Sorry we missed your call! How can we help?”'], ['tag', tg('bot-active') + ' → 01 AI Qualifier'], E] }
        ] }] })] },
    { id: '09', name: 'Not Interested → Lost', folder: 1, from: 0, v: [v(0, { triggers: [['tag', 'Tag added: ' + tg('not-interested')], ['ai', 'Lisa action: Not interested']], steps: [['tagx', tg('bot-active')], ['opp', 'Jobs → Lost, status lost'], E] })] },
    { id: '13', name: 'New Contact Email Auto-Reply', folder: 1, from: 0, v: [v(0, {
      triggers: [['reply', 'Replied by email, not tagged customer']], settings: ['Re-entry off (first email only)'],
      steps: [{ 'if': 'Skip?', paths: [
        { label: 'Skip', when: 'in-pipeline or do-not-contact', steps: [E] },
        { label: 'New contact', steps: [['email', 'Thanks, we got your message. {{custom_values.business_name}}, {{custom_values.business_phone}}'], ['tag', tg('new-lead') + ' → 02 Speed to Lead'], E] }
      ] }] })] },
    { id: '05', name: 'Appointment (confirm, reminders, post-visit check)', folder: 2, from: 0, v: [v(0, {
      triggers: [['appt', 'Confirmed or new, calendar Inspection (Lisa, widget, booking page)']], settings: ['Contact time zone, 8am–8pm'],
      steps: [['tag', tg('appointment-booked') + ' ' + tg('in-pipeline')], ['opp', 'Jobs → Inspection Scheduled'],
        ['sms', 'You’re booked for your free inspection with {{custom_values.business_name}} on the date and time'], ['alert', 'New inspection booked'],
        ['wait', 'Until 24 hours before'], ['sms', 'Reminder'], ['wait', 'Until 2 hours before'], ['sms', 'Reminder'], ['wait', 'Until 2 hours after'],
        ['alert', '“Did the inspection happen? Tag inspection-done or no-show.”'], ['wait', 'For tag inspection-done or no-show, 1 day', 'Wait for tag'],
        { 'if': 'Answered?', paths: [{ label: 'Tagged', steps: [E] }, { label: 'Timed out', steps: [['goto', 'Back to “Did the inspection happen?”']] }] }] })] },
    { id: '05b', name: 'Appointment Cancelled', folder: 2, from: 0, v: [v(0, { triggers: [['appt', 'Cancelled, calendar Inspection']], steps: [['rm', '05 Appointment (no stray reminders)'], ['tagx', tg('appointment-booked')], ['stage', 'Jobs → Contacted'], ['alert', 'Inspection cancelled'], E] })] },
    { id: '14', name: 'No-Show - Rebook', folder: 2, from: 0, v: [v(0, { triggers: [['tag', 'Tag added: ' + tg('no-show')], ['appt', 'No-show, calendar Inspection']], settings: ['Re-entry on', 'Contact time zone, 8am–8pm'], steps: [['rm', '05 Appointment'], ['tag', tg('no-show')], ['stage', 'Jobs → Contacted'], ['sms', 'Sorry we missed you. Pick a new time: {{custom_values.booking_link}}'], ['alert', 'No-show'], E] })] },
    { id: '20', name: 'Job and Maintenance Appointments', folder: 2, from: 1, v: [v(1, { triggers: [['appt', 'Confirmed, calendar Job'], ['appt', 'Confirmed, calendar Maintenance Visit']], settings: ['Contact time zone, Mon–Sat 8am–5pm'], steps: [['sms', 'Confirmation with date and time'], ['wait', 'Until 1 day before'], ['sms', 'Reminder'], E] })] },
    { id: '06', name: 'Inspection Done - Estimate Due', folder: 3, from: 0, v: [v(0, {
      triggers: [['tag', 'Tag added: ' + tg('inspection-done')]], settings: ['Re-entry on'],
      steps: [['stage', 'Jobs → Estimate Due'], ['alert', '“Send the estimate.”'], ['wait', 'For tag estimate-sent or not-interested, 1 day', 'Wait for tag'],
        { 'if': 'Sent?', paths: [{ label: 'Estimate sent', steps: [E] }, { label: 'Timed out', steps: [['goto', 'Back to “Send the estimate.”']] }] }] })] },
    { id: '07', name: 'Estimate Sent - Follow-up', folder: 3, from: 0, v: [v(0, est07(false)), v(1, (function () { var o = est07(true); o.change = 'After the first follow-up the deal moves to the new Decision Pending stage.'; return o; })())] },
    { id: '08', name: 'Estimate Accepted', folder: 3, from: 0, v: [
      v(0, { name: 'Estimate Accepted - Invoice', triggers: [['est', 'Estimate status is Accepted']], steps: [['rm', '07 Estimate Sent - Follow-up'], ['tag', tg('estimate-accepted')], ['sms', 'Thank-you message'], ['alert', '“Send the invoice and schedule the job.”'], E] }),
      v(1, { name: 'Estimate Accepted - Deposit', change: 'Sends the deposit invoice automatically (Deposit Percent × the accepted estimate) instead of asking the owner to invoice.',
        triggers: [['est', 'Estimate status is Accepted']],
        steps: [['rm', '07 Estimate Sent - Follow-up'], ['tag', tg('estimate-accepted')], ['hook', 'estimate-accepted: creates and sends the deposit invoice, tags deposit-sent', null, 1], ['stage', 'Jobs → Deposit Requested', null, 1],
          ['sms', 'Thanks! Your deposit invoice is on its way by text and email; once it’s paid we’ll get your job on the schedule.', null, 1], ['alert', 'Estimate accepted, deposit requested'], E] })] },
    { id: '10', name: 'Invoice Paid', folder: 3, from: 0, v: [
      v(0, { name: 'Invoice Paid - Won', triggers: [['inv', 'Invoice status is Paid']], steps: [['opp', 'Jobs → Won, status won'], ['tag', tg('customer') + ' ' + tg('invoice-paid') + ' ' + tg('review-requested') + ' → 11'], ['tagx', tg('bot-active')], ['alert', 'Payment received'], E] }),
      v(1, { name: 'Invoice Paid - Deposit or Paid in Full', change: 'Splits payments: the deposit starts the job (and the portal’s Active Job), the final payment closes it.',
        triggers: [['inv', 'Invoice status is Paid']], settings: ['Re-entry on'],
        steps: [{ 'if': 'Which payment?', paths: [
          { label: 'Deposit', when: 'deposit-sent and not deposit-paid', steps: [['tag', tg('deposit-paid')], ['stage', 'Jobs → In Progress'], ['hook', 'project-create: Active Job in the BuilderPro portal'], ['alert', '“Book it on the Job calendar.”'], E] },
          { label: 'Final payment', when: 'Everything else', steps: [['rm', '15 Job Complete and 16 Final Invoice Chase'], ['opp', 'Jobs → Paid in Full, status won'], ['tag', tg('customer') + ' ' + tg('invoice-paid') + ' ' + tg('paid-in-full') + ' ' + tg('review-requested') + ' → 11'], ['tagx', tg('bot-active')], ['alert', 'Paid in full'], E] }
        ] }] })] },
    { id: '15', name: 'Job Complete - Final Invoice Due', folder: 3, from: 1, v: [v(1, {
      triggers: [['tag', 'Tag added: ' + tg('job-complete') + ' (portal sign-off)']],
      steps: [['stage', 'Jobs → Job Complete'], ['alert', '“Send the final invoice.”'], ['wait', 'For tag final-sent or paid-in-full, 1 day', 'Wait for tag'],
        { 'if': 'Sent?', paths: [{ label: 'Sent or paid', steps: [E] }, { label: 'Timed out', steps: [['goto', 'Back to “Send the final invoice.”']] }] }] })] },
    { id: '16', name: 'Final Invoice Chase', folder: 3, from: 1, v: [v(1, { triggers: [['tag', 'Tag added: ' + tg('final-sent')]], settings: ['Stop on response on', 'Contact time zone, 8am–8pm'], steps: [['wait', '2 days'], ['sms', 'Friendly reminder about the final invoice'], ['wait', '3 days'], ['sms', 'Second reminder'], ['wait', '4 days'], ['alert', '“Final invoice still open. Call them.”'], E] })] },
    { id: '11', name: 'Review Request', folder: 4, from: 0, v: [
      v(0, { triggers: [['tag', 'Tag added: ' + tg('review-requested')]], settings: ['Stop on response on', 'Contact time zone, 8am–8pm'], steps: [['wait', '1 day'], ['sms', 'Review request with {{custom_values.google_review_link}}'], ['wait', '3 days'], ['sms', 'One reminder'], E] }),
      v(1, { name: 'Review Request - Rating Routing', change: 'Asks for a 1–5 rating first. Only 4–5 get the Google link; 1–3 go privately to the owner.',
        triggers: [['tag', 'Tag added: ' + tg('review-requested')]], settings: ['Stop on response off (it would end at the rating reply)', 'Contact time zone, 8am–8pm'],
        steps: [['wait', '1 day'], ['sms', 'How did we do? Reply 1–5', null, 1], ['wait', 'For a reply, up to 3 days', 'Wait for reply', 1],
          { 'if': 'Rating', paths: [
            { label: '4 or 5', steps: [['sms', 'Thank you! Would you leave a review? {{custom_values.google_review_link}}'], ['tag', tg('review-positive')], E] },
            { label: '1 to 3', steps: [['sms', 'Sorry to hear that. What went wrong?'], ['alert', 'Unhappy customer, no review link sent'], E] },
            { label: 'Other reply', steps: [['alert', 'Customer replied to the rating request'], E] },
            { label: 'No reply', steps: [E] }
          ] }] })] },
    { id: '12', name: 'Reactivation (90 days)', folder: 4, from: 0, v: [v(0, {
      triggers: [['tag', 'Tag added: ' + tg('needs-time')], ['opp', 'Opportunity moved to Lost']], settings: ['Stop on response on', 'Contact time zone, 8am–8pm'],
      steps: [['wait', '90 days'], { 'if': 'Still a prospect?', paths: [
        { label: 'Skip', when: 'customer or do-not-contact', steps: [E] },
        { label: 'Reach out', steps: [['opp', 'Jobs → Reactivation, status open'], ['tag', tg('reactivation')], ['sms', 'Still thinking about your project?'], ['tagx', tg('needs-time') + ' (so it can recur)'], E] }
      ] }] })] },
    { id: '19', name: 'Maintenance Reminder', folder: 4, from: 1, v: [v(1, { triggers: [['date', 'Next Service Date, 14 days before'], ['tag', 'Tag added: ' + tg('maintenance-due')]], settings: ['Re-entry on', 'Contact time zone, Mon–Fri 8am–5pm'], steps: [['sms', 'Your maintenance is due in the next couple of weeks. Reply with a day that works.'], ['alert', '“Book it on the Maintenance Visit calendar.”'], ['tagx', tg('maintenance-due')], E] })] },
    { id: '19b', name: 'Maintenance Timer', folder: 4, from: 1, v: [v(1, {
      triggers: [['tag', 'Tag added: ' + tg('maint-due-6m')], ['tag', 'Tag added: ' + tg('maint-due-12m')], ['tag', 'Tag added: ' + tg('maint-due-24m')]],
      steps: [{ 'if': 'Interval', paths: [
        { label: '6 months', steps: [['wait', '168 days'], ['tag', tg('maintenance-due') + ' → 19'], ['wait', '14 days'], ['goto', 'Back to the 168-day wait']] },
        { label: '12 months', steps: [['wait', '351 days'], ['tag', tg('maintenance-due') + ' → 19'], ['wait', '14 days'], ['goto', 'Back to the 351-day wait']] },
        { label: '24 months', steps: [['wait', '716 days'], ['tag', tg('maintenance-due') + ' → 19'], ['wait', '14 days'], ['goto', 'Back to the 716-day wait']] }
      ] }] })] },
    { id: '21', name: 'Priority Owner Alerts', folder: 5, from: 2, v: [v(2, {
      triggers: [['tag', 'Tag added: ' + tg('ai-team-alert') + ' (AI Team)'], ['tag', 'Tag added: ' + tg('intent-storm')], ['tag', 'Tag added: ' + tg('missed-call')], ['tag', 'Tag added: ' + tg('estimate-accepted')], ['tag', 'Tag added: ' + tg('review-feedback')]],
      settings: ['Re-entry on', 'No time window (owner alerts go out immediately)'],
      steps: [['alert', 'SMS to {{custom_values.owner_phone}}: Priority: {{contact.name}} {{contact.phone}} needs you now.', 'Internal notification · SMS'],
        ['alert', 'Email to {{custom_values.owner_email}}: Priority: {{contact.name}} needs you now', 'Internal notification · Email'],
        ['tagx', tg('ai-team-alert') + ' (so the AI Team can page again)'], E] })] },
    { id: '22', name: 'Priority Support Request', folder: 5, from: 2, v: [v(2, { triggers: [['tag', 'Tag added: ' + tg('priority-support')]], steps: [['alert', 'Email to BuilderPro support with your business and the contact', 'Internal notification · Email'], ['tagx', tg('priority-support')], E] })] }
    ,
    /* ---------- project automations: BuilderPro sends the event (tag + BP fields), the CRM workflow does the messaging ---------- */
    { id: '30', kind: 'job_scheduled', name: 'Job Scheduled', folder: 6, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-job-scheduled') + ' (a project gets its first day booked, or the start moves)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [['sms', 'Your {{contact.bp_job_name}} is booked to start {{contact.bp_start_date}}. Follow along: {{contact.bp_portal_link}}'], ['email', 'Same message, subject “Your {{contact.bp_job_name}} is scheduled”'], E] })] },
    { id: '31', kind: 'visit_tomorrow', name: 'Visit Tomorrow Reminder', folder: 6, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-visit-tomorrow') + ' (the day before each booked work day)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [['wait', 'Until 5:00 pm'], ['sms', 'Our crew will be at {{contact.bp_job_address}} tomorrow, {{contact.bp_visit_date}}. Please keep the driveway clear.'], E] })] },
    { id: '32', kind: 'crew_arrived', name: 'Crew Arrived', folder: 6, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-crew-arrived') + ' (first clock-in on the job that day)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [{ 'if': 'Crew lead known?', paths: [
        { label: 'Yes', when: 'BP Crew Lead is set', steps: [['sms', '{{contact.bp_crew_lead}} and the crew just arrived and are starting on your {{contact.bp_job_name}}. {{contact.bp_portal_link}}'], E] },
        { label: 'No', steps: [['sms', 'Our crew just arrived and is starting on your {{contact.bp_job_name}}. {{contact.bp_portal_link}}'], E] }
      ] }] })] },
    { id: '33', kind: 'job_completed', name: 'Job Completed → Review → Referral', folder: 6, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-job-completed') + ' (the project is marked done)']],
      settings: ['Re-entry on', 'Stop on response on', 'Contact time zone, 8am–8pm'],
      steps: [['sms', 'Your {{contact.bp_job_name}} is complete! Final photos and documents: {{contact.bp_portal_link}}'], ['wait', '2 days'], ['tag', tg('review-requested') + ' → 11 Review Request (one review ask, not two)'], ['wait', '30 days'], ['sms', 'Know a neighbor who needs work done? Send them our way.'], ['tag', tg('past-customer')], E] })] },
    { id: '34', kind: 'payment_overdue', name: 'Payment Overdue', folder: 6, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-payment-overdue') + ' (3, 7 and 14 days after done with a balance)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [{ 'if': 'BP Days Overdue', paths: [
        { label: 'Invoice chase running', when: 'has tag final-sent (16 already reminds them)', steps: [E] },
        { label: '3 days', steps: [['sms', 'A quick reminder that {{contact.bp_balance_due}} is still open on your {{contact.bp_job_name}}.'], E] },
        { label: '7 days', steps: [['sms', 'Your balance of {{contact.bp_balance_due}} is a week past due. Anything holding it up?'], ['email', 'Same reminder by email'], E] },
        { label: '14 days', steps: [['alert', '{{contact.name}} owes {{contact.bp_balance_due}}, 14 days. Call them.'], E] }
      ] }] })] },
    { id: '35', kind: 'job_anniversary', name: 'Yearly Check-up', folder: 6, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-job-anniversary') + ' (each year on the day a job was finished)']],
      settings: ['Re-entry on', 'Stop on response on', 'Contact time zone, 8am–8pm'],
      steps: [['sms', 'It’s been a year since we finished your {{contact.bp_job_name}}. Want a free check-up? Reply YES.'], ['wait', 'For a reply, up to 3 days', 'Wait for reply'], { 'if': 'Replied YES?', paths: [
        { label: 'Yes', steps: [['opp', 'Jobs → New Lead (check-up)'], ['alert', '“Book the check-up.”'], E] }, { label: 'No reply', steps: [E] } ] }] })] },
    { id: '36', kind: 'storm_followup', name: 'Storm Follow-up', folder: 6, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-storm-followup') + ' (sent from BuilderPro for an area after a storm)']],
      settings: ['Re-entry on', 'Stop on response on', 'Contact time zone, 8am–8pm'],
      steps: [['sms', 'After the recent storm we’re offering free roof checks for past customers. Want us to swing by? Reply YES. {{contact.bp_event_note}}'], ['wait', 'For a reply, up to 2 days', 'Wait for reply'], { 'if': 'Replied YES?', paths: [
        { label: 'Yes', steps: [['opp', 'Jobs → New Lead (storm check)'], ['alert', '“Book the storm check.”'], E] }, { label: 'No reply', steps: [E] } ] }] })] },
    { id: '37', kind: 'contract_signed', name: 'Contract Signed → Welcome', folder: 6, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-contract-signed') + ' (the customer e-signs the contract)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [['sms', 'Thank you! Your contract is signed. Next: permits, materials and your crew day. Track it all: {{contact.bp_portal_link}}'],
        { 'if': 'Start date set?', paths: [
          { label: 'Yes', steps: [['sms', 'You’re on the schedule for {{contact.bp_start_date}}.'], E] },
          { label: 'Not yet', steps: [E] } ] }] })] },
    { id: '38', kind: 'phase_done', name: 'Phase Done → Progress Update', folder: 6, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-phase-done') + ' (a plan phase is checked off)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [{ 'if': 'Another phase next?', paths: [
        { label: 'Yes', steps: [['sms', '{{contact.bp_phase_name}} is done ✅ Next up: {{contact.bp_next_phase}}. Photos: {{contact.bp_portal_link}}'], E] },
        { label: 'Last phase', steps: [['sms', '{{contact.bp_phase_name}} is done ✅ That was the last step; we’ll be in touch to wrap up.'], E] } ] }] })] },
    { id: '39', kind: 'schedule_moved', name: 'Schedule Pushed Back', folder: 6, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-schedule-moved') + ' (the start date moves later)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [['sms', 'Heads-up: your {{contact.bp_job_name}} start moved from {{contact.bp_old_start_date}} to {{contact.bp_start_date}}. Sorry for the change.'], ['alert', 'Told the customer about the new date'], E] })] },
    { id: '40', kind: 'payment_received', name: 'Payment Received → Thank You', folder: 6, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-payment-received') + ' (money collected on the job goes up)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [{ 'if': 'Paid in full?', paths: [
        { label: 'Balance left', steps: [['sms', 'We received {{contact.bp_amount_paid}}. Remaining balance: {{contact.bp_balance_due}}. Thank you!'], E] },
        { label: 'Paid in full', steps: [['sms', 'Your {{contact.bp_job_name}} is paid in full. Thank you!'], E] } ] }] })] },
    { id: '41', kind: 'change_order_waiting', name: 'Change Order Waiting', folder: 6, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-change-order-waiting') + ' (unsigned 2 days, then 5)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [{ 'if': 'BP Days Overdue', paths: [
        { label: '2 days', steps: [['sms', 'A change to your project is waiting for your OK: {{contact.bp_change_order}}. Review and sign: {{contact.bp_portal_link}}'], E] },
        { label: '5 days', steps: [['alert', '{{contact.name}} hasn’t signed {{contact.bp_change_order}} (5 days). Call them.'], E] } ] }] })] },
    { id: '42', kind: 'inspection_scheduled', name: 'Inspection Scheduled', folder: 6, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-inspection-scheduled') + ' (a permit inspection gets a date)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [['sms', 'Your {{contact.bp_inspection}} inspection is set for {{contact.bp_visit_date}}. We’ll let you know if you need to be home.'], E] })] },
    { id: '43', kind: 'warranty_followup', name: 'Warranty Info', folder: 6, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-warranty') + ' (about a week after the job is done)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [['sms', 'Your {{contact.bp_job_name}} is covered by our workmanship warranty. Documents: {{contact.bp_portal_link}}'], ['email', 'Same message by email'], ['tag', tg('warranty-sent')], E] })] },
    { id: '44', kind: 'message_unanswered', name: 'Customer Message Unanswered', folder: 7, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-message-unanswered') + ' (portal message, no reply in 4 hours)']],
      settings: ['Re-entry on', 'No time window (alerts go out right away)'],
      steps: [['alert', '{{contact.name}} messaged in the portal 4+ hours ago: “{{contact.bp_event_note}}”'], E] })] },
    { id: '45', kind: 'over_budget', name: 'Job Over Budget', folder: 7, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-over-budget') + ' (job costs pass the budget)']],
      settings: ['Re-entry on', 'No time window (alerts go out right away)'],
      steps: [['alert', '{{contact.bp_job_name}} is over budget: {{contact.bp_spent}} spent against {{contact.bp_budget}}'], E] })] },
    { id: '46', kind: 'sub_insurance_expiring', name: 'Sub Insurance Expiring', folder: 7, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-sub-insurance-expiring') + ' (on the sub’s contact, 14 days before)']],
      settings: ['Re-entry on', 'Contact time zone, 8am–8pm'],
      steps: [['sms', 'To the sub: {{contact.bp_event_note}}. Please upload a current copy in your sub portal.'], ['alert', '{{contact.name}}: {{contact.bp_event_note}}'], E] })] },
    { id: '47', kind: 'crew_no_show', name: 'Crew No-Show', folder: 7, from: 1, v: [v(1, {
      triggers: [['bp', 'Tag added: ' + tg('bp-crew-no-show') + ' (booked today, nobody clocked in an hour after the start)']],
      settings: ['Re-entry on', 'No time window (alerts go out right away)'],
      steps: [['alert', 'Nobody has clocked in on {{contact.bp_job_name}} for {{contact.name}}. {{contact.bp_event_note}}.'], ['note', 'BuilderPro also alerts the crew lead in the crew app'], E] })] },
    { id: '48', kind: 'weather_risk', name: 'Weather Delay Warning', folder: 7, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-weather-risk') + ' (rain 60%+ or gusts 40 mph+ forecast for tomorrow’s job, checked 3–9 pm)']],
      settings: ['Re-entry on', 'No time window (alerts go out right away)'],
      steps: [['alert', 'Weather risk tomorrow on {{contact.bp_job_name}} ({{contact.bp_job_address}}): {{contact.bp_event_note}}. Reschedule? Moving the date texts the customer automatically.'], E] })] },
    { id: '49', kind: 'materials_not_ready', name: 'Materials Not Ready', folder: 7, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-materials-not-ready') + ' (work tomorrow, the order list is still a draft)']],
      settings: ['Re-entry on', 'No time window (alerts go out right away)'],
      steps: [['alert', '{{contact.bp_job_name}} starts {{contact.bp_visit_date}} and its order list hasn’t been sent: {{contact.bp_event_note}}.'], E] })] },
    { id: '50', kind: 'job_stalled', name: 'Stuck-Job Watchdog', folder: 7, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-job-stalled') + ' (a job stops moving between sale and payment)']],
      settings: ['Re-entry on', 'No time window (alerts go out right away)'],
      steps: [{ 'if': 'Where it stalled', paths: [
        { label: 'No contract', when: 'sold 24h ago', steps: [['alert', '{{contact.bp_event_note}}'], E] },
        { label: 'No start date', when: 'signed 3 days ago', steps: [['alert', '{{contact.bp_event_note}}'], E] },
        { label: 'No progress', when: '5 days, no phase done', steps: [['alert', '{{contact.bp_event_note}}'], E] },
        { label: 'Unpaid', when: 'done 2 days ago', steps: [['alert', '{{contact.bp_event_note}}'], E] }
      ] }] })] },
    { id: '51', name: 'Domino Reschedule', folder: 6, from: 2, v: [v(2, {
      triggers: [['bp', 'In BuilderPro: one of a crew’s jobs starts later than before']],
      settings: ['Runs inside BuilderPro', 'Asks before moving anything'],
      steps: [['note', 'Shows the crew’s later jobs and asks “Move them too?”', 'Ask you'],
        { 'if': 'Your answer', paths: [
          { label: 'Move them', steps: [['field', 'Each later job moves the same number of days (Sundays skipped)', 'Move the jobs'], ['sms', 'Each customer gets 39 Schedule Pushed Back'], ['alert', 'The crew lead gets the new dates in the crew app'], E] },
          { label: 'Leave them', steps: [E] }
        ] }] })] },
    { id: '52', kind: 'storm_alert', name: 'Storm Alert to You', folder: 7, from: 2, v: [v(2, {
      triggers: [['bp', 'Tag added: ' + tg('bp-storm-alert') + ' (hail or damaging wind near past customers, from the National Weather Service reports)']],
      settings: ['Re-entry on', 'No time window (alerts go out right away)'],
      steps: [['alert', '{{contact.bp_event_note}}'], ['note', 'You approve it in BuilderPro (dashboard card or the notice); then Storm Follow-up (36) texts the customers you picked', 'You decide'], E] })] }
  ];

  var fmt = function (s) { return String(s).replace(/\{\{([^}]+)\}\}/g, function (m, k) { return '<span class="wa-chip">' + k.trim() + '</span>'; }); };
  var S = { plan: null, sel: '01', mine: 1, open: null };
  /* storms only matter for some trades (portal/storm.js); for the rest the storm follow-up isn't shown at all */
  var hidden = function (w) { return (w.id === '36' || w.id === '52') && !!window.bpStormTrade && !bpStormTrade(); };
  var avail = function (w) { return w.from <= S.plan && !hidden(w); };
  var variant = function (w) { var x = w.v[0]; w.v.forEach(function (y) { if (y.from <= S.plan) x = y; }); return x; };
  var status = function (w) { return ''; }; var status0 = function (w) { if (S.plan > 0 && w.from === S.plan) return 'new'; var x = variant(w); if (S.plan > 0 && x.from === S.plan && w.from < S.plan) return 'chg'; return ''; };
  var conn = '<div class="wa-conn"><div class="wa-ln"></div><div class="wa-plus">+</div><div class="wa-ln"></div></div>';
  function stepHTML(s) {
    if (!Array.isArray(s)) return branchHTML(s);
    var t = s[0], d = s[1], title = s[2], nw = s[3];
    if (t === 'end') return '<div class="wa-end">END</div>';
    if (t === 'goto') return '<div class="wa-goto">↻ Go to: ' + fmt(d) + '</div>';
    var m = STEP[t], isNew = nw != null && nw === S.plan && S.plan > 0;
    return '<div class="wa-node' + (isNew ? ' isnew' : '') + '">' + (isNew ? '<span class="wa-nbadge">NEW IN ' + PLANS[S.plan].name.toUpperCase() + '</span>' : '') + '<div class="wa-ic wa-' + m[2] + '">' + svg(m[1]) + '</div><div><div class="wa-nt">' + (title || m[0]) + '</div><div class="wa-nd">' + fmt(d) + '</div></div></div>';
  }
  function seq(steps) { return steps.map(function (s, i) { return (i ? conn : '') + stepHTML(s); }).join(''); }
  function branchHTML(b) {
    var cols = b.paths.map(function (p) { return '<div class="wa-col"><div class="wa-bl">' + p.label + '</div>' + (p.when ? '<div class="wa-bw">' + p.when + '</div>' : '') + conn + seq(p.steps) + '</div>'; }).join('');
    return '<div class="wa-bwrap"><div class="wa-node"><div class="wa-ic wa-logic">' + svg('fork') + '</div><div><div class="wa-nt">If / Else</div><div class="wa-nd">' + b['if'] + '</div></div></div><div class="wa-ln" style="height:14px"></div><div class="wa-cols">' + cols + '</div></div>';
  }
  function trigHTML(tr) {
    var m = TRIG[tr[0]], isNew = false;
    return '<div class="wa-tcard' + (isNew ? ' added' : '') + '"><div class="wa-th"><div class="wa-ti">' + svg(m[1]) + '</div><div class="wa-tk">' + m[0] + '</div></div><div class="wa-tb">' + fmt(tr[1]) + (isNew ? ' <span class="wa-dot new">NEW</span>' : '') + '</div></div>';
  }
  function render() {
    var area = document.getElementById('bpxViewArea'); if (!area) return;
    var w0 = WF.filter(function (w) { return w.id === S.sel; })[0]; if (!w0 || !avail(w0)) S.sel = '01';
    var list = WF.filter(avail);
    var nNew = list.filter(function (w) { return status(w) === 'new'; }).length, nChg = list.filter(function (w) { return status(w) === 'chg'; }).length;
    var h = '<div class="wa"><div class="wa-top"><div class="wa-sum"><span class="wa-pill"><b>' + list.length + '</b>&nbsp;automations running on your ' + PLANS[S.plan].name + ' plan</span></div></div>';
    h += '<div class="wa-lay"><aside class="wa-list">';
    var shut = [];
    [6, 7, 1, 2, 3, 4, 5].forEach(function (f) {
      var items = WF.filter(function (w) { return w.folder === f && avail(w); });
      var locked = WF.filter(function (w) { return w.folder === f && !avail(w) && !hidden(w); });
      if (!items.length && locked.length) {   /* a whole folder above this plan: kept for the locked section at the end */
        var need = Math.min.apply(null, locked.map(function (w) { return w.from; }));
        shut.push('<div class="wa-fold wa-lock" title="Not on your plan"><span class="wa-fi wa-padlock">' + LOCK + '</span><span class="wa-fn">' + FOLDERS[f] + '</span>'
          + '<span class="wa-need">' + PLANS[need].name + '</span></div>'
          + '<div class="wa-lockn">' + locked.length + ' automation' + (locked.length === 1 ? '' : 's') + ' · <a href="#" data-upg="' + PLANS[need].k + '">Upgrade to ' + PLANS[need].name + '</a></div>');
        return;
      }
      if (!items.length) return;
      if (!S.open) { S.open = {}; var sw = WF.filter(function (w) { return w.id === S.sel; })[0]; S.open[sw ? sw.folder : 1] = 1; }
      var op = !!S.open[f];
      h += '<button class="wa-fold' + (op ? ' open' : '') + '" data-fold="' + f + '" aria-expanded="' + op + '"><span class="wa-fi">' + svg(op ? 'folderOpen' : 'folder') + '</span><span class="wa-fn">' + FOLDERS[f] + '</span><span class="wa-fc">' + items.length + '</span><svg class="wa-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="wa-fbody' + (op ? ' open' : '') + '"><div class="wa-fin">';
      items.forEach(function (w) { var st = status(w), x = variant(w); h += '<button class="wa-wf' + (w.id === S.sel ? ' on' : '') + '" data-id="' + w.id + '"><span class="wa-num">' + w.id + '</span><span class="wa-nm">' + (x.name || w.name) + '</span>' + (st ? '<span class="wa-dot ' + st + '">' + (st === 'new' ? 'NEW' : 'UPGRADED') + '</span>' : '') + '</button>'; });
      if (locked.length) { var nd = Math.min.apply(null, locked.map(function (w) { return w.from; })); h += '<div class="wa-lockn wa-lockmore"><span class="wa-padlock">' + LOCK + '</span>' + locked.length + ' more locked · <a href="#" data-upg="' + PLANS[nd].k + '">' + PLANS[nd].name + '</a></div>'; }
      h += '</div></div>';
    });
    if (shut.length) h += '<div class="wa-lockhd"><span class="wa-padlock">' + LOCK + '</span>Not on your plan</div>' + shut.join('');
    var w = WF.filter(function (x) { return x.id === S.sel; })[0], x = variant(w), st = status(w), note = '';
    if (st === 'new') note = '<div class="wa-note newn">Added in ' + PLANS[S.plan].name + '.</div>';
    else if (st === 'chg') note = '<div class="wa-note"><b>Upgraded in ' + PLANS[S.plan].name + ':</b> ' + x.change + '</div>';
    
    var n = x.triggers.length, W = n * 232 - 12;
    var merge = n > 1 ? '<div class="wa-merge"><svg viewBox="0 0 ' + W + ' 28" preserveAspectRatio="none" style="width:' + W + 'px">' + x.triggers.map(function (_, i) { var X = i * 232 + 110, c = W / 2; return '<path d="M' + X + ' 0 C' + X + ' 14 ' + c + ' 14 ' + c + ' 28" fill="none" stroke="#c3cbd6" stroke-width="2"/>'; }).join('') + '</svg></div>' : '<div class="wa-ln" style="height:20px"></div>';
    var fired = w.kind && S.fired ? S.fired[w.kind] : null;
    var liveTxt = !w.kind || !S.fired ? 'Live' : fired ? 'Fired ' + fired.n + (fired.n === 1 ? ' time' : ' times') + ' · last ' + ago(fired.last) : 'Waiting for its first event';
    if (w.kind) note += '<div class="wa-note soft">BuilderPro sends this event to your CRM with the job’s details in the <b>BP</b> fields; the workflow there sends the messages. Edit the wording in your CRM’s workflow builder.</div>';
    if (w.id === '36') note += '<div class="wa-storm"><b>Send a storm follow-up</b><span>Past customers whose job address contains any of these ZIP codes or towns get the text.</span>'
      + '<input id="wa-st-area" placeholder="e.g. 91605, 91606, Van Nuys"><input id="wa-st-note" placeholder="Optional line added to the text (e.g. Hail on Oct 3)" maxlength="200">'
      + '<button class="bpx-addbtn" id="wa-st-go">Send to past customers</button><div class="wa-st-msg" id="wa-st-msg"></div></div>'
      + (window.bpStormSettingsHtml ? bpStormSettingsHtml() : '');
    h += '</aside><main class="wa-det"><div class="wa-dh"><div class="wa-crumb">' + FOLDERS[w.folder] + '</div><div class="wa-row"><span class="wa-num">' + w.id + '</span><h2>' + (x.name || w.name) + '</h2><span class="wa-live">' + liveTxt + '</span></div>' + note
      + '<div class="wa-sets">' + (x.settings || ['Default settings']).map(function (s) { return '<span class="wa-pill">' + s + '</span>'; }).join('') + '</div></div>'
      + '<div class="wa-canvas"><div class="wa-stage"><div class="wa-trigs">' + x.triggers.map(trigHTML).join('') + '</div>' + merge + seq(x.steps) + '</div></div>'
      + '<div class="wa-leg"><span><i class="wa-msg"></i>Customer message</span><span><i class="wa-contact"></i>Contact / tags</span><span><i class="wa-pipe"></i>Pipeline</span><span><i class="wa-alert"></i>Alert to you</span><span><i class="wa-wait"></i>Wait</span><span><i class="wa-sys"></i>System</span><span><i class="wa-logic"></i>If / else</span></div>'
      + '<p class="wa-foot">Texts to customers only go out in quiet hours (8am–8pm in their time zone). These run inside your CRM automatically; nothing to set up.</p></main></div></div>';
    area.innerHTML = h;
    area.querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { S.plan = +b.getAttribute('data-p'); render(); }; });
    area.querySelectorAll('[data-fold]').forEach(function (b) { b.onclick = function () {
      var f = +b.getAttribute('data-fold'), op = !S.open[f]; S.open[f] = op ? 1 : 0;
      b.classList.toggle('open', op); b.setAttribute('aria-expanded', op);
      b.querySelector('.wa-fi').innerHTML = svg(op ? 'folderOpen' : 'folder');
      var bd = b.nextElementSibling; if (bd) bd.classList.toggle('open', op);
    }; });
    area.querySelectorAll('[data-id]').forEach(function (b) { b.onclick = function () { S.sel = b.getAttribute('data-id'); render(); }; });
    area.querySelectorAll('[data-upg]').forEach(function (u) { u.onclick = function (e) { e.preventDefault(); if (window.bpChangePlan) bpChangePlan(u.getAttribute('data-upg')); }; });
    var sg = document.getElementById('wa-st-go');
    if (sg) sg.onclick = function () {
      var areas = String(document.getElementById('wa-st-area').value || '').split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 3; });
      var msg = document.getElementById('wa-st-msg');
      if (!areas.length) { msg.textContent = 'Type at least one ZIP code or town.'; return; }
      if (!(window.BP_LIVE && window.BP_SB)) { msg.textContent = 'Sign in to send it.'; return; }
      if (!confirm('Send the storm follow-up to past customers in ' + areas.join(', ') + '?')) return;
      sg.disabled = true; msg.textContent = 'Finding past customers…';
      Promise.resolve(BP_SB.rpc('ghl_storm_followup', { p_areas: areas, p_note: String(document.getElementById('wa-st-note').value || '') })).then(function (r) {
        sg.disabled = false; var d = r && r.data;
        msg.textContent = r && r.error ? 'Could not send: ' + r.error.message : d && d.ok ? (d.queued ? 'Sending to ' + d.queued + ' past customer' + (d.queued === 1 ? '' : 's') + ' in the next couple of minutes.' : 'No finished jobs found in those areas.') : 'Could not send.';
      }, function () { sg.disabled = false; msg.textContent = 'Could not send.'; });
    };
    var cv = area.querySelector('.wa-canvas'); if (cv) cv.scrollLeft = (cv.scrollWidth - cv.clientWidth) / 2;
    if (window.bpSpin) bpSpin(false);
  }
  function ago(t) { var m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; }
  /* how often each project automation has fired: the sent rows of ghl_events */
  function loadFired() {
    if (!(window.BP_LIVE && window.BP_SB)) return;
    try {
      Promise.resolve(BP_SB.from('ghl_events').select('kind,sent_at').eq('status', 'sent').order('sent_at', { ascending: false }).limit(1000)).then(function (r) {
        if (!r || r.error) return;
        var f = {}; (r.data || []).forEach(function (x) { var k = f[x.kind] || (f[x.kind] = { n: 0, last: x.sent_at }); k.n++; });
        S.fired = f; if (window._bpCurView === 'automations') render();
      }, function () {});
    } catch (e) {}
  }
  window.bpAutomations = function () {
    loadFired();
    var k = (window._bpAcct || {}).plan, i = PLANS.map(function (p) { return p.k; }).indexOf(k);
    S.mine = i < 0 ? 1 : i; S.plan = S.mine;
    render();
  };

  var css = document.createElement('style');
  css.textContent = '.wa-lock{cursor:default;color:#98a2b3 !important;background:#f8fafc !important;border:1px dashed #d0d5dd !important;border-radius:10px;margin:4px 0 0}.wa-lock:hover{background:#f8fafc !important;color:#98a2b3}.wa-lock .wa-fn{text-decoration:none;color:#667085}'
    + '.wa-padlock{display:inline-grid;place-items:center;width:16px;height:16px;color:#98a2b3;flex:0 0 16px}.wa-padlock svg{width:14px;height:14px}'
    + '.wa-need{margin-left:auto;font:600 10.5px/18px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#155eef;background:#eff4ff;border-radius:999px;padding:0 8px}'
    + '.wa-lockhd{display:flex;align-items:center;gap:6px;margin:14px 0 4px;padding:10px 6px 0;border-top:1px solid #eaecf0;font:600 11px/16px Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#667085}'
    + '.wa-lockn{font-size:12px;color:#788493;padding:4px 14px 8px 14px}.wa-lockn a{color:#006fff;font-weight:600}.wa-lockmore{display:flex;align-items:center;gap:6px;padding-left:14px}'
    + '.wa-storm{display:flex;flex-direction:column;gap:8px;background:#f5f8fb;border:1px solid #dce3ec;border-radius:12px;padding:12px 14px}.wa-storm b{font-size:14px}.wa-storm span{font-size:12.5px;color:#56657a}.wa-storm input{width:100%}.wa-storm .bpx-addbtn{align-self:flex-start}.wa-st-msg{font-size:12.5px;color:#34435a}'
    + '.wa{display:flex;flex-direction:column;gap:14px;--wl:#c3cbd6}'
    + '.wa-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px}.wa-sum{display:flex;flex-wrap:wrap;gap:8px}'
    + '.wa-pill{display:inline-flex;align-items:center;font-size:12px;padding:4px 10px;border-radius:99px;background:#fff;border:1px solid #dce3ec;color:#34435a}.wa-pill.new{background:#e3f5ea;border-color:transparent;color:#1e9e5a;font-weight:600}.wa-pill.chg{background:#fcf1de;border-color:transparent;color:#b06f0c;font-weight:600}'
    + '.wa-plans{display:flex;gap:4px;background:#fff;border:1px solid #dce3ec;border-radius:12px;padding:4px}.wa-plans button{all:unset;cursor:pointer;padding:7px 14px;border-radius:9px;display:flex;flex-direction:column}.wa-plans b{font-size:13.5px;font-weight:600}.wa-plans span{font-size:11.5px;color:#788493}.wa-plans button.on{background:#006fff;color:#fff}.wa-plans button.on span{color:rgba(255,255,255,.8)}'
    + '.wa-up{background:#e6f0ff;border-radius:12px;padding:10px 14px;font-size:14px;color:#001530}.wa-up a{color:#006fff;font-weight:600}'
    + '.wa-lay{display:grid;grid-template-columns:290px minmax(0,1fr);gap:14px;align-items:start}@media(max-width:900px){.wa-lay{grid-template-columns:minmax(0,1fr)}}'
    + '.wa-list{background:#fff;border:1px solid #dce3ec;border-radius:16px;padding:6px 0;max-height:calc(100vh - 220px);overflow:auto;position:sticky;top:12px}@media(max-width:900px){.wa-list{position:static;max-height:320px}}'
    + '.wa-fold{display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;cursor:pointer;font:inherit;text-align:left;padding:10px 14px;margin-top:2px;border-radius:10px;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#788493;font-weight:600;transition:background .2s,color .2s}.wa-fold:hover{background:rgba(78,110,242,.07);color:#4e6ef2}.wa-fold.open{color:#334155}'
    + '.wa-fi{display:inline-flex;transition:transform .3s cubic-bezier(.2,.8,.2,1)}.wa-fold.open .wa-fi{transform:scale(1.12);color:#4e6ef2}.wa-fold svg{width:15px;height:15px}.wa-fn{flex:1}'
    + '.wa-fc{font-size:10.5px;letter-spacing:0;padding:1px 7px;border-radius:999px;background:rgba(120,132,147,.12);color:#788493}'
    + '.wa-chev{width:14px!important;height:14px!important;transition:transform .3s cubic-bezier(.2,.8,.2,1)}.wa-fold.open .wa-chev{transform:rotate(90deg)}'
    + '.wa-fbody{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .35s cubic-bezier(.2,.8,.2,1),opacity .25s}.wa-fbody.open{grid-template-rows:1fr;opacity:1}.wa-fin{overflow:hidden;min-height:0}'
    + '@media (prefers-reduced-motion:reduce){.wa-fbody,.wa-chev,.wa-fi{transition:none}}'
    + '.wa-wf{all:unset;box-sizing:border-box;cursor:pointer;display:grid;grid-template-columns:34px 1fr auto;gap:6px;align-items:center;width:100%;padding:7px 14px;font-size:13.5px}.wa-wf:hover{background:#f5f8fb}.wa-wf.on{background:#e6f0ff}.wa-num{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#788493}'
    + '.wa-dot{font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px}.wa-dot.new{background:#e3f5ea;color:#1e9e5a}.wa-dot.chg{background:#fcf1de;color:#b06f0c}'
    + '.wa-det{display:flex;flex-direction:column;gap:12px;min-width:0}.wa-dh{background:#fff;border:1px solid #dce3ec;border-radius:16px;padding:14px 18px;display:flex;flex-direction:column;gap:8px}.wa-crumb{font-size:12px;color:#788493}.wa-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.wa-row h2{margin:0;font-size:18px;font-weight:600}'
    + '.wa-live{font-size:11px;font-weight:600;color:#1e9e5a;border:1px solid rgba(30,158,90,.4);border-radius:99px;padding:1px 8px}.wa-note{font-size:13px;background:#fcf1de;border-radius:8px;padding:8px 10px;border-left:3px solid #c27a0e}.wa-note.newn{background:#e3f5ea;border-left-color:#1e9e5a}.wa-note.soft{background:#f5f8fb;border-left-color:#c3cbd6}.wa-sets{display:flex;flex-wrap:wrap;gap:6px}'
    + '.wa-canvas{border:1px solid #dce3ec;border-radius:16px;overflow:auto;background:#eef1f5;background-image:radial-gradient(#cdd4de 1px,transparent 1px);background-size:18px 18px;min-height:420px}.wa-stage{width:max-content;min-width:100%;padding:26px 22px 34px;display:flex;flex-direction:column;align-items:center}'
    + '.wa-trigs{display:flex;gap:12px}.wa-tcard{width:220px;background:#fff;border:1px solid #c3cbd6;border-radius:8px;overflow:hidden}.wa-tcard.added{outline:2px solid #1e9e5a;outline-offset:1px}.wa-th{display:flex;gap:8px;align-items:center;padding:9px 10px 6px}.wa-ti{width:26px;height:26px;border-radius:6px;background:#e6f0ff;color:#006fff;display:grid;place-items:center}.wa-ti svg{width:15px;height:15px}.wa-tk{font-size:11.5px;color:#006fff;font-weight:600}.wa-tb{padding:0 10px 9px;font-size:12px;color:#5d6778}'
    + '.wa-merge{position:relative;height:28px;width:100%;display:flex;justify-content:center}.wa-merge svg{height:28px;overflow:visible}'
    + '.wa-conn{display:flex;flex-direction:column;align-items:center}.wa-ln{width:2px;height:14px;background:#c3cbd6}.wa-plus{width:16px;height:16px;border-radius:50%;border:1.5px solid #c3cbd6;background:#fff;color:#788493;display:grid;place-items:center;font-size:11px;line-height:1}'
    + '.wa-node{width:260px;background:#fff;border:1px solid #c3cbd6;border-radius:8px;display:grid;grid-template-columns:30px 1fr;gap:9px;padding:9px 10px;position:relative}.wa-node.isnew{outline:2px solid #1e9e5a;outline-offset:1px}.wa-nbadge{position:absolute;top:-9px;right:8px;font-size:10px;font-weight:700;background:#1e9e5a;color:#fff;border-radius:4px;padding:1px 6px}'
    + '.wa-ic{width:30px;height:30px;border-radius:7px;display:grid;place-items:center;color:#fff}.wa-ic svg{width:16px;height:16px}.wa-nt{font-size:13px;font-weight:600}.wa-nd{font-size:12px;color:#5d6778;overflow-wrap:anywhere}'
    + '.wa-msg{background:#1e9e5a}.wa-contact{background:#2f6feb}.wa-pipe{background:#7a4fd6}.wa-alert{background:#e07b12}.wa-wait{background:#c99312}.wa-sys{background:#5b6b82}.wa-logic{background:#b8437a}'
    + '.wa-chip{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:11px;background:#e6f0ff;color:#006fff;border-radius:4px;padding:0 4px}.wa-tg{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:11px;background:#e3e8ef;color:#1b2230;border-radius:4px;padding:0 5px}'
    + '.wa-end{font-size:11px;font-weight:600;color:#788493;background:#e3e8ef;border-radius:99px;padding:3px 12px;letter-spacing:.05em}.wa-goto{font-size:11.5px;color:#5b6b82;border:1.5px dashed #5b6b82;border-radius:99px;padding:3px 10px}'
    + '.wa-bwrap{display:flex;flex-direction:column;align-items:center}.wa-cols{display:flex;gap:18px;align-items:flex-start;position:relative;padding-top:14px;border-top:2px solid #c3cbd6}.wa-col{display:flex;flex-direction:column;align-items:center}'
    + '.wa-bl{font-size:11.5px;font-weight:600;background:#fff;border:1.5px solid #b8437a;color:#b8437a;border-radius:99px;padding:2px 10px;max-width:240px;text-align:center}.wa-bw{font-size:11px;color:#788493;margin-top:3px;max-width:240px;text-align:center}'
    + '.wa-leg{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:#5d6778}.wa-leg span{display:inline-flex;align-items:center;gap:6px}.wa-leg i{width:10px;height:10px;border-radius:3px;display:inline-block}.wa-foot{font-size:12px;color:#788493;margin:0}';
  document.head.appendChild(css);
})();
