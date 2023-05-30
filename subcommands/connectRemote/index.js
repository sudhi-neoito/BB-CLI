/**
 * Copyright (c) Appblocks. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
const path = require('path')
const { existsSync } = require('fs')
const { writeFile } = require('fs/promises')
const { createRepo } = require('../../utils/createRepoV2')
const { confirmationPrompt } = require('../../utils/questionPrompts')
const convertGitSshUrlToHttps = require('../../utils/convertGitUrl')
const { spinnies } = require('../../loader')
const { tryGitInit, isInGitRepository } = require('../../utils/gitCheckUtils')
const { generateGitIgnore } = require('../../templates/createTemplates/function-templates')
const { initializeConfig, updateAllMemberConfig } = require('./util')

const connectRemote = async (cmdOptions) => {
  try {
    spinnies.add('cr', { text: 'Initializing Config' })
    const manager = await initializeConfig()
    const { err } = await manager.findMyParentPackage()
    spinnies.remove('cr')

    if (!err && manager.config.repoType === 'mono') {
      throw new Error('Please run this command from root package context')
    }

    if (manager.config.source.https && !cmdOptions.force) {
      const goAhead = await confirmationPrompt({
        message: `Source already exist. Do you want to replace with new source ?`,
        name: 'goAhead',
      })

      if (!goAhead) throw new Error('Source already exist')
    }

    // check if already git initialized else init
    if (!isInGitRepository()) {
      tryGitInit()
    }

    // check if gitignore exist else add
    const gitIgnorePath = path.join(manager.directory, '.gitignore')
    if (!existsSync(gitIgnorePath)) {
      const gitIgnoreString = generateGitIgnore()
      writeFile(gitIgnorePath, gitIgnoreString)
    }

    let sourceUrl = cmdOptions.sshUrl

    if (!sourceUrl) {
      const createRes = await createRepo(manager.config.name)
      sourceUrl = createRes.sshUrl
    }

    const source = {
      ssh: sourceUrl.trim(),
      https: convertGitSshUrlToHttps(sourceUrl.trim()),
    }

    spinnies.add('cr', { text: 'Adding source to blocks' })

    if (manager.config.repoType === 'multi') {
      manager.updateConfig({ source })
      spinnies.succeed('cr', { text: 'Successfully added source to block' })
      return
    }

    manager.updateConfig({ source })
    await updateAllMemberConfig(manager, source)

    spinnies.succeed('cr', { text: 'Successfully added source to blocks' })
  } catch (error) {
    spinnies.add('cr', { text: 'Adding source to blocks' })
    spinnies.fail('cr', { text: error.message })
  }
}

module.exports = connectRemote