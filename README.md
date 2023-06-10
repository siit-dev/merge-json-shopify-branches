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
    inputs:
      merge:
        description: 'Merge JSON files (true/false)'
        required: true
        default: 'false'

env:
  NODE_VERSION: 18
  NPM_VERSION: 9
  COMMIT_CHANGES: true
  NO_VALIDITY_CHECK: true

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
