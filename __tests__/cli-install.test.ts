import {execFileSync} from 'child_process'
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'fs'
import {tmpdir} from 'os'
import path from 'path'
import {test, expect} from '@jest/globals'
const yaml = require('js-yaml')

const action = yaml.load(
  readFileSync(path.join(__dirname, '../action.yml'), 'utf8')
) as any
const configure = action.runs.steps.find(
  (step: any) => step.name === 'Configure private Shopify CLI'
).run
const script = action.runs.steps.find(
  (step: any) => step.name === 'Install Shopify CLI'
).run

test('installs and checks the private v5 binary even when an older global CLI exists', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'action-cli-'))
  const bin = path.join(root, 'bin')
  const prefix = path.join(root, '.npm-global-shopify/5.0.1')
  mkdirSync(bin)
  const marker = path.join(root, 'global-called')
  writeFileSync(
    path.join(bin, 'shopify'),
    `#!/bin/sh\ntouch '${marker}'\necho 3.94.3\n`,
    {mode: 0o755}
  )
  writeFileSync(
    path.join(bin, 'npm'),
    `#!${process.execPath}\nconst fs=require('fs'); const p=process.env.SHOPIFY_CLI_PREFIX; fs.writeFileSync(process.env.TEST_ARGS, JSON.stringify(process.argv.slice(2))); fs.mkdirSync(p+'/node_modules/.bin',{recursive:true}); fs.writeFileSync(p+'/node_modules/.bin/shopify', '#!/bin/sh\\necho 5.0.1\\n',{mode:0o755});\n`,
    {mode: 0o755}
  )
  try {
    const env = {
      ...process.env,
      HOME: root,
      GITHUB_ENV: path.join(root, 'github-env'),
      GITHUB_PATH: path.join(root, 'github-path'),
      PATH: bin + path.delimiter + process.env.PATH,
      SHOPIFY_CLI_PREFIX: prefix,
      TEST_ARGS: path.join(root, 'args')
    }
    execFileSync('bash', ['-e', '-c', configure], {env, stdio: 'pipe'})
    expect(readFileSync(env.GITHUB_ENV, 'utf8')).toContain(
      `SHOPIFY_CLI_PREFIX=${prefix}`
    )
    execFileSync('bash', ['-e', '-c', script], {env, stdio: 'pipe'})
    expect(readFileSync(env.TEST_ARGS, 'utf8')).toContain('@shopify/cli@5.0.1')
    const cliPath = readFileSync(env.GITHUB_PATH, 'utf8').trim()
    expect(
      execFileSync('shopify', ['version'], {
        env: {...env, PATH: cliPath + path.delimiter + env.PATH},
        encoding: 'utf8'
      }).trim()
    ).toBe('5.0.1')
    expect(require('fs').existsSync(marker)).toBe(false)
    writeFileSync(
      path.join(prefix, 'node_modules/.bin/shopify'),
      '#!/bin/sh\necho 4.9.5\n',
      {
        mode: 0o755
      }
    )
    expect(() =>
      execFileSync('bash', ['-e', '-c', script], {env, stdio: 'pipe'})
    ).toThrow()
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})
