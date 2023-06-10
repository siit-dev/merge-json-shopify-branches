import * as core from '@actions/core'
import {GitMerger} from '@smartimpact-it/json-merge-shopify'
import {GitMergerResult} from '@smartimpact-it/json-merge-shopify/lib/git-integration/GitMerger'
import {execSync} from 'child_process'
import * as fs from 'fs'

const defaults = {
  jsonPaths: 'config/*.json,locales/*.json,templates/*.json',
  mainBranch: 'main',
  productionBranch: 'production',
  liveMirrorBranch: 'live-mirror',
  checkJsonValidity: 'true',
  formatterCommand: '',
  commitMessage: 'Merge JSON files',
  preferred: 'ours',
  exitIfNoExistingDeployment: 'false',
  runLocallyOnly: 'false'
}

async function run(): Promise<void> {
  try {
    core.info('Starting the action...')

    const jsonPaths = (
      core.getInput('json-paths', {required: false}) || defaults.jsonPaths
    ).split(/,\n/)
    const mainBranch =
      core.getInput('main-branch', {required: false}) || defaults.mainBranch
    const productionBranch =
      core.getInput('production-branch', {
        required: false
      }) || defaults.productionBranch
    const liveMirrorBranch =
      core.getInput('live-mirror-branch', {
        required: false
      }) || defaults.liveMirrorBranch
    const checkJsonValidity =
      core.getInput('check-json-validity', {
        required: false
      }) || defaults.checkJsonValidity
    const formatterCommand =
      core.getInput('formatter-command', {
        required: false
      }) || defaults.formatterCommand
    const commitMessage =
      core.getInput('commit-message', {required: false}) ||
      defaults.commitMessage
    const preferred =
      core.getInput('preferred', {required: false}) || defaults.preferred
    const exitIfNoExistingDeployment =
      core.getInput('exit-if-no-existing-deployment', {required: false}) ||
      defaults.exitIfNoExistingDeployment
    const runLocallyOnly =
      core.getInput('run-locally-only', {required: false}) ||
      defaults.runLocallyOnly

    // Create the formatter function if a command was provided
    let formatter = null
    if (formatterCommand && formatterCommand.length > 0) {
      core.info('Creating the formatter function...')
      formatter = (json: string): string => {
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
    core.info('Catching the GitMerger output...')
    const mergerLog: string[] = []
    const mergerLogListener = (data: string): void => {
      mergerLog.push(data)
    }
    process.stdout.on('data', mergerLogListener)

    // Get the calling Git folder.
    const gitFolder = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8'
    }).trim()
    core.info(`Git folder: ${gitFolder}`)

    // Output the input parameters
    core.info('Outputting the input parameters...')
    core.info(`jsonPaths: ${jsonPaths.join(', ')}`)
    core.info(`mainBranch: ${mainBranch}`)
    core.info(`productionBranch: ${productionBranch}`)
    core.info(`liveMirrorBranch: ${liveMirrorBranch}`)
    core.info(`checkJsonValidity: ${checkJsonValidity}`)
    core.info(`formatterCommand: ${formatterCommand}`)
    core.info(`commitMessage: ${commitMessage}`)
    core.info(`preferred: ${preferred}`)
    core.info(`exitIfNoExistingDeployment: ${exitIfNoExistingDeployment}`)
    core.info(`runLocallyOnly: ${runLocallyOnly}`)

    // Initialize the merger
    core.info('Initializing the GitMerger...')
    const merger = new GitMerger({
      jsonPaths,
      mainBranch,
      productionBranch,
      liveMirrorBranch,
      createCommit: true,
      checkJsonValidity: checkJsonValidity === 'true',
      preferred: preferred as 'ours' | 'theirs',
      formatter,
      commitMessage,
      exitIfNoExistingDeployment: exitIfNoExistingDeployment === 'true',
      runLocallyOnly: runLocallyOnly === 'true'
    })

    // Run the merge
    core.info('Running the GitMerger...')
    const result: GitMergerResult = await merger.run()

    // Output the result
    core.setOutput('hasConflict', result.hasConflict ? 'true' : 'false')
    core.setOutput('hasErrors', result.hasErrors ? 'true' : 'false')
    core.setOutput('error', result.error || '')
    core.setOutput('hasCommitted', result.hasCommitted ? 'true' : 'false')
    core.setOutput('mergedFiles', result.mergedFiles || '')
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
