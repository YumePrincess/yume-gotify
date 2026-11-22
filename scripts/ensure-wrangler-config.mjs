import { copyFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configPath = resolve(root, 'wrangler.jsonc')

try {
  await access(configPath)
} catch {
  try {
    await copyFile(
      resolve(root, 'wrangler.example.jsonc'),
      configPath,
      constants.COPYFILE_EXCL
    )
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}
