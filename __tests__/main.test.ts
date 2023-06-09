import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'
import {expect, test} from '@jest/globals'

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  // Create the "live-mirror" branch locally.
  // This is necessary because the action will fail if the branch doesn't exist.
  cp.execSync('git checkout -b live-mirror')
  cp.execSync('git checkout main')

  // Set the environment variables to run the action locally.
  process.env['INPUT_RUN_LOCALLY_ONLY'] = 'true'
  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  const result = cp.execFileSync(np, [ip], options).toString()
  console.log(result)
})
