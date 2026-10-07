import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const eslint = new ESLint({ cwd: root })

/** 코드 조각을 주어진 경로의 파일인 것처럼 lint하고, no-restricted-imports 메시지만 돌려준다. */
async function restricted(relPath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, relPath) })
  return result.messages
    .filter((m) => m.ruleId === 'no-restricted-imports')
    .map((m) => m.message)
}

describe('ESLint core 경계 (스펙 §7 규칙 1)', { timeout: 30_000 }, () => {
  it('core 최상위 파일이 ../ 로 core 밖을 import하면 막는다', async () => {
    const messages = await restricted(
      'src/core/__probe.ts',
      "import App from '../app/App'\nexport const probe = App\n",
    )
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('스펙 §7')
  })

  it('import type과 re-export도 막는다', async () => {
    expect(
      await restricted('src/core/model.ts', "import type { Doc } from '../store/doc'\nexport type D = Doc\n"),
    ).toHaveLength(1)
    expect(await restricted('src/core/model.ts', "export { useDoc } from '../store/doc'\n")).toHaveLength(1)
    expect(await restricted('src/core/model.ts', "export * from './../ui/Toast'\n")).toHaveLength(1)
  })

  it('core 안의 상대 경로는 허용한다', async () => {
    expect(await restricted('src/core/zones.ts', "import { round1 } from './model'\nexport const r = round1\n")).toHaveLength(0)
    expect(await restricted('src/core/ops/items.ts', "import { round1 } from '../model'\nexport const r = round1\n")).toHaveLength(0)
    expect(await restricted('src/core/ops/items.ts', "import { normalizeGroups } from './groups'\nexport const n = normalizeGroups\n")).toHaveLength(0)
  })

  it('core 하위 폴더 파일이 ../../ 로 core 밖을 import하면 막는다', async () => {
    expect(
      await restricted('src/core/ops/items.ts', "import { useDoc } from '../../store/doc'\nexport const u = useDoc\n"),
    ).toHaveLength(1)
  })

  it('core에서 React·Konva·IndexedDB·스토어 패키지를 막고 허용 패키지는 통과시킨다', async () => {
    expect(await restricted('src/core/model.ts', "import { useState } from 'react'\nexport const s = useState\n")).toHaveLength(1)
    expect(await restricted('src/core/model.ts', "import Konva from 'konva'\nexport const k = Konva\n")).toHaveLength(1)
    expect(await restricted('src/core/model.ts', "import { Stage } from 'react-konva'\nexport const s = Stage\n")).toHaveLength(1)
    expect(await restricted('src/core/model.ts', "import { get } from 'idb-keyval'\nexport const g = get\n")).toHaveLength(1)
    expect(await restricted('src/core/model.ts', "import { create } from 'zustand'\nexport const c = create\n")).toHaveLength(1)
    expect(
      await restricted(
        'src/core/model.ts',
        "import { z } from 'zod'\nimport { produce } from 'immer'\nimport polylabel from 'polylabel'\nexport const all = [z, produce, polylabel]\n",
      ),
    ).toHaveLength(0)
  })

  it('clipper2-ts는 src/core/geom.ts(와 그 테스트)만 import한다', async () => {
    const code = "import { Clipper } from 'clipper2-ts'\nexport const c = Clipper\n"
    expect(await restricted('src/core/geom.ts', code)).toHaveLength(0)
    expect(await restricted('src/core/geom.test.ts', code)).toHaveLength(0)
    expect(await restricted('src/core/zones.ts', code)).toHaveLength(1)
    expect(await restricted('src/core/ops/tent.ts', code)).toHaveLength(1)
    expect(await restricted('src/view/canvas/Board.tsx', code)).toHaveLength(1)
    expect(await restricted('scripts/validate-presets.ts', code)).toHaveLength(1)
  })

  it('core 밖에서는 core를 상대 경로로 import할 수 있다', async () => {
    expect(
      await restricted('src/view/canvas/Board.tsx', "import { area } from '../../core/geom'\nexport const a = area\n"),
    ).toHaveLength(0)
  })

  it('geom.ts도 core 밖 상대 경로는 막는다', async () => {
    expect(await restricted('src/core/geom.ts', "import App from '../app/App'\nexport const a = App\n")).toHaveLength(1)
  })
})
