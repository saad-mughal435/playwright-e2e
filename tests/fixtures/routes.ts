/**
 * Single source of truth for the routes the suite exercises.
 * Keeping these in one place makes the smoke / project specs data-driven:
 * add a page here and it is automatically covered.
 */

export interface Route {
  path: string;
  name: string;
}

/** Core top-level pages. */
export const PAGES: Route[] = [
  { path: '/', name: 'Home' },
  { path: '/demo.html', name: 'MES / ERP demo walkthrough' },
  { path: '/contact.html', name: 'Contact' },
];

/** Interactive project demos linked from the homepage. */
export const PROJECTS: Route[] = [
  { path: '/app/', name: 'Kingsley MES live app' },
  { path: '/b2b/', name: 'Anvil Supply Co. (B2B wholesale)' },
  { path: '/b2c/', name: 'Pebble & Co. (D2C storefront)' },
  { path: '/property/', name: 'Manzil Properties' },
  { path: '/vacation/', name: 'Vacation Homes' },
  { path: '/pos/', name: 'Qahwa POS' },
  { path: '/sanad/', name: 'Sanad AI support copilot' },
  { path: '/watad/', name: 'Watad smart-building BMS' },
  { path: '/lahza/', name: 'Lahza journaling PWA' },
  { path: '/marsad/', name: 'Marsad dispatcher console' },
  { path: '/nabta/', name: 'Nabta HR / payroll' },
  { path: '/property-management/', name: 'Property Management multi-role platform' },
];
