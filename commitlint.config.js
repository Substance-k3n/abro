/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['web', 'admin', 'api', 'types', 'ui', 'config', 'infra', 'docs', 'repo'],
    ],
  },
};
