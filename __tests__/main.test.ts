import * as path from 'path'
import {describe, expect, jest, test} from '@jest/globals'
import {ExecFileSyncOptions} from 'child_process'
import {
  GitStagingExecutor,
  stageAndCommitPostMergeChanges
} from '../src/git-staging'
import {
  buildPostMergeHookEnv,
  PostMergeHookExecutor,
  PostMergeHookLogger,
  resolvePostMergeHookOptions,
  runPostMergeHooks
} from '../src/post-merge'

const gitRoot = '/tmp/merge-json-shopify-branches'

const createLogger = (): jest.Mocked<PostMergeHookLogger> => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
})

const createExecutor = (): jest.MockedFunction<PostMergeHookExecutor> => {
  return jest.fn(() => '') as jest.MockedFunction<PostMergeHookExecutor>
}

const createGitExecutor = (
  hasStagedChanges: boolean,
  status = ''
): jest.MockedFunction<GitStagingExecutor> => {
  return jest.fn(
    (_file: string, args: string[], _options: ExecFileSyncOptions): string => {
      if (args.includes('status')) {
        return status
      }

      if (args.includes('diff') && hasStagedChanges) {
        throw {status: 1}
      }

      return ''
    }
  ) as jest.MockedFunction<GitStagingExecutor>
}

describe('post-merge hooks', () => {
  test('runs post-merge-node-script as a Node script', () => {
    const logger = createLogger()
    const executor = createExecutor()

    runPostMergeHooks(
      {
        postMergeNodeScript: 'scripts/post-merge.js',
        postMergeScript: '',
        continueOnError: false
      },
      {
        gitRoot,
        mergedFiles: ['templates/index.json'],
        hasConflict: false,
        hasErrors: false
      },
      logger,
      executor
    )

    const scriptPath = path.resolve(gitRoot, 'scripts/post-merge.js')
    expect(executor).toHaveBeenCalledWith(
      `node '${scriptPath}'`,
      expect.objectContaining({
        env: expect.objectContaining({
          MERGED_FILES: 'templates/index.json',
          HAS_CONFLICT: 'false',
          HAS_ERRORS: 'false',
          GIT_ROOT: gitRoot
        }),
        stdio: 'inherit'
      })
    )
  })

  test('runs post-merge-script as the raw command', () => {
    const logger = createLogger()
    const executor = createExecutor()

    runPostMergeHooks(
      {
        postMergeNodeScript: '',
        postMergeScript: 'npm run theme:build',
        continueOnError: false
      },
      {
        gitRoot,
        mergedFiles: [],
        hasConflict: false,
        hasErrors: false
      },
      logger,
      executor
    )

    expect(executor).toHaveBeenCalledWith(
      'npm run theme:build',
      expect.any(Object)
    )
    expect(executor.mock.calls[0][0]).not.toContain('node ')
  })

  test('supports postMergeCommand through the same hook option', () => {
    const logger = createLogger()
    const options = resolvePostMergeHookOptions(
      {
        postMergeNodeScript: '',
        postMergeScript: '',
        postMergeCommand: '',
        postMergeCommandAlias: 'echo from-camel-case-alias',
        continueOnError: '',
        continueOnErrorAlias: ''
      },
      logger
    )

    expect(options.postMergeScript).toBe('echo from-camel-case-alias')
  })

  test('prefers post-merge-command over postMergeCommand', () => {
    const logger = createLogger()
    const options = resolvePostMergeHookOptions(
      {
        postMergeNodeScript: '',
        postMergeScript: '',
        postMergeCommand: 'echo from-kebab-case',
        postMergeCommandAlias: 'echo from-camel-case',
        continueOnError: '',
        continueOnErrorAlias: ''
      },
      logger
    )

    expect(options.postMergeScript).toBe('echo from-kebab-case')
    expect(logger.warning.mock.calls).toContainEqual([
      'Both post-merge-command and postMergeCommand were provided. Using post-merge-command.'
    ])
  })

  test('prefers post-merge-script over command aliases', () => {
    const logger = createLogger()
    const options = resolvePostMergeHookOptions(
      {
        postMergeNodeScript: '',
        postMergeScript: 'echo from-script',
        postMergeCommand: 'echo from-command',
        postMergeCommandAlias: '',
        continueOnError: '',
        continueOnErrorAlias: ''
      },
      logger
    )

    expect(options.postMergeScript).toBe('echo from-script')
    expect(logger.warning.mock.calls).toContainEqual([
      'Both post-merge-script and post-merge-command were provided. Using post-merge-script.'
    ])
  })

  test('supports the camelCase continue-on-error alias', () => {
    const logger = createLogger()
    const options = resolvePostMergeHookOptions(
      {
        postMergeNodeScript: '',
        postMergeScript: '',
        postMergeCommand: '',
        postMergeCommandAlias: '',
        continueOnError: '',
        continueOnErrorAlias: 'true'
      },
      logger
    )

    expect(options.continueOnError).toBe(true)
  })

  test('runs node script before raw script when both are provided', () => {
    const logger = createLogger()
    const executor = createExecutor()

    runPostMergeHooks(
      {
        postMergeNodeScript: 'post-merge.js',
        postMergeScript: 'echo raw script',
        continueOnError: false
      },
      {
        gitRoot,
        mergedFiles: [],
        hasConflict: false,
        hasErrors: false
      },
      logger,
      executor
    )

    expect(executor).toHaveBeenNthCalledWith(
      1,
      `node '${path.resolve(gitRoot, 'post-merge.js')}'`,
      expect.any(Object)
    )
    expect(executor).toHaveBeenNthCalledWith(
      2,
      'echo raw script',
      expect.any(Object)
    )
  })

  test('throws when a hook fails by default', () => {
    const logger = createLogger()
    const executor = jest.fn(() => {
      throw new Error('boom')
    }) as jest.MockedFunction<PostMergeHookExecutor>

    expect(() =>
      runPostMergeHooks(
        {
          postMergeNodeScript: '',
          postMergeScript: 'exit 1',
          continueOnError: false
        },
        {
          gitRoot,
          mergedFiles: [],
          hasConflict: false,
          hasErrors: false
        },
        logger,
        executor
      )
    ).toThrow('post-merge script failed: boom')
  })

  test('continues when a hook fails and continue-on-error is enabled', () => {
    const logger = createLogger()
    const executor = jest.fn(() => {
      throw new Error('boom')
    }) as jest.MockedFunction<PostMergeHookExecutor>

    expect(() =>
      runPostMergeHooks(
        {
          postMergeNodeScript: '',
          postMergeScript: 'exit 1',
          continueOnError: true
        },
        {
          gitRoot,
          mergedFiles: [],
          hasConflict: false,
          hasErrors: false
        },
        logger,
        executor
      )
    ).not.toThrow()
    expect(logger.error.mock.calls).toContainEqual([
      'post-merge script failed: boom'
    ])
    expect(logger.warning.mock.calls).toContainEqual([
      'Continuing after failed post-merge script.'
    ])
  })

  test('builds the hook environment variables', () => {
    expect(
      buildPostMergeHookEnv({
        gitRoot,
        mergedFiles: ['a.json', 'b.json'],
        hasConflict: false,
        hasErrors: true
      })
    ).toEqual(
      expect.objectContaining({
        MERGED_FILES: 'a.json,b.json',
        HAS_CONFLICT: 'false',
        HAS_ERRORS: 'true',
        GIT_ROOT: gitRoot
      })
    )
  })
})

describe('post-merge staging and commit', () => {
  test('stages post-merge changes before checking for a commit', async () => {
    const logger = createLogger()
    const executor = createGitExecutor(true, 'M  templates/index.json\n')
    const commit = jest.fn(async () => true)

    await stageAndCommitPostMergeChanges({
      gitRoot,
      commit,
      logger,
      executor
    })

    expect(executor).toHaveBeenNthCalledWith(
      1,
      'git',
      ['-C', gitRoot, 'add', '-A'],
      expect.objectContaining({stdio: 'inherit'})
    )
    expect(executor).toHaveBeenNthCalledWith(
      3,
      'git',
      ['-C', gitRoot, 'diff', '--cached', '--quiet'],
      expect.objectContaining({stdio: 'ignore'})
    )
  })

  test('commits when post-merge changes are staged', async () => {
    const logger = createLogger()
    const executor = createGitExecutor(true, 'M  templates/index.json\n')
    const commit = jest.fn(async () => true)

    const hasCommitted = await stageAndCommitPostMergeChanges({
      gitRoot,
      commit,
      logger,
      executor
    })

    expect(hasCommitted).toBe(true)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(logger.info.mock.calls).toContainEqual(['Creating the commit...'])
  })

  test('skips commit when there are no staged changes', async () => {
    const logger = createLogger()
    const executor = createGitExecutor(false)
    const commit = jest.fn(async () => true)

    const hasCommitted = await stageAndCommitPostMergeChanges({
      gitRoot,
      commit,
      logger,
      executor
    })

    expect(hasCommitted).toBe(false)
    expect(commit).not.toHaveBeenCalled()
    expect(logger.info.mock.calls).toContainEqual([
      'No staged changes to commit after post-merge hooks.'
    ])
  })
})
