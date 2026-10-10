import { z } from 'zod'
import * as S from '../src/shared/schemas'
for (const [k, v] of Object.entries(S)) {
  if (v && typeof v === 'object' && 'safeParse' in (v as object) && k.endsWith('Schema')) {
    const js = JSON.stringify(z.toJSONSchema(v as z.ZodType))
    const props = (js.match(/"type":"object"/g) ?? []).length
    const enums = (js.match(/"enum"/g) ?? []).length
    console.log(k.padEnd(26), String(js.length).padStart(6), 'chars', String(props).padStart(3), 'objects', enums, 'enums')
  }
}
