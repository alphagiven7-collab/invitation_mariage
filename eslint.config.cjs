module.exports = [{
  ignores: ['node_modules/**'],
}, {
  files: ['assets/js/**/*.js', 'api/**/*.js', 'tests/**/*.js', 'sw.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: {
    'constructor-super': 'error',
    'no-async-promise-executor': 'error',
    'no-constant-binary-expression': 'error',
    'no-dupe-args': 'error',
    'no-dupe-class-members': 'error',
    'no-dupe-else-if': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-invalid-regexp': 'error',
    'no-self-assign': 'error',
    'no-unexpected-multiline': 'error',
    'no-unreachable': 'error',
    'no-unsafe-finally': 'error',
    'no-unsafe-optional-chaining': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error'
  }
}];
