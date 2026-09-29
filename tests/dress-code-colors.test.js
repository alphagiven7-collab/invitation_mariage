const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadContentBlocks() {
  const swatches = Array.from({ length: 3 }, () => ({ style: {} }));
  const document = {
    getElementById() { return null; },
    querySelector(selector) {
      const match = /^\[data-dress-code-color="([0-2])"\]$/.exec(selector);
      return match ? swatches[Number(match[1])] : null;
    },
    querySelectorAll() { return []; }
  };
  const window = { location: { href: 'https://example.com/pages/invitation.html' } };
  const sandbox = { document, window, URL };
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'content-blocks.js'), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: 'content-blocks.js' });
  return { blocks: window.ContentBlocks, swatches };
}

function renderedColors(swatches) {
  return swatches.map((swatch) => swatch.style.backgroundColor);
}

test('the shared invitation displays all three configured dress code colors', () => {
  const { blocks, swatches } = loadContentBlocks();
  const config = { dressCodeColors: ['#123456', '#abcdef', '#FE9012'] };

  blocks.apply(blocks.getDefaultsFromConfig(config));

  assert.deepEqual(renderedColors(swatches), config.dressCodeColors);
});

test('legacy and invalid dress code colors use the historical palette', () => {
  const { blocks, swatches } = loadContentBlocks();

  blocks.apply({});
  assert.deepEqual(renderedColors(swatches), ['#f4e1e1', '#5a2a35', '#2d3748']);

  blocks.apply({ dressCodeColors: ['#00aa11', 'red', '#123'] });
  assert.deepEqual(renderedColors(swatches), ['#00aa11', '#5a2a35', '#2d3748']);
});

test('personalization includes the selected palette in the saved invitation state', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'personnalisation.js'), 'utf8');
  const sandbox = { window: { addEventListener() {} } };
  vm.runInNewContext(source, sandbox, { filename: 'personnalisation.js' });

  const colors = ['#123456', '#abcdef', '#FE9012'];
  const payload = sandbox.toDashboardPayload({ dressCodeColors: colors });

  assert.deepEqual(Array.from(payload.dressCodeColors), colors);
});
