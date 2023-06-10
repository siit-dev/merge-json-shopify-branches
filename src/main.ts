import * as core from '@actions/core'
import {GitMerger} from '@smartimpact-it/json-merge-shopify'
import {GitMergerResult} from '@smartimpact-it/json-merge-shopify/lib/git-integration/GitMerger'
import {execSync} from 'child_process'
import * as fs from 'fs'

async function run(): Promise<void> {
  try {
    core.info('Starting the action...')

    const jsonPaths = core.getInput('json-paths', {required: true}).split(/,\n/)
    const mainBranch = core.getInput('main-branch', {required: true})
    const productionBranch = core.getInput('production-branch', {
      required: true
    })
    const liveMirrorBranch = core.getInput('live-mirror-branch', {
      required: true
    })
    const checkJsonValidity = core.getInput('check-json-validity', {
      required: true
    })
    const formatterCommand = core.getInput('formatter-command', {
      required: false
    })
    const commitMessage = core.getInput('commit-message', {required: true})
    const preferred = core.getInput('preferred', {required: true})
    const exitIfNoExistingDeployment = core.getInput(
      'exit-if-no-existing-deployment',
      {required: true}
    )
    const runLocallyOnly = core.getInput('run-locally-only', {required: true})

    // Create the formatter function if a command was provided
    // let formatter = null
    // if (formatterCommand && formatterCommand.length > 0) {
    //   core.info('Creating the formatter function...')
    //   formatter = (json: string): string => {
    //     const tempPath = fs.mkdtempSync('json-merge-shopify')
    //     const tempFile = `${tempPath}/temp.json`
    //     fs.writeFileSync(tempFile, json)
    //     const command = formatterCommand.indexOf('%s')
    //       ? formatterCommand.replace('%s', tempFile)
    //       : `${formatterCommand} ${tempFile}`
    //     const formatted = execSync(command, {
    //       encoding: 'utf8'
    //     })
    //     fs.unlinkSync(tempFile)
    //     return formatted
    //   }
    // }

    // Catch the console.log output from the merger
    core.info('Catching the GitMerger output...')
    const mergerLog: string[] = []
    const mergerLogListener = (data: string): void => {
      mergerLog.push(data)
    }
    process.stdout.on('data', mergerLogListener)

    // Initialize the merger
    core.info('Initializing the GitMerger...')
    const merger = new GitMerger({
      createCommit: true,
      checkJsonValidity: checkJsonValidity === 'true',
      preferred: preferred as 'ours' | 'theirs',
      // formatter,
      commitMessage,
      exitIfNoExistingDeployment: exitIfNoExistingDeployment === 'true',
      runLocallyOnly: runLocallyOnly === 'true'
    })

    // Run the merge
    core.info('Running the GitMerger...')
    const result: GitMergerResult = await merger.run()

    // Output the result
    core.setOutput('hasConflict', result.hasConflict)
    core.setOutput('hasErrors', result.hasErrors)
    core.setOutput('error', result.error)
    core.setOutput('hasCommitted', result.hasCommitted)
    core.setOutput('mergedFiles', result.mergedFiles)
    core.setOutput('log', mergerLog.join('\n'))

    if (result.hasConflict) {
      core.setFailed('Conflict merging JSON files')
    } else if (result.hasErrors) {
      core.setFailed(result.error || 'Error merging JSON files')
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
