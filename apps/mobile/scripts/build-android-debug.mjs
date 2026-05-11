import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const scriptDir = path.dirname(new URL(import.meta.url).pathname)
const mobileDir = path.resolve(scriptDir, '..')
const androidDir = path.join(mobileDir, 'android')
const apkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

const javaHome = resolveJavaHome()
const androidSdkRoot = resolveAndroidSdkRoot()

if (!javaHome) {
  fail(
    'Missing Java runtime. Install `openjdk@21` or set `JAVA_HOME` before building Android debug APK.',
  )
}

if (!androidSdkRoot) {
  fail(
    'Missing Android SDK. Install `android-commandlinetools` and set `ANDROID_SDK_ROOT` before building Android debug APK.',
  )
}

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_SDK_ROOT: androidSdkRoot,
  ANDROID_HOME: androidSdkRoot,
  PATH: buildPath(javaHome),
  GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || '/tmp/linx-gradle',
}

run('yarn', ['run', 'sync'], mobileDir, env)
run('./gradlew', ['assembleDebug'], androidDir, env)

if (!existsSync(apkPath)) {
  fail(`Android build finished without producing APK at ${apkPath}`)
}

console.log(`\n[mobile] Debug APK ready: ${apkPath}`)

function resolveJavaHome() {
  const envCandidates = [
    process.env.JAVA_HOME,
  ].filter(Boolean)

  const brewCandidates = [
    getBrewPrefix('openjdk@21'),
    getBrewPrefix('openjdk'),
  ].filter(Boolean)

  const pathCandidates = [
    ...brewCandidates,
    '/opt/homebrew/opt/openjdk@21',
    '/opt/homebrew/opt/openjdk',
    '/usr/local/opt/openjdk@21',
    '/usr/local/opt/openjdk',
  ]

  const candidates = [...envCandidates, ...pathCandidates]
  return candidates.find((candidate) => hasJavaBinary(candidate)) ?? null
}

function resolveAndroidSdkRoot() {
  const envCandidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
  ].filter(Boolean)

  const brewSdkPrefix = getBrewPrefix('android-commandlinetools')

  const pathCandidates = [
    brewSdkPrefix ? path.join(brewSdkPrefix, 'share', 'android-commandlinetools') : null,
    '/opt/homebrew/share/android-commandlinetools',
    path.join(process.env.HOME ?? '', 'Library', 'Android', 'sdk'),
    '/usr/local/share/android-commandlinetools',
  ].filter(Boolean)

  const candidates = [...envCandidates, ...pathCandidates]
  return candidates.find((candidate) => hasSdkManager(candidate) || hasPlatformTools(candidate)) ?? null
}

function hasJavaBinary(root) {
  if (!root) return false

  return [
    path.join(root, 'bin', 'java'),
    path.join(root, 'libexec', 'openjdk.jdk', 'Contents', 'Home', 'bin', 'java'),
  ].some((candidate) => existsSync(candidate))
}

function hasSdkManager(root) {
  if (!root) return false

  return [
    path.join(root, 'cmdline-tools', 'latest', 'bin', 'sdkmanager'),
    path.join(root, 'cmdline-tools', 'bin', 'sdkmanager'),
  ].some((candidate) => existsSync(candidate))
}

function hasPlatformTools(root) {
  if (!root) return false
  return existsSync(path.join(root, 'platform-tools'))
}

function buildPath(javaHomePath) {
  const javaBin = existsSync(path.join(javaHomePath, 'bin', 'java'))
    ? path.join(javaHomePath, 'bin')
    : path.join(javaHomePath, 'libexec', 'openjdk.jdk', 'Contents', 'Home', 'bin')

  return [javaBin, process.env.PATH].filter(Boolean).join(path.delimiter)
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function fail(message) {
  console.error(`[mobile] ${message}`)
  process.exit(1)
}

function getBrewPrefix(formula) {
  const result = spawnSync('brew', ['--prefix', formula], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    return null
  }

  const prefix = result.stdout.trim()
  return prefix || null
}
