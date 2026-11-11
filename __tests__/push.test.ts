import {spawnSync} from 'child_process'
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'fs'
import {tmpdir} from 'os'
import path from 'path'
import {test, expect} from '@jest/globals'
const yaml = require('js-yaml')

const action = yaml.load(
  readFileSync(path.join(__dirname, '../action.yml'), 'utf8')
) as any
const script = action.runs.steps.find(
  (step: any) => step.name === 'Push the changes, if there are any'
).run

test.each([0, 2])('propagates git push exit status %s', exitCode => {
  const root = mkdtempSync(path.join(tmpdir(), 'action-push-'))
  const bin = path.join(root, 'bin')
  const calls = path.join(root, 'calls')
  mkdirSync(bin)
  writeFileSync(
    path.join(bin, 'git'),
    `#!${process.execPath}\nconst fs = require('fs'); const command = process.argv[2]; fs.appendFileSync(process.env.TEST_CALLS, command + '\\n'); if (command === 'status') console.log('Your branch is ahead of origin/main by 1 commit.'); else if (command === 'push') process.exit(Number(process.env.TEST_PUSH_EXIT)); else process.exit(99);\n`,
    {mode: 0o755}
  )
  try {
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: bin + path.delimiter + process.env.PATH,
        TEST_CALLS: calls,
        TEST_PUSH_EXIT: String(exitCode)
      }
    })
    expect(result.error).toBeUndefined()
    expect(readFileSync(calls, 'utf8')).toContain('push\n')
    expect(result.status).toBe(exitCode)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})
