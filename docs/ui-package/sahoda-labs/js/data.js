/*  Mock data. Single source of truth for every page, so numbers stay
    consistent when the same entity appears in more than one place.      */

const DB = {
    user: { name: 'Meera Patnaik', short: 'Meera', initials: 'MP', role: 'Workspace Admin', email: 'meera@sahodalabs.com', tz: 'Asia/Kolkata (GMT+5:30)', lang: 'English' },
    workspace: { name: 'Sunrise Dental', location: 'Bhubaneswar, India', initial: 'S' },
    workspaces: [
        { name: 'Sunrise Dental', location: 'Bhubaneswar, India', initial: 'S' },
        { name: 'Kalinga Cafe', location: 'Cuttack, India', initial: 'K' },
        { name: 'Sahoda Labs', location: 'Internal workspace', initial: 'A' },
    ],
    credits: { used: 170, total: 300, get left() { return this.total - this.used; }, refill: '1 Aug 2026' },

    metrics: [
        { k: 'followers', label: 'Followers', value: '18.2K', delta: 12.5, dir: 'up', spark: [8, 11, 9, 14, 13, 17, 16, 21, 24, 22, 27, 31] },
        { k: 'reach', label: 'Reach', value: '245.6K', delta: 18.3, dir: 'up', spark: [12, 15, 13, 19, 24, 21, 28, 26, 33, 37, 35, 42] },
        { k: 'conversions', label: 'Conversions', value: '2.45K', delta: 8.7, dir: 'up', spark: [14, 12, 17, 15, 19, 18, 22, 20, 25, 23, 28, 30] },
        { k: 'revenue', label: 'Revenue', value: '₹24.8K', delta: 16.2, dir: 'up', spark: [9, 13, 11, 16, 15, 20, 23, 21, 26, 30, 28, 34] },
        { k: 'roas', label: 'ROAS', value: '4.2x', delta: 3.1, dir: 'down', spark: [22, 24, 23, 26, 25, 24, 27, 26, 25, 24, 23, 22] },
    ],
    score: { value: 87, label: 'Excellent' },

    approvals: [
        {
            id: 'ap1', platform: 'instagram', kind: 'Post', title: 'Instagram Post Review',
            desc: 'New product launch announcement', priority: 'High', due: 'Due in 3h', dueSort: 3,
            progress: 75, status: 'pending', reach: '~74K', credits: 6,
            ai: 'Recommends publishing at 10:00 AM — your audience peaks between 9:40 and 10:20.',
            caption: 'Say hello to brighter mornings ✨ Our new whitening treatment is here — gentle, dentist-designed and just 30 minutes. Book this week and get a free consultation.\n\n#SunriseDental #Bhubaneswar #SmileCare',
            audience: 'Adults 25–45, Bhubaneswar + 40km', schedule: 'Today, 10:00 AM',
            predict: { reach: '68K–81K', engage: '4.1%', conv: '112–140' },
        },
        {
            id: 'ap2', platform: 'linkedin', kind: 'Campaign', title: 'LinkedIn Ad Campaign',
            desc: 'B2B campaign performance needs optimization', priority: 'Medium', due: 'Due in 6h', dueSort: 6,
            progress: 40, status: 'pending', reach: '~122K', credits: 8,
            ai: 'CTR is 0.8% against a 1.4% benchmark. Recommends tightening the headline and narrowing to decision-makers.',
            caption: 'Corporate dental plans that your team will actually use. Transparent pricing, on-site screenings, zero paperwork.',
            audience: 'HR & Ops leads, 50–500 employee companies', schedule: 'Today, 2:00 PM',
            predict: { reach: '110K–134K', engage: '1.9%', conv: '48–70' },
        },
        {
            id: 'ap3', platform: 'whatsapp', kind: 'Broadcast', title: 'Weekend Offer Broadcast',
            desc: 'Reminder to 214 opted-in customers', priority: 'Medium', due: 'Due tomorrow', dueSort: 22,
            progress: 90, status: 'pending', reach: '214', credits: 3,
            ai: 'Audience is clean — 214 opted-in contacts, 0 duplicates. Safe to send.',
            caption: 'Weekend only — 20% off cleaning & polishing. Reply BOOK to grab a slot.',
            audience: '214 opted-in customers', schedule: 'Tomorrow, 10:00 AM',
            predict: { reach: '214', engage: '31%', conv: '18–26' },
        },
        {
            id: 'ap4', platform: 'tiktok', kind: 'Post', title: 'TikTok Teaser Video',
            desc: 'Short video teaser for new collection', priority: 'Low', due: 'Due Tue', dueSort: 48,
            progress: 60, status: 'pending', reach: '~38K', credits: 5,
            ai: 'Hook lands at 0:03. Recommends trimming the intro by one second.',
            caption: 'POV: you finally booked that dentist appointment 🦷',
            audience: 'Ages 18–34, India', schedule: 'Tue, 12:00 PM',
            predict: { reach: '31K–44K', engage: '6.2%', conv: '20–34' },
        },
        {
            id: 'ap5', platform: 'googleads', kind: 'Ad', title: 'Search Ad Copy Refresh',
            desc: 'Three new headline variants generated', priority: 'Low', due: 'Due Thu', dueSort: 72,
            progress: 100, status: 'pending', reach: '~56K', credits: 4,
            ai: 'Variant B scores highest on intent match. Recommends an 60/20/20 split test.',
            caption: 'Dentist in Bhubaneswar · Same-day appointments · Transparent pricing',
            audience: 'Search intent: "dentist near me"', schedule: 'Thu, 9:00 AM',
            predict: { reach: '52K–61K', engage: '3.4%', conv: '90–120' },
        },
    ],

    activity: [
        { t: 'Generated 3 Instagram posts', ago: '2m ago', kind: 'done' },
        { t: 'Scheduled 4 social posts', ago: '15m ago', kind: 'done' },
        { t: 'Replied to 12 customer messages', ago: '1h ago', kind: 'done' },
        { t: 'Found 2 content opportunities', ago: '2h ago', kind: 'ai' },
        { t: 'Refreshed competitor analysis', ago: '4h ago', kind: 'done' },
        { t: 'Optimised Google Ads bids', ago: '6h ago', kind: 'done' },
    ],

    events: [
        { d: 1, platform: 'instagram', kind: 'Post', time: '10:00 AM', title: 'Product launch post', stage: 'Scheduled' },
        { d: 3, platform: 'linkedin', kind: 'Campaign', time: '2:00 PM', title: 'B2B campaign push', stage: 'Scheduled' },
        { d: 7, platform: 'instagram', kind: 'Story', time: '11:00 AM', title: 'Behind the scenes', stage: 'Draft' },
        { d: 9, platform: 'googleads', kind: 'Ad Set', time: '1:30 PM', title: 'Search ad refresh', stage: 'Review' },
        { d: 13, platform: 'whatsapp', kind: 'Broadcast', time: '10:00 AM', title: 'Weekend offer', stage: 'Scheduled' },
        { d: 15, platform: 'email', kind: 'Report', time: '4:00 PM', title: 'Weekly report', stage: 'Review' },
        { d: 21, platform: 'tiktok', kind: 'Post', time: '12:00 PM', title: 'Teaser video', stage: 'Scheduled' },
        { d: 24, platform: 'youtube', kind: 'Video', time: '3:00 PM', title: 'Clinic tour', stage: 'Ideas' },
        { d: 27, platform: 'linkedin', kind: 'Article', time: '10:30 AM', title: 'Oral health at work', stage: 'Draft' },
        { d: 29, platform: 'instagram', kind: 'Post', time: '10:00 AM', title: 'Patient story', stage: 'Scheduled' },
        { d: 30, platform: 'email', kind: 'Newsletter', time: '2:30 PM', title: 'Monthly newsletter', stage: 'Draft' },
        { d: 31, platform: 'googleanalytics', kind: 'Review', time: '11:00 AM', title: 'Analytics review', stage: 'Published' },
    ],

    week: [
        { day: 'Mon', date: '4 Aug', items: [{ platform: 'instagram', kind: 'Post', time: '10:00 AM' }] },
        { day: 'Tue', date: '5 Aug', items: [{ platform: 'instagram', kind: 'Story', time: '11:00 AM' }] },
        { day: 'Wed', date: '6 Aug', today: true, items: [{ platform: 'linkedin', kind: 'Campaign', time: '2:00 PM' }] },
        { day: 'Thu', date: '7 Aug', items: [{ platform: 'instagram', kind: 'Post', time: '10:00 AM' }] },
        { day: 'Fri', date: '8 Aug', items: [{ platform: 'email', kind: 'Report', time: '4:00 PM' }] },
        { day: 'Sat', date: '9 Aug', items: [{ platform: 'tiktok', kind: 'Story', time: '11:00 AM' }] },
        { day: 'Sun', date: '10 Aug', items: [] },
    ],

    brand: {
        completeness: 92,
        voice: 'Professional', style: 'Friendly', color: '#FF6600',
        audience: '25–45 yrs', competitors: 12, docs: 120,
        mission: 'Make quality dental care feel calm, transparent and genuinely easy to book.',
        positioning: 'The clinic that explains everything before it treats anything.',
        description: 'Sunrise Dental is a modern family dental practice in Bhubaneswar offering preventive, cosmetic and paediatric care with transparent pricing.',
        tone: { formal: 38, playful: 45, detail: 55 },
        traits: ['Professional', 'Confident', 'Friendly', 'Reassuring'],
        example: 'Your appointment is confirmed for Thursday at 4 PM. We have set aside 45 minutes so nothing feels rushed — bring any previous X-rays if you have them.',
        typography: { heading: 'Inter Semibold', body: 'Inter Regular' },
        colors: ['#FF6600', '#000000', '#575756', '#DCDCDC', '#FFFFFF'],
        aud: {
            age: '25–45', location: 'Bhubaneswar + 40km', income: '₹6L–₹18L household',
            interests: ['Family health', 'Preventive care', 'Cosmetic dentistry', 'Insurance plans'],
            pains: ['Fear of hidden costs', 'Long waiting times', 'Unclear treatment plans'],
            goals: ['Painless treatment', 'Transparent pricing', 'Weekend availability'],
            behaviour: 'Researches on Google, validates on Instagram, books over WhatsApp.',
        },
        rivals: [
            { name: 'Smile Studio', pos: 'Premium cosmetic', strength: 'Strong Instagram presence', weak: 'Expensive, no weekend hours', activity: 'High', posts: 24 },
            { name: 'City Dental Care', pos: 'Volume / low cost', strength: 'Aggressive pricing', weak: 'Inconsistent reviews', activity: 'Medium', posts: 11 },
            { name: 'Dr. Rao Clinic', pos: 'Established family', strength: '20 years of trust', weak: 'Almost no digital presence', activity: 'Low', posts: 3 },
        ],
        knowledge: [
            { name: 'Treatment price list 2026.pdf', cat: 'Pricing', size: '820 KB', indexed: true, when: '2 days ago' },
            { name: 'Patient FAQ.docx', cat: 'Support', size: '145 KB', indexed: true, when: '5 days ago' },
            { name: 'Brand guidelines.pdf', cat: 'Brand', size: '4.2 MB', indexed: true, when: '2 weeks ago' },
            { name: 'Insurance partners.xlsx', cat: 'Operations', size: '96 KB', indexed: false, when: '1 hour ago' },
            { name: 'Clinic tour script.md', cat: 'Content', size: '12 KB', indexed: true, when: '3 weeks ago' },
        ],
    },

    connections: [
        { k: 'instagram', group: 'Social', status: 'connected', sync: '2 min ago', account: '@sunrisedental' },
        { k: 'facebook', group: 'Social', status: 'connected', sync: '5 min ago', account: 'Sunrise Dental' },
        { k: 'linkedin', group: 'Social', status: 'connected', sync: '12 min ago', account: 'Sunrise Dental' },
        { k: 'tiktok', group: 'Social', status: 'error', sync: '3 days ago', account: '@sunrisedental', err: 'Authorization expired' },
        { k: 'youtube', group: 'Social', status: 'disconnected', sync: '—', account: '—' },
        { k: 'googleads', group: 'Advertising', status: 'connected', sync: '1 min ago', account: '412-889-2031' },
        { k: 'metaads', group: 'Advertising', status: 'connected', sync: '4 min ago', account: 'Sunrise Ads' },
        { k: 'shopify', group: 'Commerce', status: 'connected', sync: '8 min ago', account: 'sunrise-store' },
        { k: 'whatsapp', group: 'Messaging', status: 'connected', sync: '1 min ago', account: '+91 98••• ••210' },
        { k: 'telegram', group: 'Messaging', status: 'disconnected', sync: '—', account: '—' },
        { k: 'email', group: 'Messaging', status: 'connected', sync: '20 min ago', account: 'hello@sunrise.in' },
        { k: 'googleanalytics', group: 'Analytics', status: 'connected', sync: '3 min ago', account: 'GA4 · 291840' },
        { k: 'searchconsole', group: 'Analytics', status: 'disconnected', sync: '—', account: '—' },
    ],

    campaigns: [
        {
            id: 'c1', name: 'Whitening Launch', status: 'Active', objective: 'Sales',
            channels: ['instagram', 'facebook', 'googleads'], dates: '1 Jul – 31 Jul',
            budget: 45000, spent: 31200, reach: '128K', conv: 842, revenue: '₹9.4L', roas: '4.8x', health: 92,
        },
        {
            id: 'c2', name: 'Corporate Dental Plans', status: 'Active', objective: 'Leads',
            channels: ['linkedin', 'email'], dates: '12 Jul – 12 Aug',
            budget: 60000, spent: 22400, reach: '86K', conv: 214, revenue: '₹4.1L', roas: '2.9x', health: 74,
        },
        {
            id: 'c3', name: 'Monsoon Checkup Drive', status: 'Draft', objective: 'Awareness',
            channels: ['instagram', 'whatsapp'], dates: 'Starts 15 Aug',
            budget: 25000, spent: 0, reach: '—', conv: 0, revenue: '—', roas: '—', health: 48,
        },
        {
            id: 'c4', name: 'Kids Dental Week', status: 'Completed', objective: 'Engagement',
            channels: ['instagram', 'facebook'], dates: '1 Jun – 14 Jun',
            budget: 18000, spent: 17800, reach: '64K', conv: 388, revenue: '₹2.7L', roas: '3.4x', health: 88,
        },
    ],

    channelPerf: [
        { k: 'instagram', reach: '96.4K', eng: '5.2%', conv: 612, rev: '₹8.1L', share: 38 },
        { k: 'googleads', reach: '58.2K', eng: '3.4%', conv: 494, rev: '₹6.4L', share: 27 },
        { k: 'linkedin', reach: '42.1K', eng: '1.9%', conv: 208, rev: '₹4.2L', share: 17 },
        { k: 'facebook', reach: '31.6K', eng: '2.6%', conv: 174, rev: '₹2.8L', share: 11 },
        { k: 'whatsapp', reach: '12.4K', eng: '31%', conv: 132, rev: '₹1.9L', share: 5 },
        { k: 'tiktok', reach: '4.9K', eng: '6.1%', conv: 22, rev: '₹0.4L', share: 2 },
    ],

    insights: [
        { t: 'LinkedIn generated 24% more qualified traffic this week', d: 'Lead quality score rose from 61 to 76 while cost per lead fell 12%.', rec: 'Increase LinkedIn campaign allocation by 10%.', act: 'Apply recommendation' },
        { t: 'Instagram Reels outperform static posts 3.1x', d: 'Reels averaged 5.2% engagement against 1.7% for static images over 30 days.', rec: 'Shift 3 of next week’s 5 posts to Reels.', act: 'Update planner' },
        { t: 'Google Ads spend is front-loaded to low-intent hours', d: '38% of budget lands between 1–5 AM where conversion rate is 0.4%.', rec: 'Add a dayparting rule for 8 AM – 9 PM.', act: 'Apply recommendation' },
    ],

    conversations: [
        { id: 'v1', name: 'Ananya Sahu', platform: 'instagram', last: 'Do you have a slot on Saturday?', time: '2m', unread: 2, priority: 'High', tags: ['Booking'], orders: 3, spend: '₹18,400' },
        { id: 'v2', name: 'Rohit Mishra', platform: 'whatsapp', last: 'Thanks! See you Thursday.', time: '18m', unread: 0, priority: 'Normal', tags: ['Returning'], orders: 5, spend: '₹42,100' },
        { id: 'v3', name: 'Priya Nayak', platform: 'facebook', last: 'Is the whitening offer still on?', time: '1h', unread: 1, priority: 'Normal', tags: ['Offer'], orders: 1, spend: '₹4,800' },
        { id: 'v4', name: 'Karan Behera', platform: 'website', last: 'What does the consultation cost?', time: '3h', unread: 0, priority: 'Normal', tags: ['New'], orders: 0, spend: '₹0' },
        { id: 'v5', name: 'Sneha Dash', platform: 'instagram', last: 'Sent you the X-ray photos', time: '5h', unread: 0, priority: 'High', tags: ['Clinical'], orders: 2, spend: '₹11,900' },
    ],

    thread: [
        { me: false, t: 'Hi! Do you have a slot on Saturday?', at: '10:02 AM' },
        { me: true, t: 'Hello Ananya! Yes — we have 11:30 AM and 4:00 PM open this Saturday.', at: '10:04 AM' },
        { me: false, t: 'Perfect. Is that with Dr. Rao?', at: '10:06 AM' },
        { me: true, t: 'The 11:30 slot is with Dr. Rao, the 4 PM is with Dr. Patnaik. Both do the full checkup.', at: '10:07 AM' },
        { me: false, t: 'Do you have a slot on Saturday?', at: '10:31 AM' },
    ],

    assets: [
        { name: 'whitening-hero.png', type: 'Image', dim: '1080 × 1080', size: '842 KB', ai: true, when: '2 days ago', used: ['Whitening Launch'] },
        { name: 'clinic-tour.mp4', type: 'Video', dim: '1920 × 1080', size: '48 MB', ai: false, when: '5 days ago', used: ['Kids Dental Week'] },
        { name: 'logo-primary.svg', type: 'Logo', dim: 'Vector', size: '12 KB', ai: false, when: '1 month ago', used: ['All campaigns'] },
        { name: 'price-list.pdf', type: 'Document', dim: '4 pages', size: '820 KB', ai: false, when: '2 days ago', used: [] },
        { name: 'reel-cover-01.png', type: 'Image', dim: '1080 × 1920', size: '640 KB', ai: true, when: '1 week ago', used: ['Whitening Launch'] },
        { name: 'team-photo.jpg', type: 'Image', dim: '2400 × 1600', size: '3.1 MB', ai: false, when: '3 weeks ago', used: ['Corporate Dental Plans'] },
        { name: 'offer-banner.png', type: 'Image', dim: '1200 × 628', size: '410 KB', ai: true, when: '4 days ago', used: [] },
        { name: 'patient-story.mp4', type: 'Video', dim: '1080 × 1920', size: '22 MB', ai: false, when: '1 week ago', used: [] },
    ],

    notifications: [
        { cat: 'Approvals', t: 'Approval due in 2 hours', d: 'Instagram Post Review needs your decision.', ago: '12m', unread: true, urgent: true },
        { cat: 'Connections', t: 'TikTok requires reauthorization', d: 'The access token expired 3 days ago.', ago: '1h', unread: true, urgent: true },
        { cat: 'AI', t: 'AI generated 3 new posts', d: 'Drafts are waiting in the planner.', ago: '2h', unread: true },
        { cat: 'Campaigns', t: 'Whitening Launch reached 10K users', d: 'Cost per result is 18% below target.', ago: '5h', unread: false },
        { cat: 'System', t: 'Weekly report is ready', d: 'Performance summary for 28 Jul – 3 Aug.', ago: '1d', unread: false },
    ],

    team: [
        { name: 'Meera Patnaik', email: 'meera@sahodalabs.com', role: 'Workspace Admin', initials: 'MP', status: 'Active' },
        { name: 'Priya Sethi', email: 'priya@sahodalabs.com', role: 'Editor', initials: 'PS', status: 'Active' },
        { name: 'Arjun Das', email: 'arjun@sahodalabs.com', role: 'Analyst', initials: 'AD', status: 'Active' },
        { name: 'Nikhil Roy', email: 'nikhil@sahodalabs.com', role: 'Viewer', initials: 'NR', status: 'Invited' },
    ],

    invoices: [
        { id: 'INV-2026-07', date: '1 Jul 2026', amount: '₹7,999', status: 'Paid' },
        { id: 'INV-2026-06', date: '1 Jun 2026', amount: '₹7,999', status: 'Paid' },
        { id: 'INV-2026-05', date: '1 May 2026', amount: '₹7,999', status: 'Paid' },
    ],

    creditUse: [
        { t: 'Image generation', n: 72, of: 300 },
        { t: 'Content generation', n: 54, of: 300 },
        { t: 'Research & analysis', n: 28, of: 300 },
        { t: 'Video generation', n: 16, of: 300 },
    ],

    revenueSeries: [18, 22, 19, 26, 24, 31, 28, 35, 33, 41, 38, 46, 44, 52],
    reachSeries: [40, 46, 43, 52, 58, 55, 66, 71, 68, 79, 84, 81, 92, 98],
    convSeries: [12, 14, 13, 17, 16, 21, 19, 24, 26, 25, 29, 32, 30, 36],
    engageSeries: [22, 25, 21, 28, 31, 27, 34, 32, 38, 36, 41, 39, 44, 47],
};

const STAGES = ['Ideas', 'Draft', 'Review', 'Scheduled', 'Published'];
