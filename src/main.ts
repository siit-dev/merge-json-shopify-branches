import * as core from '@actions/core'
import {
  GitMerger,
  GitMergerOptions,
  GitMergerResult,
  Logger
} from '@smartimpact-it/json-merge-shopify'
import {execSync} from 'child_process'
import * as fs from 'fs'
import {
  PostMergeHookOptions,
  resolvePostMergeHookOptions,
  runPostMergeHooks
} from './post-merge'
import {stageAndCommitPostMergeChanges} from './git-staging'

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
  'run-locally-only': 'false',
  verbose: 'false',
  'create-commit': 'true',
  'post-merge-node-script': '',
  'post-merge-script': '',
  'post-merge-command': '',
  postMergeCommand: '',
  'post-merge-script-command-continue-on-error': 'false',
  postMergeScriptCommandContinueOnError: 'false'
}

const unique = (values: string[]): string[] => {
  return values.filter(
    (value, index) => value && values.indexOf(value) === index
  )
}

const toKebabCase = (name: string): string => {
  return name
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

const toCamelCase = (name: string): string => {
  return toKebabCase(name).replace(/-([a-z0-9])/g, (_, character: string) =>
    character.toUpperCase()
  )
}

const toSnakeCase = (name: string): string => {
  return toKebabCase(name).replace(/-/g, '_')
}

const toInputEnvName = (name: string): string => {
  return `INPUT_${toSnakeCase(name).toUpperCase()}`
}

const getInputNameVariants = (name: string): string[] => {
  return unique([name, toKebabCase(name), toSnakeCase(name), toCamelCase(name)])
}

const getRawInput = (names: string[]): string => {
  for (const inputName of names) {
    const input = core.getInput(inputName, {required: false})
    if (input) return input
  }

  for (const inputName of names) {
    const envInput = process.env[toInputEnvName(inputName)]
    if (envInput) return envInput
  }

  return ''
}

const getInput = (name: string, aliases: string[] = []): string => {
  const names = unique(
    [name, ...aliases].flatMap(inputName => getInputNameVariants(inputName))
  )
  const input = getRawInput(names)

  if (input) return input

  for (const inputName of names) {
    if (defaults[inputName]) return defaults[inputName]
  }

  return ''
}

const getPostMergeHookOptions = (): PostMergeHookOptions => {
  return resolvePostMergeHookOptions(
    {
      continueOnError: getInput('post-merge-script-command-continue-on-error'),
      continueOnErrorAlias: getRawInput([
        'postMergeScriptCommandContinueOnError'
      ]),
      postMergeNodeScript: getInput('post-merge-node-script'),
      postMergeScript: getInput('post-merge-script'),
      postMergeCommand: getInput('post-merge-command'),
      postMergeCommandAlias: getRawInput(['postMergeCommand'])
    },
    core
  )
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

    const jsonPaths = getInput('json-paths')
      .split(/[,\n]/)
      .map(p => p.trim())
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
    const verbose = getInput('verbose')
    const configFile = getInput('config-file')
    const createCommitInput = getInput('create-commit')
    const postMergeHooks = getPostMergeHookOptions()

    // Get the project path from current working directory
    const gitRoot = process.env.GITHUB_WORKSPACE || process.cwd()

    // Create the formatter function if a command was provided
    let formatter = null
    if (formatterCommand && formatterCommand.length > 0) {
      core.info('Creating the formatter function...')
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
    core.info('Catching the GitMerger output...')
    const mergerLog: string[] = []
    const mergerLogListener = (data: string): void => {
      mergerLog.push(data)
    }
    process.stdout.on('data', mergerLogListener)

    // Output the input parameters
    core.warning('Outputting the input parameters...')
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
    core.info(`verbose: ${verbose}`)
    core.info(`configFile: ${configFile}`)
    core.info(`createCommit: ${createCommitInput}`)
    core.info(`postMergeNodeScript: ${postMergeHooks.postMergeNodeScript}`)
    core.info(`postMergeScript: ${postMergeHooks.postMergeScript}`)
    core.info(
      `postMergeScriptCommandContinueOnError: ${postMergeHooks.continueOnError}`
    )
    core.info(`gitRoot: ${gitRoot}`)

    const mergerOptions: GitMergerOptions = {
      gitRoot,
      jsonPaths,
      mainBranch,
      productionBranch,
      liveMirrorBranch,
      createCommit: false,
      checkJsonValidity: checkJsonValidity === 'true',
      preferred: preferred as 'ours' | 'theirs',
      formatter,
      commitMessage,
      exitIfNoExistingDeployment: exitIfNoExistingDeployment === 'true',
      runLocallyOnly: runLocallyOnly === 'true',
      logger,
      verbose: verbose === 'true'
    }

    // Initialize the merger
    core.info('\nInitializing the GitMerger...')
    let merger: GitMerger
    if (configFile && typeof configFile === 'string' && configFile.length > 0) {
      merger = new GitMerger(configFile, mergerOptions)
    } else {
      // If no config file was provided, let GitMerger try to find one.
      merger = new GitMerger(null, mergerOptions)
    }

    // Run the merge (commit is always deferred to this action)
    core.info('Running the GitMerger...')
    const result: GitMergerResult = await merger.run()

    let hasCommitted = false

    if (!result.hasConflict && !result.hasErrors) {
      runPostMergeHooks(
        postMergeHooks,
        {
          gitRoot,
          mergedFiles: result.mergedFiles,
          hasConflict: false,
          hasErrors: false
        },
        core
      )

      // Create the commit if requested
      if (createCommitInput !== 'false') {
        hasCommitted = await stageAndCommitPostMergeChanges({
          gitRoot,
          commit: async () => merger.commit(),
          logger: core
        })
      }
    }

    // Output the result
    core.setOutput('hasConflict', result.hasConflict ? 'true' : 'false')
    core.setOutput('hasErrors', result.hasErrors ? 'true' : 'false')
    core.setOutput('error', result.error || '')
    core.setOutput('hasCommitted', hasCommitted ? 'true' : 'false')
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
    if (hasCommitted) {
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
