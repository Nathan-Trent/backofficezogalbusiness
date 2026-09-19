/**
 * Every editable sentence on business.getzogal.com, with its default.
 *
 * The site renders from site_content (live) and falls back to these
 * defaults field by field, so a missing row never blanks anything. The
 * Zogal Business back office renders its editors from this same file —
 * a new field is a line here, not a migration. Keep this file identical
 * in both repos (zogalbusiness/lib/content-schema.ts and
 * backofficezogalbusiness/lib/content-schema.ts).
 */
export type FieldKind = 'text' | 'long' | 'list' | 'pairs' | 'rows3'
export interface Field { key: string; label: string; kind: FieldKind; help?: string; default: unknown }
export interface Section { title: string; fields: Field[] }
export interface PageSchema { page: string; title: string; sections: Section[] }

const t = (key: string, label: string, d: string, help?: string): Field => ({ key, label, kind: 'text', default: d, help })
const long = (key: string, label: string, d: string, help?: string): Field => ({ key, label, kind: 'long', default: d, help })
const list = (key: string, label: string, d: string[], help?: string): Field => ({ key, label, kind: 'list', default: d, help })
const pairs = (key: string, label: string, d: [string, string][], help?: string): Field => ({ key, label, kind: 'pairs', default: d, help })
const rows3 = (key: string, label: string, d: [string, string, string][], help?: string): Field => ({ key, label, kind: 'rows3', default: d, help })

export const HOME: PageSchema = {
  page: 'home', title: 'Zogal Business site', sections: [
    { title: 'Cover', fields: [
      t('hero.eyebrow', 'Small line above the title', 'Zogal Business · est. Lagos'),
      long('hero.title', 'Title', 'Run the\nbusiness\non facts.', 'One line per row. The last word is coloured.'),
      long('hero.body', 'Under the title', 'Software for Nigerian businesses that would rather know than guess: what sold, what it cost, what is left, what is owed.'),
      t('hero.cta_primary', 'Main button', 'See Doka'),
      t('hero.cta_secondary', 'Second button', 'Product index'),
      rows3('daybook.rows', 'Day book rows', [['08:12', 'Opening stock counted', '412 units'], ['09:40', 'Delivery · full cream milk × 48', '₦86,400'], ['12:05', 'Sales so far · 31 receipts', '₦118,300'], ['15:30', 'Expense · generator diesel', '₦9,000'], ['18:55', 'Closing · takings', '₦184,500'], ['', 'Profit after cost & expenses', '₦41,200']], 'Time · what happened · figure. The last row is the total.'),
    ] },
    { title: 'Product index', fields: [
      t('index.eyebrow', 'Eyebrow', 'Product index'),
      long('index.body', 'Introduction', 'One product a business uses every single day, finished before the next begins. Each one has its own name and its own colour under the Zogal Business mark.'),
      t('index.doka.stamp', 'Doka stamp', 'Retail'),
      long('index.doka.body', 'Doka description', 'Point of sale, stock and true profit for shops. Keeps selling when the network doesn\'t; a dashboard that shows the owner real numbers from anywhere.'),
      list('index.doka.tags', 'Doka tags', ['Windows & Mac', 'Owner dashboard', 'Works offline', 'Tax already counted']),
      t('index.next.title', 'Second entry title', 'Next'),
      long('index.next.body', 'Second entry text', 'Announced when Doka is in enough shops to teach us what to build second.'),
    ] },
    { title: 'How we build', fields: [
      t('manifesto.eyebrow', 'Eyebrow', 'How we build'),
      long('manifesto.title', 'Statement', 'Most Nigerian businesses run on a notebook and a memory. We record the truth as it happens.'),
      pairs('manifesto.items', 'The three points', [['Nothing is overwritten.', 'Every sale, price change and correction is kept, with who did it and when. Mistakes are corrected on top, never rubbed out.'], ['It must work with no network.', 'A tool that stops when the data finishes is not a tool. Ours keep working and reconcile when the connection returns.'], ['The owner sees the real figure.', 'Profit after what the stock cost and what the business spent — not takings dressed up as profit.']]),
    ] },
    { title: 'Sign-off', fields: [
      t('signoff.title', 'Title', 'Know. Don\'t guess.'),
      long('signoff.body', 'Text', 'Doka is live. Create a shop in a minute; install Doka on the shop computer when you\'re ready.'),
      t('signoff.cta_primary', 'Main button', 'See Doka'),
      t('signoff.cta_secondary', 'Second button', 'Sign in'),
    ] },
    { title: 'Footer', fields: [
      long('footer.blurb', 'Footer sentence', 'Software for Nigerian businesses that would rather know than guess. A Zogal company.'),
      t('footer.made', 'Bottom right', 'Doka by Zogal · made in Lagos'),
    ] },
  ],
}

export const DOKA: PageSchema = {
  page: 'doka', title: 'Doka page', sections: [
    { title: 'Browser tab', fields: [
      t('meta.title', 'Tab title', 'Doka — the shop app that knows your profit'),
      long('meta.description', 'Search description', 'Point of sale, stock control and a ledger in one. Works offline. Doka by Zogal.'),
    ] },
    { title: 'Name plate', fields: [
      t('head.eyebrow', 'Above the name', 'by Zogal'),
      t('head.tagline', 'Tagline', 'The shop app that knows your profit.'),
      t('head.cta_primary', 'Main button', 'Create your shop'),
      t('head.cta_secondary', 'Second button', 'Get Doka'),
      t('till.caption', 'Under the app picture', 'Doka on the shop computer. Free to start · set up in an afternoon · no card needed.'),
    ] },
    { title: 'At the counter / on your phone', fields: [
      t('counter.eyebrow', 'Left eyebrow', 'At the counter'),
      t('counter.title', 'Left title', 'Scan. Tap. Take the money.'),
      long('counter.body', 'Left text', "Nothing on the screen a cashier doesn't need. Prices can't go below your floor. The network can go; Doka keeps selling."),
      t('phone.eyebrow', 'Right eyebrow', 'On your phone'),
      t('phone.title', 'Right title', 'Takings, profit, stock — any day.'),
      long('phone.body', 'Right text', 'Profit after what the stock cost and what you spent. Who sold what, on which terminal. What\'s running low. What the tax office will ask for.'),
    ] },
    { title: 'Specification', fields: [
      t('spec.eyebrow', 'Eyebrow', 'Specification'),
      t('spec.title', 'Title', 'What it does, in full.'),
      pairs('spec.items', 'The list', [
        ['Selling', 'Scan a barcode or tap an item. Price may go above the suggested price, never below the floor you set. Optional customer on any sale.'],
        ['Stock', 'Every delivery is a batch at its own cost. Old stock keeps its cost; the sale takes the oldest first. Two-step restock: quantity and cost, then your new selling price with the margin shown.'],
        ['Profit', 'Selling price minus what that exact unit cost, minus expenses. Today, yesterday, this month, any range.'],
        ['Offline', 'Doka runs from what it last downloaded. Sales queue on the computer and upload when the network returns; stock and today’s figures update locally meanwhile.'],
        ['Staff', 'Owner, manager, salesperson — or roles you define from a fixed list. Cashiers never see cost prices. Overrides need a manager PIN and are logged.'],
        ['Notebook photos', 'Still writing sales by hand? Photograph the page. Doka reads it into rows you check before anything is recorded.'],
        ['Tax', 'VAT and income-tax status update as you sell. Mark a period filed with the FIRS reference; the period locks and later entries become amendments.'],
        ['Terminals', 'Activate each shop computer with a one-time code from the dashboard. See which are online. Installed apps update themselves.'],
      ]),
    ] },
    { title: 'Getting started', fields: [
      t('start.eyebrow', 'Eyebrow', 'Getting started'),
      t('start.title', 'Title', 'An afternoon to set up. A minute to sell.'),
      long('start.body', 'Text', 'No accountant, no training day. If you can use a phone, you can run Doka.'),
      pairs('start.steps', 'The steps', [['Create the shop', 'A minute on your phone. No card.'], ['Get Doka on the shop computer', 'Windows or Mac. One activation code.'], ['Add items and cost', 'Or scan the barcodes.'], ['Sell', 'Everything else follows.']]),
    ] },
    { title: 'Get Doka', fields: [
      t('download.eyebrow', 'Eyebrow', 'Get Doka'),
      t('download.title', 'Title', 'Available for Windows and Mac.'),
      long('download.body', 'Text', 'Install Doka on the computer at the counter. You\'ll need an activation code from your dashboard the first time.'),
      long('download.mac_note', 'Mac note', 'Mac: if it says “Doka is damaged”, it isn’t — the Mac build is not yet registered with Apple. Open Terminal and run  xattr -cr /Applications/Doka.app  once, then open it normally.'),
    ] },
    { title: 'Pricing', fields: [
      t('pricing.eyebrow', 'Eyebrow', 'Pricing'),
      t('pricing.title', 'Title', 'Per shop, per month.'),
      long('pricing.body', 'Text', 'Change or cancel any time. Prices are set by Zogal and shown here as they stand.', 'The plans themselves come from Doka → Finance → Plans & prices.'),
    ] },
    { title: 'Questions', fields: [
      t('faq.eyebrow', 'Eyebrow', 'Questions'),
      pairs('faq.items', 'Questions and answers', [
        ['Does it work without internet?', 'Yes. Sales queue on the computer and upload when the connection returns. Stock and today’s figures keep updating locally.'],
        ['What do I need?', 'A Windows or Mac computer at the counter, any phone for the dashboard. A barcode scanner is optional.'],
        ['Can staff see cost prices?', 'Only if you allow it. Cashiers see selling prices and stock; cost, profit and reports are the owner’s.'],
        ['Is my data mine?', 'Yes. Each shop is separate, nothing is ever overwritten, and every change is kept with who made it.'],
      ]),
      t('end.cta', 'Last button', 'Start with Doka'),
      t('end.aside', 'Beside the button', 'or get Doka for your computer first'),
    ] },
    { title: 'Contact form', fields: [
      t('contact.title', 'Title', 'Ask us anything.'),
      long('contact.body', 'Text', 'A person at Zogal answers, usually the same day.'),
      t('contact.button', 'Button', 'Send'),
      t('contact.thanks', 'After sending', 'Got it — we\'ll write back to you soon.'),
    ] },
  ],
}

export const PAGES: PageSchema[] = [HOME, DOKA]
export const defaultsFor = (schema: PageSchema): Record<string, unknown> => Object.fromEntries(schema.sections.flatMap((s) => s.fields.map((f) => [f.key, f.default])))
