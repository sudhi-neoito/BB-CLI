/* eslint-disable no-param-reassign */
/**
 * Copyright (c) Appblocks. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const chalk = require('chalk')
const { existsSync, createReadStream, watchFile } = require('fs')
const path = require('path')
const { BB_CONFIG_NAME } = require('../../utils/constants')
const ConfigFactory = require('../../utils/configManagers/configFactory')
const BlockConfigManager = require('../../utils/configManagers/blockConfigManager')
const { BB_FILES, generateOutLogPath, generateErrLogPath } = require('../../utils/bbFolders')

const log = async (blockName, { err, out, lines }) => {
  try {
    const configPath = path.resolve(BB_CONFIG_NAME)
    const { manager: cm, error } = await ConfigFactory.create(configPath)
    if (error) {
      if (error.type !== 'OUT_OF_CONTEXT') throw error
      throw new Error('Please run the command inside package context ')
    }

    let manager = cm

    if (manager instanceof BlockConfigManager) {
      throw new Error('Please run the command inside package context ')
    }

    const { ELEMENTS_LOG, FUNCTIONS_LOG } = BB_FILES

    const fnOutLogs = generateOutLogPath(FUNCTIONS_LOG)
    const fnErrLogs = generateErrLogPath(FUNCTIONS_LOG)

    const eleOutLogs = generateOutLogPath(ELEMENTS_LOG)
    const eleErrLogs = generateErrLogPath(ELEMENTS_LOG)

    const filesToWatch = []

    let blockManager
    if (blockName) {
      const bManager = await manager.getAnyBlock(blockName)
      if (!bManager) {
        throw new Error(`Block doesn't exist`)
      }

      if (bManager.isBlockConfigManager && !bManager.isLive) {
        throw new Error(`${blockName} is not live.`)
      }

      if (bManager.isPackageConfigManager) {
        manager = bManager
      } else blockManager = bManager
    }

    if (blockManager) {
      console.log(`Showing log of ${blockName}`)
      const appLiveData = blockManager.liveDetails
      const blockType = blockManager.config.type
      const logOutPath = blockType === 'function' ? fnOutLogs : appLiveData.log.out
      const logErrPath = blockType === 'function' ? fnErrLogs : appLiveData.log.err

      if (err) {
        filesToWatch.push(logErrPath)
      }
      if (out) {
        filesToWatch.push(logErrPath)
      }

      if (!err && !out) {
        filesToWatch.push(logOutPath, logErrPath)
      }
    } else {
      const containerData = [...(await manager.uiBlocks())].find(({ meta }) => meta.type === 'ui-container')
      const containerLiveData = containerData.liveDetails || {}

      if (err) {
        if (containerLiveData?.log) filesToWatch.push(containerLiveData.log.err)
        filesToWatch.push(fnOutLogs, eleOutLogs, fnErrLogs, eleErrLogs)
      }
      if (out) {
        if (containerLiveData?.log) filesToWatch.push(containerLiveData.log.out)
        filesToWatch.push(fnOutLogs, eleOutLogs, fnErrLogs, eleErrLogs)
      }
      if (!err && !out) {
        if (containerLiveData?.log) filesToWatch.push(containerLiveData.log.err, containerLiveData.log.out)
        filesToWatch.push(fnOutLogs, eleOutLogs, fnErrLogs, eleErrLogs)
      }
    }

    const readLog = (logPath, start, end) => {
      const stream = createReadStream(logPath, { encoding: 'utf8', autoClose: false, start, end })
      const logFileName = path.basename(logPath)
      stream.on('data', (d) => {
        const logType = logPath.includes('/err/') ? 'Error' : 'Log'
        const logMsg = `\n${logFileName
          .replace('.log', '')
          .toUpperCase()} [${logType}] ${new Date().toLocaleString()} - ${logFileName}:\n\n${d.trim()}\n`
        if (logType === 'Error') console.log(chalk.red(logMsg))
        else console.log(logMsg)
      })
    }

    const readOldLog = (logPath) => {
      const stream = createReadStream(logPath, { encoding: 'utf8', autoClose: false })
      const logFileName = path.basename(logPath)

      const chunkSize = 1024
      let buffer = ''

      stream.on('data', (data) => {
        buffer += data
        // Ensure buffer doesn't grow too large
        if (buffer.length > chunkSize * 2) {
          buffer = buffer.slice(-chunkSize)
        }
      })

      stream.on('end', () => {
        const logDataLines = buffer.split('\n').filter((line) => line.trim() !== '')
        const lastNLines = logDataLines.slice(-lines).join('\n').trim()
        if (!lastNLines.length || lastNLines === '""') return
        const logType = logPath.includes('/err/') ? 'Error' : 'Log'
        const logMsg = `\n${logFileName
          .replace('.log', '')
          .toUpperCase()} [${logType}] ${new Date().toLocaleString()} - ${logFileName}:\n\n${lastNLines}\n`
        if (logType === 'Error') console.log(chalk.red(logMsg))
        else console.log(logMsg)
      })
    }

    // watch each file for changes
    filesToWatch.forEach((filePath) => {
      if (!existsSync(filePath)) return
      readOldLog(filePath)
      watchFile(filePath, { persistent: true, interval: 500 }, (currStat, prevStat) => {
        if (currStat.size === prevStat.size) return
        readLog(filePath, prevStat.size, currStat.size)
      })
    })

    console.log(`\n... watching logs ...\n`)
  } catch (error) {
    console.log(error.message)
  }
}

module.exports = log