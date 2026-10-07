// @ts-check
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

const CORE_ESCAPE_MESSAGE =
  'src/core는 상대 경로로 core 밖을 import할 수 없습니다(스펙 §7 규칙 1). 필요한 것은 core 안으로 옮기세요.'
const CORE_PACKAGE_MESSAGE =
  'src/core는 React·Konva·IndexedDB·스토어 패키지를 import하지 않습니다(스펙 §7). 순수 TS로 두세요.'
const CLIPPER_MESSAGE =
  'clipper2-ts는 src/core/geom.ts만 import합니다. Region 타입과 geom.ts 함수를 쓰세요.'

/** @typedef {{ regex: string; message: string }} ImportBan */

/**
 * core에서 막는 UI·저장 패키지(하위 경로 포함). zod·immer·polylabel·clipper2-ts는 허용합니다.
 * @type {ImportBan}
 */
const CORE_PACKAGE_BAN = {
  regex: '^(react|react-dom|react-konva|konva|idb-keyval|zustand)(/.*)?$',
  message: CORE_PACKAGE_MESSAGE,
}

/** @type {ImportBan} */
const CLIPPER_BAN = { regex: '^clipper2-ts(/.*)?$', message: CLIPPER_MESSAGE }

/**
 * src/core 아래 depth단계 폴더에 있는 파일에서 core 밖으로 나가는 상대 경로.
 * depth 0(src/core/x.ts)은 '../', depth 1(src/core/ops/x.ts)은 '../../'부터 core 밖입니다.
 * @param {number} depth
 * @returns {ImportBan}
 */
function coreEscapeBan(depth) {
  return { regex: `^(\\./)?(\\.\\./){${depth + 1}}`, message: CORE_ESCAPE_MESSAGE }
}

/**
 * @param {ImportBan[]} patterns
 * @returns {import('eslint').Linter.RuleEntry}
 */
function restrictImports(patterns) {
  return ['error', { patterns }]
}

/** clipper2-ts를 직접 다루는 파일. geom.test.ts는 래퍼 내부 표현을 확인할 수 있게 허용합니다. */
const GEOM_FILES = ['src/core/geom.ts', 'src/core/geom.test.ts']

/** src/core 아래 폴더 깊이 0~3마다 경계 규칙을 하나씩 만듭니다. */
const coreBoundary = [0, 1, 2, 3].map((depth) => ({
  name: `tentfit/core-boundary-depth-${depth}`,
  files: [`src/core/${'*/'.repeat(depth)}*.{ts,tsx}`],
  ignores: GEOM_FILES,
  rules: {
    'no-restricted-imports': restrictImports([coreEscapeBan(depth), CORE_PACKAGE_BAN, CLIPPER_BAN]),
  },
}))

export default defineConfig([
  globalIgnores(['dist/', 'coverage/', 'spikes/', 'docs/']),
  {
    name: 'tentfit/base',
    files: ['**/*.{js,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    name: 'tentfit/react-hooks',
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    name: 'tentfit/clipper-only-in-geom',
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    ignores: ['src/core/**'],
    rules: {
      'no-restricted-imports': restrictImports([CLIPPER_BAN]),
    },
  },
  ...coreBoundary,
  {
    name: 'tentfit/core-boundary-geom',
    files: GEOM_FILES,
    rules: {
      'no-restricted-imports': restrictImports([coreEscapeBan(0), CORE_PACKAGE_BAN]),
    },
  },
])
