import {execFileSync, ExecFileSyncOptions} from 'child_process'

export interface GitStagingLogger {
  info(message: string): void
}

export type GitStagingExecutor = (
  file: string,
  args: string[],
  options: ExecFileSyncOptions
) => Buffer | string

export interface StageAndCommitOptions {
  gitRoot: string
  commit: () => Promise<boolean>
  logger: GitStagingLogger
  executor?: GitStagingExecutor
}

const getErrorStatus = (error: unknown): number | null => {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status
  }

  return null
}

const hasStagedChanges = (
  gitRoot: string,
  executor: GitStagingExecutor
): boolean => {
  try {
    executor('git', ['-C', gitRoot, 'diff', '--cached', '--quiet'], {
      stdio: 'ignore'
    })
    return false
  } catch (error) {
    if (getErrorStatus(error) === 1) {
      return true
    }

    throw error
  }
}

export const stageAndCommitPostMergeChanges = async ({
  gitRoot,
  commit,
  logger,
  executor = execFileSync
}: StageAndCommitOptions): Promise<boolean> => {
  logger.info('Staging post-merge changes...')
  executor('git', ['-C', gitRoot, 'add', '-A'], {
    stdio: 'inherit'
  })

  const status = executor('git', ['-C', gitRoot, 'status', '--short'], {
    encoding: 'utf8'
  }).toString()

  if (status.trim()) {
    logger.info(`Git status after staging post-merge changes:\n${status}`)
  } else {
    logger.info('Git status after staging post-merge changes: clean')
  }

  if (!hasStagedChanges(gitRoot, executor)) {
    logger.info('No staged changes to commit after post-merge hooks.')
    return false
  }

  logger.info('Creating the commit...')
  return commit()
}
