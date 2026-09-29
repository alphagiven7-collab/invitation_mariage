const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('program keeps configured order and escapes free-form schedule text', () => {
  const timeline = { innerHTML: '' };
  const window = {};
  vm.runInNewContext(fs.readFileSync('assets/js/content-blocks.js', 'utf8'), {
    window,
    document: { getElementById: id => id === 'program-timeline' ? timeline : null },
    URL
  });

  window.ContentBlocks.renderProgram([
    { time: '19h30 <script>', title: 'Entrée & cérémonie', color: 'pink' },
    { time: '21h00', title: '<img src=x onerror=alert(1)>', color: '" onmouseover="alert(1)' }
  ]);

  assert.equal((timeline.innerHTML.match(/<li class="program-step"/g) || []).length, 2);
  assert.match(timeline.innerHTML, /data-color="pink"/);
  assert.match(timeline.innerHTML, /data-color="green"/);
  assert.match(timeline.innerHTML, /19h30 &lt;script&gt;/);
  assert.match(timeline.innerHTML, /Entrée &amp; cérémonie/);
  assert.match(timeline.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(timeline.innerHTML, /<script>|<img src=x/);

  window.ContentBlocks.renderProgram([]);
  assert.match(timeline.innerHTML, /Le programme sera bientôt annoncé/);
  assert.doesNotMatch(timeline.innerHTML, /program-step/);
});
