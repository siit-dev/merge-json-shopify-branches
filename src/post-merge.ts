import {execSync, ExecSyncOptions} from 'child_process'
import * as path from 'path'

export interface PostMergeHookOptions {
  postMergeNodeScript: string
  postMergeScript: string
  continueOnError: boolean
}

export interface PostMergeHookInputValues {
  postMergeNodeScript: string
  postMergeScript: string
  postMergeCommand: string
  postMergeCommandAlias: string
  continueOnError: string
  continueOnErrorAlias: string
}

export interface PostMergeHookContext {
  gitRoot: string
  mergedFiles?: string[]
  hasConflict: boolean
  hasErrors: boolean
}

export interface PostMergeHookLogger {
  info(message: string): void
  warning(message: string | Error): void
  error(message: string | Error): void
}

export type PostMergeHookExecutor = (
  command: string,
  options: ExecSyncOptions
) => Buffer | string

export const resolvePostMergeHookOptions = (
  inputs: PostMergeHookInputValues,
  logger: PostMergeHookLogger
): PostMergeHookOptions => {
  if (
    inputs.postMergeScript &&
    inputs.postMergeCommand &&
    inputs.postMergeScript !== inputs.postMergeCommand
  ) {
    logger.warning(
      'Both post-merge-script and post-merge-command were provided. Using post-merge-script.'
    )
  }

  if (
    inputs.postMergeScript &&
    inputs.postMergeCommandAlias &&
    inputs.postMergeScript !== inputs.postMergeCommandAlias
  ) {
    logger.warning(
      'Both post-merge-script and postMergeCommand were provided. Using post-merge-script.'
    )
  }

  if (
    !inputs.postMergeScript &&
    inputs.postMergeCommand &&
    inputs.postMergeCommandAlias &&
    inputs.postMergeCommand !== inputs.postMergeCommandAlias
  ) {
    logger.warning(
      'Both post-merge-command and postMergeCommand were provided. Using post-merge-command.'
    )
  }

  return {
    postMergeNodeScript: inputs.postMergeNodeScript,
    postMergeScript:
      inputs.postMergeScript ||
      inputs.postMergeCommand ||
      inputs.postMergeCommandAlias,
    continueOnError:
      inputs.continueOnError === 'true' ||
      inputs.continueOnErrorAlias === 'true'
  }
}

const quoteShellArg = (value: string): string => {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export const buildPostMergeHookEnv = (
  context: PostMergeHookContext
): ExecSyncOptions['env'] => {
  return {
    ...process.env,
    MERGED_FILES: (context.mergedFiles || []).join(','),
    HAS_CONFLICT: context.hasConflict ? 'true' : 'false',
    HAS_ERRORS: context.hasErrors ? 'true' : 'false',
    GIT_ROOT: context.gitRoot
  }
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

const runHookCommand = (
  label: string,
  command: string,
  context: PostMergeHookContext,
  continueOnError: boolean,
  logger: PostMergeHookLogger,
  executor: PostMergeHookExecutor
): void => {
  try {
    logger.info(`Running ${label}: ${command}`)
    executor(command, {
      encoding: 'utf8',
      env: buildPostMergeHookEnv(context),
      stdio: 'inherit'
    })
    logger.info(`${label} completed.`)
  } catch (error) {
    const message = `${label} failed: ${getErrorMessage(error)}`

    if (!continueOnError) {
      throw new Error(message)
    }

    logger.error(message)
    logger.warning(`Continuing after failed ${label}.`)
  }
}

export const runPostMergeHooks = (
  options: PostMergeHookOptions,
  context: PostMergeHookContext,
  logger: PostMergeHookLogger,
  executor: PostMergeHookExecutor = execSync
): void => {
  if (options.postMergeNodeScript && options.postMergeNodeScript.length > 0) {
    const scriptPath = path.resolve(
      context.gitRoot,
      options.postMergeNodeScript
    )
    runHookCommand(
      'post-merge node script',
      `node ${quoteShellArg(scriptPath)}`,
      context,
      options.continueOnError,
      logger,
      executor
    )
  }

  if (options.postMergeScript && options.postMergeScript.length > 0) {
    runHookCommand(
      'post-merge script',
      options.postMergeScript,
      context,
      options.continueOnError,
      logger,
      executor
    )
  }
}
