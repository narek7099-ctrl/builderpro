/* ==================================================================
   Leads → Automations: every workflow in the account's GHL template,
   drawn the way it sits in the GHL builder. Opens on the account's own
   plan (Foundation / OS / Enterprise); higher plans can be previewed.
   The data mirrors the three snapshots built from GHL-BUILD-SPEC.md.
   ================================================================== */
(function () {
  'use strict';
  var PLANS = [{ k: 'foundation', name: 'Foundation', price: '$99' }, { k: 'os', name: 'OS', price: '$199' }, { k: 'enterprise', name: 'Enterprise', price: '$299' }];
  var FOLDERS = { 1: 'Leads and AI', 2: 'Appointments', 3: 'Estimates and Payments', 4: 'Follow-up and Reviews', 5: 'Enterprise' };
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
    folder: '<path d="M3 6h7l2 2h9v11H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
  };
  var svg = function (k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + I[k] + '</svg>'; };
  var STEP = {
    sms: ['Send SMS', 'sms', 'msg'], email: ['Send email', 'email', 'msg'],
    tag: ['Add contact tag', 'tag', 'contact'], tagx: ['Remove contact tag', 'tag', 'contact'],
    field: ['Update contact field', 'pencil', 'contact'], contact: ['Create / update contact', 'person', 'contact'], note: ['Add note', 'note', 'contact'],
    opp: ['Create / update opportunity', 'pipe', 'pipe'], stage: ['Move opportunity stage', 'pipe', 'pipe'],
    alert: ['Internal notification', 'bell', 'alert'], wait: ['Wait', 'clock', 'wait'],
    hook: ['Webhook', 'bolt', 'sys'], rm: ['Remove from workflow', 'exit', 'sys']
  };
  var TRIG = { tag: ['Contact tag', 'tag'], form: ['Form submitted', 'form'], hook: ['Inbound webhook', 'bolt'], ai: ['Conversation AI', 'spark'], call: ['Call status', 'phone'], reply: ['Customer replied', 'sms'], appt: ['Appointment status', 'cal'], est: ['Estimate status', 'doc'], inv: ['Invoice status', 'doc'], opp: ['Opportunity status', 'pipe'], date: ['Custom date reminder', 'cal'] };
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
    { id: '17', name: 'Radar Contacted - Opener', folder: 1, from: 1, v: [v(1, { triggers: [['tag', 'Tag added: ' + tg('radar-contacted')]], steps: [['field', 'BP Opener = the Lead Radar opener line'], ['tag', tg('bot-active') + ' → 01 AI Qualifier (skips customers and excluded)'], E] })] },
    { id: '18', name: 'Radar Digest - Owner SMS', folder: 1, from: 1, v: [v(1, { triggers: [['tag', 'Tag added: ' + tg('radar-digest') + ' (sent each day by Lead Radar)']], settings: ['Re-entry on'], steps: [['sms', 'Your {{contact.radar_digest_count}} new Lead Radar leads are ready'], E] })] },
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
  ];

  var fmt = function (s) { return String(s).replace(/\{\{([^}]+)\}\}/g, function (m, k) { return '<span class="wa-chip">' + k.trim() + '</span>'; }); };
  var S = { plan: null, sel: '01', mine: 1 };
  var avail = function (w) { return w.from <= S.plan; };
  var variant = function (w) { var x = w.v[0]; w.v.forEach(function (y) { if (y.from <= S.plan) x = y; }); return x; };
  var status = function (w) { if (S.plan > 0 && w.from === S.plan) return 'new'; var x = variant(w); if (S.plan > 0 && x.from === S.plan && w.from < S.plan) return 'chg'; return ''; };
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
    var m = TRIG[tr[0]], isNew = tr[2] != null && tr[2] === S.plan && S.plan > 0;
    return '<div class="wa-tcard' + (isNew ? ' added' : '') + '"><div class="wa-th"><div class="wa-ti">' + svg(m[1]) + '</div><div class="wa-tk">' + m[0] + '</div></div><div class="wa-tb">' + fmt(tr[1]) + (isNew ? ' <span class="wa-dot new">NEW</span>' : '') + '</div></div>';
  }
  function render() {
    var area = document.getElementById('bpxViewArea'); if (!area) return;
    var w0 = WF.filter(function (w) { return w.id === S.sel; })[0]; if (!w0 || !avail(w0)) S.sel = '01';
    var list = WF.filter(avail);
    var nNew = list.filter(function (w) { return status(w) === 'new'; }).length, nChg = list.filter(function (w) { return status(w) === 'chg'; }).length;
    var h = '<div class="wa"><div class="wa-top"><div class="wa-sum"><span class="wa-pill"><b>' + list.length + '</b>&nbsp;automations running</span>'
      + (S.plan > 0 ? '<span class="wa-pill new">' + nNew + ' added in ' + PLANS[S.plan].name + '</span>' + (nChg ? '<span class="wa-pill chg">' + nChg + ' upgraded</span>' : '') : '') + '</div>'
      + '<div class="wa-plans">' + PLANS.map(function (p, i) { return '<button data-p="' + i + '" class="' + (i === S.plan ? 'on' : '') + '"><b>' + p.name + (i === S.mine ? ' · yours' : '') + '</b><span>' + p.price + ' / mo</span></button>'; }).join('') + '</div></div>';
    if (S.plan > S.mine) h += '<div class="wa-up">You are previewing the ' + PLANS[S.plan].name + ' plan. <a href="#" data-upg="' + PLANS[S.plan].k + '">Upgrade</a> to switch these on in your account.</div>';
    h += '<div class="wa-lay"><aside class="wa-list">';
    [1, 2, 3, 4, 5].forEach(function (f) {
      var items = WF.filter(function (w) { return w.folder === f && avail(w); }); if (!items.length) return;
      h += '<div class="wa-fold">' + svg('folder') + FOLDERS[f] + '</div>';
      items.forEach(function (w) { var st = status(w), x = variant(w); h += '<button class="wa-wf' + (w.id === S.sel ? ' on' : '') + '" data-id="' + w.id + '"><span class="wa-num">' + w.id + '</span><span class="wa-nm">' + (x.name || w.name) + '</span>' + (st ? '<span class="wa-dot ' + st + '">' + (st === 'new' ? 'NEW' : 'UPGRADED') + '</span>' : '') + '</button>'; });
    });
    var w = WF.filter(function (x) { return x.id === S.sel; })[0], x = variant(w), st = status(w), note = '';
    if (st === 'new') note = '<div class="wa-note newn">Added in ' + PLANS[S.plan].name + '.</div>';
    else if (st === 'chg') note = '<div class="wa-note"><b>Upgraded in ' + PLANS[S.plan].name + ':</b> ' + x.change + '</div>';
    else if (w.v.length > 1 && S.plan < w.v[w.v.length - 1].from) { var up = w.v[w.v.length - 1]; note = '<div class="wa-note soft">On ' + PLANS[up.from].name + ': ' + up.change + '</div>'; }
    var n = x.triggers.length, W = n * 232 - 12;
    var merge = n > 1 ? '<div class="wa-merge"><svg viewBox="0 0 ' + W + ' 28" preserveAspectRatio="none" style="width:' + W + 'px">' + x.triggers.map(function (_, i) { var X = i * 232 + 110, c = W / 2; return '<path d="M' + X + ' 0 C' + X + ' 14 ' + c + ' 14 ' + c + ' 28" fill="none" stroke="#c3cbd6" stroke-width="2"/>'; }).join('') + '</svg></div>' : '<div class="wa-ln" style="height:20px"></div>';
    h += '</aside><main class="wa-det"><div class="wa-dh"><div class="wa-crumb">' + FOLDERS[w.folder] + '</div><div class="wa-row"><span class="wa-num">' + w.id + '</span><h2>' + (x.name || w.name) + '</h2><span class="wa-live">' + (S.plan > S.mine ? 'Preview' : 'Live') + '</span></div>' + note
      + '<div class="wa-sets">' + (x.settings || ['Default settings']).map(function (s) { return '<span class="wa-pill">' + s + '</span>'; }).join('') + '</div></div>'
      + '<div class="wa-canvas"><div class="wa-stage"><div class="wa-trigs">' + x.triggers.map(trigHTML).join('') + '</div>' + merge + seq(x.steps) + '</div></div>'
      + '<div class="wa-leg"><span><i class="wa-msg"></i>Customer message</span><span><i class="wa-contact"></i>Contact / tags</span><span><i class="wa-pipe"></i>Pipeline</span><span><i class="wa-alert"></i>Alert to you</span><span><i class="wa-wait"></i>Wait</span><span><i class="wa-sys"></i>System</span><span><i class="wa-logic"></i>If / else</span></div>'
      + '<p class="wa-foot">Texts to customers only go out in quiet hours (8am–8pm in their time zone). These run inside your CRM automatically; nothing to set up.</p></main></div></div>';
    area.innerHTML = h;
    area.querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { S.plan = +b.getAttribute('data-p'); render(); }; });
    area.querySelectorAll('[data-id]').forEach(function (b) { b.onclick = function () { S.sel = b.getAttribute('data-id'); render(); }; });
    var u = area.querySelector('[data-upg]'); if (u) u.onclick = function (e) { e.preventDefault(); if (window.bpChangePlan) bpChangePlan(u.getAttribute('data-upg')); };
    var cv = area.querySelector('.wa-canvas'); if (cv) cv.scrollLeft = (cv.scrollWidth - cv.clientWidth) / 2;
    if (window.bpSpin) bpSpin(false);
  }
  window.bpAutomations = function () {
    var k = (window._bpAcct || {}).plan, i = PLANS.map(function (p) { return p.k; }).indexOf(k);
    S.mine = i < 0 ? 1 : i; if (S.plan == null) S.plan = S.mine;
    render();
  };

  var css = document.createElement('style');
  css.textContent = '.wa{display:flex;flex-direction:column;gap:14px;--wl:#c3cbd6}'
    + '.wa-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px}.wa-sum{display:flex;flex-wrap:wrap;gap:8px}'
    + '.wa-pill{display:inline-flex;align-items:center;font-size:12px;padding:4px 10px;border-radius:99px;background:#fff;border:1px solid #dce3ec;color:#34435a}.wa-pill.new{background:#e3f5ea;border-color:transparent;color:#1e9e5a;font-weight:600}.wa-pill.chg{background:#fcf1de;border-color:transparent;color:#b06f0c;font-weight:600}'
    + '.wa-plans{display:flex;gap:4px;background:#fff;border:1px solid #dce3ec;border-radius:12px;padding:4px}.wa-plans button{all:unset;cursor:pointer;padding:7px 14px;border-radius:9px;display:flex;flex-direction:column}.wa-plans b{font-size:13.5px;font-weight:600}.wa-plans span{font-size:11.5px;color:#788493}.wa-plans button.on{background:#006fff;color:#fff}.wa-plans button.on span{color:rgba(255,255,255,.8)}'
    + '.wa-up{background:#e6f0ff;border-radius:12px;padding:10px 14px;font-size:14px;color:#001530}.wa-up a{color:#006fff;font-weight:600}'
    + '.wa-lay{display:grid;grid-template-columns:290px minmax(0,1fr);gap:14px;align-items:start}@media(max-width:900px){.wa-lay{grid-template-columns:minmax(0,1fr)}}'
    + '.wa-list{background:#fff;border:1px solid #dce3ec;border-radius:16px;padding:6px 0;max-height:calc(100vh - 220px);overflow:auto;position:sticky;top:12px}@media(max-width:900px){.wa-list{position:static;max-height:320px}}'
    + '.wa-fold{display:flex;align-items:center;gap:6px;padding:10px 14px 4px;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#788493;font-weight:600}.wa-fold svg{width:14px;height:14px}'
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
