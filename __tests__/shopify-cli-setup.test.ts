import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {execFileSync, spawnSync} from 'child_process'
import {createRequire} from 'module'
import {afterEach, describe, expect, test} from '@jest/globals'

const yaml = createRequire(__filename)('js-yaml')
const action = yaml.load(
  fs.readFileSync(path.join(__dirname, '..', 'action.yml'), 'utf8')
) as {runs: {steps: {id?: string; name?: string; run?: string}[]}}
const selection = action.runs.steps.find(
  step => step.id === 'shopify-cli-version'
)!
const installation = action.runs.steps.find(
  step => step.name === 'Install Shopify CLI'
)!
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true})
  }
})

function fixture(): {root: string; env: NodeJS.ProcessEnv} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-cli-setup-'))
  temporaryDirectories.push(root)
  const bin = path.join(root, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(
    path.join(bin, 'node'),
    `#!/bin/sh
if [ -n "$TEST_NODE_VERSION$TEST_PLATFORM" ]; then
  exec "$TEST_NODE_EXECUTABLE" -e 'if(process.env.TEST_NODE_VERSION) Object.defineProperty(process.versions,"node",{value:process.env.TEST_NODE_VERSION}); if(process.env.TEST_PLATFORM) Object.defineProperty(process,"platform",{value:process.env.TEST_PLATFORM}); require("vm").runInThisContext(require("fs").readFileSync(0,"utf8"));' "$@"
fi
exec "$TEST_NODE_EXECUTABLE" "$@"
`,
    {mode: 0o755}
  )
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    TEST_NODE_EXECUTABLE: process.execPath,
    GITHUB_OUTPUT: path.join(root, 'output'),
    GITHUB_PATH: path.join(root, 'github-path'),
    TEST_CLI_PREFIX: path.join(root, 'prefix'),
    SHOPIFY_CLI_INSTALL_PREFIX: path.join(root, 'prefix'),
    TEST_INSTALL_LOG: path.join(root, 'installs'),
    TEST_MERGE_MARKER: path.join(root, 'merged'),
    EXPECTED_SHOPIFY_CLI_VERSION: '4.9.4'
  }
  return {root, env}
}

function fakeInstall(prefix: string, version: string, windows = false): void {
  const fs = require('fs')
  const path = require('path')
  const root = path.join(
    prefix,
    windows ? 'node_modules' : 'lib/node_modules',
    '@shopify',
    'cli'
  )
  const executable = path.join(root, 'bin', 'run.js')
  fs.mkdirSync(path.dirname(executable), {recursive: true})
  fs.mkdirSync(path.join(prefix, 'bin'), {recursive: true})
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({version, bin: {shopify: 'bin/run.js'}})
  )
  fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', {mode: 0o755})
  if (windows) {
    const reference = 'node_modules/@shopify/cli/bin/run.js'
    fs.writeFileSync(
      path.join(prefix, 'shopify'),
      `#!/bin/sh\nnode "$basedir/${reference}" "$@"\n`
    )
    fs.writeFileSync(
      path.join(prefix, 'shopify.cmd'),
      `@node "%dp0%\\${reference.replace(/\//g, '\\')}" %*\r\n`
    )
    return
  }
  const link = path.join(prefix, 'bin', 'shopify')
  fs.rmSync(link, {force: true})
  fs.symlinkSync(executable, link)
}

function installerFixture(): {root: string; env: NodeJS.ProcessEnv} {
  const result = fixture()
  fs.writeFileSync(
    path.join(result.root, 'bin', 'npm'),
    `#!${process.execPath}
const fs = require('fs');
fs.appendFileSync(process.env.TEST_INSTALL_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.TEST_INSTALL_FAIL) process.exit(42);
const install = ${fakeInstall.toString()};
install(process.env.TEST_CLI_PREFIX, process.env.TEST_WRONG_INSTALL || process.env.EXPECTED_SHOPIFY_CLI_VERSION, process.env.TEST_PLATFORM === 'win32');
`,
    {mode: 0o755}
  )
  return result
}

function runInstaller(env: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  const script = installation.run!
  return spawnSync(
    'bash',
    [
      '--noprofile',
      '--norc',
      '-eo',
      'pipefail',
      '-c',
      `${script}\necho reached > "$TEST_MERGE_MARKER"`
    ],
    {env, encoding: 'utf8'}
  )
}

describe('compatible CLI selection', () => {
  test('adds the Windows npm prefix itself to PATH', () => {
    const {env} = fixture()
    execFileSync('bash', ['-eo', 'pipefail', '-c', selection.run!], {
      env: {...env, TEST_NODE_VERSION: '24.0.0', TEST_PLATFORM: 'win32'}
    })
    const output = fs.readFileSync(env.GITHUB_OUTPUT!, 'utf8')
    const prefix = output
      .split('\n')
      .find(line => line.startsWith('prefix='))!
      .slice('prefix='.length)
    expect(fs.readFileSync(env.GITHUB_PATH!, 'utf8').trim()).toBe(prefix)
  })

  test.each([
    ['18.20.8', '3.70.0'],
    ['20.10.0', '3.70.0'],
    ['22.11.0', '3.70.0'],
    ['22.12.0', '4.9.4'],
    ['24.0.0', '4.9.4'],
    ['25.0.0', '4.9.4']
  ])('Node %s selects CLI %s', (nodeVersion, cliVersion) => {
    const {env} = fixture()
    execFileSync('bash', ['-eo', 'pipefail', '-c', selection.run!], {
      env: {...env, TEST_NODE_VERSION: nodeVersion}
    })
    expect(fs.readFileSync(env.GITHUB_OUTPUT!, 'utf8')).toContain(
      `version=${cliVersion}\n`
    )
  })

  test.each(['16.20.0', '18.19.0', '20.9.0'])(
    'rejects unsupported Node %s',
    nodeVersion => {
      const {env} = fixture()
      const result = spawnSync(
        'bash',
        ['-eo', 'pipefail', '-c', selection.run!],
        {env: {...env, TEST_NODE_VERSION: nodeVersion}, encoding: 'utf8'}
      )
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Unsupported Node')
    }
  )
})

describe('isolated CLI installation', () => {
  test.each(['missing', 'cached', 'v5'])(
    'handles a %s Windows npm installation',
    state => {
      const {env} = installerFixture()
      if (state !== 'missing') {
        fakeInstall(
          env.TEST_CLI_PREFIX!,
          state === 'v5' ? '5.0.0' : '4.9.4',
          true
        )
      }
      const result = runInstaller({...env, TEST_PLATFORM: 'win32'})
      expect(result.status).toBe(0)
      expect(fs.existsSync(env.TEST_INSTALL_LOG!)).toBe(state !== 'cached')
      expect(fs.existsSync(env.TEST_MERGE_MARKER!)).toBe(true)
    }
  )

  test('repairs Windows shims that point at a different package', () => {
    const {env} = installerFixture()
    fakeInstall(env.TEST_CLI_PREFIX!, '4.9.4', true)
    fs.writeFileSync(
      path.join(env.TEST_CLI_PREFIX!, 'shopify.cmd'),
      '@node other-package\\run.js\r\n'
    )
    expect(runInstaller({...env, TEST_PLATFORM: 'win32'}).status).toBe(0)
    expect(fs.existsSync(env.TEST_INSTALL_LOG!)).toBe(true)
  })

  test('a cache miss installs the exact version into the dedicated prefix', () => {
    const {env} = installerFixture()
    const result = runInstaller(env)
    expect(result.status).toBe(0)
    expect(fs.readFileSync(env.TEST_INSTALL_LOG!, 'utf8')).toContain(
      '@shopify/cli@4.9.4'
    )
    expect(fs.existsSync(env.TEST_MERGE_MARKER!)).toBe(true)
  })

  test('an exact cached installation avoids npm', () => {
    const {env} = installerFixture()
    fakeInstall(env.TEST_CLI_PREFIX!, '4.9.4')
    expect(runInstaller(env).status).toBe(0)
    expect(fs.existsSync(env.TEST_INSTALL_LOG!)).toBe(false)
  })

  test('replaces a cached CLI v5 installation', () => {
    const {env} = installerFixture()
    fakeInstall(env.TEST_CLI_PREFIX!, '5.0.0')
    expect(runInstaller(env).status).toBe(0)
    expect(fs.existsSync(env.TEST_INSTALL_LOG!)).toBe(true)
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(
            env.TEST_CLI_PREFIX!,
            'lib/node_modules/@shopify/cli/package.json'
          ),
          'utf8'
        )
      ).version
    ).toBe('4.9.4')
  })

  test('ignores a conflicting global executable', () => {
    const {root, env} = installerFixture()
    fs.writeFileSync(
      path.join(root, 'bin', 'shopify'),
      '#!/bin/sh\nexit 91\n',
      {mode: 0o755}
    )
    expect(runInstaller(env).status).toBe(0)
    expect(fs.existsSync(env.TEST_INSTALL_LOG!)).toBe(true)
  })

  test.each(['missing', 'mismatched'])(
    'repairs a %s cached executable',
    mode => {
      const {root, env} = installerFixture()
      fakeInstall(env.TEST_CLI_PREFIX!, '4.9.4')
      const executable = path.join(env.TEST_CLI_PREFIX!, 'bin', 'shopify')
      fs.unlinkSync(executable)
      if (mode === 'mismatched') {
        const other = path.join(root, 'other-cli')
        fs.writeFileSync(other, '#!/bin/sh\nexit 0\n', {mode: 0o755})
        fs.symlinkSync(other, executable)
      }
      expect(runInstaller(env).status).toBe(0)
      expect(fs.existsSync(env.TEST_INSTALL_LOG!)).toBe(true)
    }
  )

  test.each(['failure', 'wrong-version'])(
    'a %s installation prevents merging',
    failure => {
      const {env} = installerFixture()
      const result = runInstaller({
        ...env,
        ...(failure === 'failure'
          ? {TEST_INSTALL_FAIL: '1'}
          : {TEST_WRONG_INSTALL: '5.0.0'})
      })
      expect(result.status).not.toBe(0)
      expect(fs.existsSync(env.TEST_MERGE_MARKER!)).toBe(false)
    }
  )
})
