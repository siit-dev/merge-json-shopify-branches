# Merge Shopify JSONs between branches

This action is used to merge Shopify JSONs between branches. It will merge the JSONs from the source branch into the target branch and commit the changes.

## Usage

```yaml
name: Merge JSON files

concurrency:
  group: main
  cancel-in-progress: true

on:
  workflow_dispatch:

env:
  NODE_VERSION: 18
  NPM_VERSION: 9

jobs:
  merge-json:
    name: Merge JSON files
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - uses: @smartimpact-it/merge-shopify-jsons@v1
```

## Usage with protected branches

If the `main` branch is a protected Github branch, you will need to use a Personal Access Token with the `repo` scope to commit the changes. For example, you can use the [`CasperWA/push-protected`](https://github.com/CasperWA/push-protected) action to commit the changes.

You will also need to pass the `push-after-commit` input to the action and set it to `false`. This will prevent the action from pushing the changes to the remote repository. Then you can use the `CasperWA/push-protected` action to push the changes to the remote repository.

Also make sure to create the `PUSH_TO_PROTECTED_BRANCH` secret in the repository settings and add the Personal Access Token as the value. The PAT should have the `repo` scope and be created by an `admin` of the repository ([see more](https://github.com/CasperWA/push-protected#pat-user-permissions)).

```yaml
name: Merge JSON files

concurrency:
  group: main
  cancel-in-progress: true

on:
  workflow_dispatch:

env:
  NODE_VERSION: 18
  NPM_VERSION: 9

jobs:
  merge-json:
    name: Merge JSON files
    runs-on: ubuntu-latest
    if: github.event.inputs.merge == 'true' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - uses: siit-dev/merge-json-shopify-branches@releases/v1
        id: merge-json
        with:
          push-after-commit: false

      - name: Push the changes, if there are any
        if: success() && steps.merge-json.outputs.hasCommitted == 'true'
        uses: CasperWA/push-protected@v2
        with:
          token: ${{ secrets.PUSH_TO_PROTECTED_BRANCH }}
          branch: main
          unprotect_reviews: true
```

## Parameters

| Parameter                        | Description                    | Default                                                                                                                                                      |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `json-paths`                     | JSON paths to merge            | `config/*.json,locales/*.json,templates/**/*.json`                                                                                                           |
| `main-branch`                    | Main branch                    | `main`                                                                                                                                                       |
| `production-branch`              | Production branch              | `production`                                                                                                                                                 |
| `live-mirror-branch`             | Live mirror branch             | `live-mirror`                                                                                                                                                |
| `check-json-validity`            | Check JSON validity            | `true`                                                                                                                                                       |
| `formatter-command`              | Formatter command              | Leave blank to use Prettier                                                                                                                                  |
| `commit-message`                 | Commit message                 | ` [AUTOMATED] Update JSON files from ``#liveMirror#`` branch: #files# `                                                                                      |
| `push-after-commit`              | Push after commit              | `true`                                                                                                                                                       |
| `preferred`                      | Preferred merge strategy       | `theirs`                                                                                                                                                     |
| `exit-if-no-existing-deployment` | Exit if no existing deployment | `true`                                                                                                                                                       |
| `config-git-user`                | Configure git user             | `true`                                                                                                                                                       |
| `verbose`                        | Verbose                        | `false`                                                                                                                                                      |
| `config-file`                    | Config file                    | The path to a config file that will be used to load the settings. See [json-merge-shopify](https://www.npmjs.com/package/@smartimpact-it/json-merge-shopify) |
