'use strict';

/**
 * Known sites for inferring URLs from browser window titles.
 * Tuned for employee performance / knowledge-work (not regional news).
 */
const WORK_SITES = [
  { keys: ['google'], url: 'https://www.google.com' },
  { keys: ['gmail', 'mail.google'], url: 'https://mail.google.com' },
  { keys: ['google docs', 'docs.google'], url: 'https://docs.google.com' },
  { keys: ['google sheets', 'sheets.google'], url: 'https://sheets.google.com' },
  { keys: ['google drive', 'drive.google'], url: 'https://drive.google.com' },
  { keys: ['google calendar', 'calendar.google'], url: 'https://calendar.google.com' },
  { keys: ['google meet', 'meet.google'], url: 'https://meet.google.com' },
  { keys: ['outlook', 'outlook.office'], url: 'https://outlook.office.com' },
  { keys: ['office', 'microsoft 365', 'office.com'], url: 'https://www.office.com' },
  { keys: ['teams', 'microsoft teams'], url: 'https://teams.microsoft.com' },
  { keys: ['slack'], url: 'https://slack.com' },
  { keys: ['zoom'], url: 'https://zoom.us' },
  { keys: ['notion'], url: 'https://www.notion.so' },
  { keys: ['asana'], url: 'https://asana.com' },
  { keys: ['monday', 'monday.com'], url: 'https://monday.com' },
  { keys: ['trello'], url: 'https://trello.com' },
  { keys: ['jira'], url: 'https://www.atlassian.com/software/jira' },
  { keys: ['confluence'], url: 'https://www.atlassian.com/software/confluence' },
  { keys: ['linear'], url: 'https://linear.app' },
  { keys: ['clickup'], url: 'https://clickup.com' },
  { keys: ['github'], url: 'https://github.com' },
  { keys: ['gitlab'], url: 'https://gitlab.com' },
  { keys: ['bitbucket'], url: 'https://bitbucket.org' },
  { keys: ['stackoverflow', 'stack overflow'], url: 'https://stackoverflow.com' },
  { keys: ['chatgpt', 'openai'], url: 'https://chatgpt.com' },
  { keys: ['claude'], url: 'https://claude.ai' },
  { keys: ['figma'], url: 'https://www.figma.com' },
  { keys: ['canva'], url: 'https://www.canva.com' },
  { keys: ['miro'], url: 'https://miro.com' },
  { keys: ['salesforce'], url: 'https://login.salesforce.com' },
  { keys: ['hubspot'], url: 'https://app.hubspot.com' },
  { keys: ['zendesk'], url: 'https://www.zendesk.com' },
  { keys: ['intercom'], url: 'https://app.intercom.com' },
  { keys: ['bamboohr'], url: 'https://www.bamboohr.com' },
  { keys: ['workday'], url: 'https://www.workday.com' },
  { keys: ['aws', 'amazon web services'], url: 'https://aws.amazon.com' },
  { keys: ['azure', 'portal.azure'], url: 'https://portal.azure.com' },
  { keys: ['google cloud', 'cloud console'], url: 'https://console.cloud.google.com' },
  { keys: ['vercel'], url: 'https://vercel.com' },
  { keys: ['supabase'], url: 'https://supabase.com' },
  { keys: ['linkedin'], url: 'https://www.linkedin.com' },
  { keys: ['twitter', 'x'], url: 'https://x.com' },
  { keys: ['youtube'], url: 'https://www.youtube.com' },
  { keys: ['wikipedia'], url: 'https://www.wikipedia.org' },
  { keys: ['alyson', 'alyson pm', 'alyson-pm'], url: 'https://alyson-pms.vercel.app' },
  { keys: ['work time', 'worktime', 'timeflow', 'alysson work time'], url: 'https://worktime.ebdaadt.com' },
  { keys: ['developer.mozilla', 'mdn'], url: 'https://developer.mozilla.org' },
  { keys: ['npm'], url: 'https://www.npmjs.com' },
];

function buildLowerMap() {
  const map = Object.create(null);
  for (const { keys, url } of WORK_SITES) {
    for (const key of keys) {
      map[key.toLowerCase()] = url;
    }
  }
  return map;
}

/** Title keyword → URL (case-insensitive substring match). */
function buildTitlePatternMap() {
  const map = Object.create(null);
  for (const { keys, url } of WORK_SITES) {
    for (const key of keys) {
      map[key] = url;
    }
  }
  return map;
}

module.exports = {
  KNOWN_SITES_LOWER: buildLowerMap(),
  SITE_TITLE_PATTERNS: buildTitlePatternMap(),
};
