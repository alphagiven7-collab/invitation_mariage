const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('admin refreshes only the active tab and loads other tabs on demand', () => {
  const source = fs.readFileSync('assets/js/admin.js', 'utf8');
  const refresh = source.slice(
    source.indexOf('async function refreshCurrentTab'),
    source.indexOf('function setupTabs')
  );
  const tabs = source.slice(
    source.indexOf('function setupTabs'),
    source.indexOf('function updateCloudStatus')
  );

  assert.match(refresh, /const tabName = getActiveAdminTab\(\);/);
  assert.match(refresh, /renderActiveAdminTab\(tabName\)/);
  assert.doesNotMatch(refresh, /renderRelances\(\)|renderRSVPList\(\)|renderAnalytics\(\)|renderAdminGuestbook\(\)/);
  assert.match(tabs, /void refreshCurrentTab\(\);/);
});
