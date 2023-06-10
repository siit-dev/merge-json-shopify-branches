import * as core from '@actions/core'
import {GitMerger} from '@smartimpact-it/json-merge-shopify'
import {
  GitMergerResult,
  Logger
} from '@smartimpact-it/json-merge-shopify/lib/git-integration/GitMerger'
import {execSync} from 'child_process'
import * as fs from 'fs'

const defaults: Record<string, string> = {
  'json-paths': 'config/*.json,locales/*.json,templates/*.json',
  'main-branch': 'main',
  'production-branch': 'production',
  'live-mirror-branch': 'live-mirror',
  'check-json-validity': 'true',
  'formatter-command': '',
  'commit-message': 'Merge JSON files',
  preferred: 'theirs',
  'exit-if-no-existing-deployment': 'false',
  'run-locally-only': 'false'
}

const getInput = (name: string): string => {
  const input =
    core.getInput(name, {required: false}) ||
    core.getInput(name.replace('-', '_'), {required: false}) ||
    defaults[name] ||
    defaults[name.replace('-', '_')] ||
    ''
  return input
}

const logger: Logger = (
  message: string | Error,
  type: 'log' | 'warn' | 'error' | 'success'
): void => {
  switch (type) {
    case 'log':
      core.info(message.toString())
      break
    case 'warn':
      core.warning(message)
      break
    case 'error':
      core.error(message)
      break
    case 'success':
      core.info(message.toString())
      break
  }
}

async function run(): Promise<void> {
  try {
    core.info('Starting the action...')

    const jsonPaths = getInput('json-paths').split(/,\n/)
    const mainBranch = getInput('main-branch')
    const productionBranch = getInput('production-branch')
    const liveMirrorBranch = getInput('live-mirror-branch')
    const checkJsonValidity = getInput('check-json-validity')
    const formatterCommand = getInput('formatter-command')
    const commitMessage = getInput('commit-message')
    const preferred = getInput('preferred')
    const exitIfNoExistingDeployment = getInput(
      'exit-if-no-existing-deployment'
    )
    const runLocallyOnly = getInput('run-locally-only')

    // Get the project path from current working directory
    const gitRoot = process.env.GITHUB_WORKSPACE || process.cwd()

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
      gitRoot,
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
      runLocallyOnly: runLocallyOnly === 'true',
      logger
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
      core.error('Conflict merging JSON files...')
      core.setFailed('Conflict merging JSON files')
    }
    if (result.hasErrors) {
      core.error(result.error || 'Error merging JSON files...')
      core.setFailed(result.error || 'Error merging JSON files')
    }
    if (result.hasCommitted) {
      core.info('Committed the merged JSON files...')
    }
    if (result.mergedFiles && result.mergedFiles.length > 0) {
      core.info(`Merged the following files: ${result.mergedFiles}`)
    } else {
      core.info('No files were merged...')
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
