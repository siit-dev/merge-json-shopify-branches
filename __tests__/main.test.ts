import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'
import {expect, test} from '@jest/globals'

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  // json-paths

  process.env['INPUT_RUN-LOCALLY-ONLY'] = 'true'

  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  const result = cp.execFileSync(np, [ip], options).toString()
  console.log(result)
})
