import * as core from '@actions/core'
import {GitMerger} from '@smartimpact-it/json-merge-shopify'
import {GitMergerResult} from '@smartimpact-it/json-merge-shopify/lib/git-integration/GitMerger'
import {execSync} from 'child_process'
import * as fs from 'fs'

async function run(): Promise<void> {
  try {
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
      required: true
    })
    const commitMessage = core.getInput('commit-message', {required: true})
    const preferred = core.getInput('preferred', {required: true})
    const exitIfNoExistingDeployment = core.getInput(
      'exit-if-no-existing-deployment',
      {required: true}
    )
    const runLocallyOnly = core.getInput('run-locally-only', {required: true})

    // Print out the inputs to the action
    core.info(`json-paths: ${jsonPaths}`)
    core.info(`main-branch: ${mainBranch}`)
    core.info(`production-branch: ${productionBranch}`)
    core.info(`live-mirror-branch: ${liveMirrorBranch}`)
    core.info(`check-json-validity: ${checkJsonValidity}`)
    core.info(`formatter-command: ${formatterCommand}`)
    core.info(`commit-message: ${commitMessage}`)
    core.info(`preferred: ${preferred}`)
    core.info(`exit-if-no-existing-deployment: ${exitIfNoExistingDeployment}`)
    core.info(`run-locally-only: ${runLocallyOnly}`)

    // Create the formatter function if a command was provided
    let formatter = null
    if (formatterCommand) {
      formatter = async (json: string): Promise<string> => {
        const tempPath = fs.mkdtempSync('json-merge-shopify')
        const tempFile = `${tempPath}/temp.json`
        fs.writeFileSync(tempFile, json)
        const command = formatterCommand.indexOf('%s')
          ? formatterCommand.replace('%s', tempFile)
          : `${formatterCommand} ${tempFile}`
        const formatted = execSync(command, {
          encoding: 'utf8'
        })
        fs.unlinkSync(tempFile)
        return formatted
      }
    }

    // Catch the console.log output from the merger
    const mergerLog: string[] = []
    const mergerLogListener = (data: string): void => {
      mergerLog.push(data)
    }
    process.stdout.on('data', mergerLogListener)

    // Initialize the merger
    const merger = new GitMerger({
      createCommit: true,
      checkJsonValidity: checkJsonValidity === 'true',
      preferred: preferred as 'ours' | 'theirs',
      formatter,
      commitMessage,
      exitIfNoExistingDeployment: exitIfNoExistingDeployment === 'true',
      runLocallyOnly: runLocallyOnly === 'true'
    })

    // Run the merge
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
