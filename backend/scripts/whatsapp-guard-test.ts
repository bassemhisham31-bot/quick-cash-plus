import { tmpdir } from 'os'
import { mkdirSync } from 'fs'
process.env.QCP_WA_TEST = '1'
process.env.QCP_WA_GUARD_TEST = '1'
process.env.QCP_WA_MIN_DELAY_S = '1'
process.env.QCP_WA_MAX_DELAY_S = '2'
process.env.QCP_WA_DAILY_CAP = '3'
process.env.QCP_DATA_DIR = tmpdir() + '/wa-guard-test-' + Date.now()
mkdirSync(process.env.QCP_DATA_DIR, { recursive: true })
import { __setFakeSocketForTests, sendWhatsAppMessage, getWhatsAppGuardStats } from '../src/main/services/whatsapp'
let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log(c ? '  ✅' : '  ❌', m) }
async function main() {
  const sent: number[] = []
  __setFakeSocketForTests({ sendMessage: async () => void sent.push(Date.now()) } as any)
  // أول 30 يوم تسخين: الحد الفعلي = min(3, 30) = 3
  const r = []
  for (let i = 0; i < 5; i++) r.push(await sendWhatsAppMessage('0101234567' + i, 'm' + i))
  ok(r.slice(0, 3).every((x) => x.ok), 'أول 3 اتقبلوا في الطابور')
  ok(!r[3].ok && !r[4].ok, 'الرابعة والخامسة اترفضوا بسبب الحد اليومي')
  ok(sent.length === 0, 'مفيش حاجة اتبعتت فورًا (الطابور)')
  const dup = await sendWhatsAppMessage('01012345670', 'm0')
  ok(getWhatsAppGuardStats().queued <= 3, 'مفيش تكرار في الطابور')
  await new Promise((res) => setTimeout(res, 16000))
  ok(sent.length === 3, 'الـ3 اتبعتوا (' + sent.length + ')')
  ok(sent[1] - sent[0] >= 1000 && sent[2] - sent[1] >= 1000, 'فاصل ≥ ثانية بين الرسائل')
  ok(getWhatsAppGuardStats().sentToday === 3, 'العدّاد = 3')
  const m = await sendWhatsAppMessage('01099999999', 'manual', { manual: true })
  ok(m.ok && sent.length === 4, 'اليدوي بيتبعت فورًا حتى بعد الحد')
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل`)
  process.exit(fail ? 1 : 0)
}
main()
