/**
 * اختبار الصنف الفرعي من وحدة أكبر (جركن ← كيلو) + نسخة التحميل، على قاعدة مؤقتة من غير سيرفر HTTP.
 */
import { existsSync, mkdirSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createProduct, listProducts, updateProduct } from '../src/main/services/catalog'
import { openDay } from '../src/main/services/cashSession'
import { checkout } from '../src/main/services/pos'
import { createDownloadSnapshot } from '../src/main/services/backup'
import { getPosUiSettings, updatePosUiSettings } from '../src/main/services/settings'
import type { CheckoutInput, Product, ProductInput } from '../src/shared/types'

const DATA_DIR = join(process.cwd(), 'data', 'sub-units-test')
const DB_PATH = join(DATA_DIR, 'sub-units-test.sqlite')
process.env.QCP_DATA_DIR = DATA_DIR

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.error(`  ❌ ${msg}`)
  }
}
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.0011
const scalar = async (sql: string, args: unknown[] = []): Promise<any> => ((await getDb().execute({ sql, args: args as any })).rows[0] as any)?.v

function productInput(over: Partial<ProductInput>): ProductInput {
  return {
    name: 'صنف', barcode: '', categoryId: null, unitId: null, vendorId: null, costPrice: 0, retailPrice: 0,
    wholesalePrice: 0, wholesale2Price: 0, packPrice: 0, openingQuantity: 0, reorderPoint: 0, warehouseId: 1,
    expiryDate: null, serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null, ...over
  }
}
function sale(over: Partial<CheckoutInput>): CheckoutInput {
  return { customerId: null, warehouseId: 1, lines: [], discountType: 'value', discountValue: 0, paymentMethod: 'cash', paid: 0, redeemPoints: 0, ...over }
}
function updateInput(p: Product, over: Record<string, unknown>): any {
  return {
    name: p.name, barcode: p.barcode, categoryId: p.categoryId, unitId: p.unitId, vendorId: p.vendorId, costPrice: p.costPrice,
    retailPrice: p.retailPrice, wholesalePrice: 0, wholesale2Price: 0, packPrice: 0, reorderPoint: p.reorderPoint, expiryDate: null,
    serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null, ...over
  }
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(DB_PATH + suffix)) rmSync(DB_PATH + suffix)
  await initDatabaseAtPath(DB_PATH)
  const warehouseId = Number(await scalar('SELECT id AS v FROM warehouses WHERE is_default = 1'))
  const adminId = Number(await scalar("SELECT id AS v FROM users WHERE username = 'admin'"))
  const qty = async (id: number): Promise<number> => Number((await scalar('SELECT quantity AS v FROM stock WHERE product_id = ? AND warehouse_id = ?', [id, warehouseId])) ?? 0)
  const get = async (id: number): Promise<Product> => (await listProducts('', warehouseId)).find((p) => p.id === id)!
  await updatePosUiSettings({ ...(await getPosUiSettings()), allowNegativeStock: false })
  await openDay(adminId, 0)

  console.log('1) تعريف الجركن والكيلو')
  const jer = await createProduct(productInput({ name: 'زيت جركن', costPrice: 6000, retailPrice: 7000, openingQuantity: 3, warehouseId }))
  const kilo = await createProduct(productInput({ name: 'زيت كيلو', costPrice: 0, retailPrice: 75, openingQuantity: 0, warehouseId, parentProductId: jer.id, unitsPerParent: 100 }))
  assert(kilo.parentProductId === jer.id && kilo.unitsPerParent === 100 && kilo.parentQuantity === 3, 'الكيلو مربوط بالجركن (100) ورصيد الجركن ظاهر معاه')
  assert(jer.parentProductId === null && jer.unitsPerParent === 0, 'الجركن صنف عادي')
  const line = (p: { id: number; name: string; barcode: string }, q: number, unitPrice: number) => ({ productId: p.id, name: p.name, barcode: p.barcode, unitPrice, qty: q, discount: 0 })

  console.log('\n2) بيع 5 كيلو والرصيد صفر → يفتح جركن واحد')
  const r1 = await checkout(sale({ warehouseId, lines: [line(kilo, 5, 75)], paid: 375 }), adminId)
  assert(r1.ok === true, `البيع نجح (${r1.error ?? ''})`)
  assert(near(await qty(jer.id), 2) && near(await qty(kilo.id), 95), 'الجركن 3→2 والكيلو 0→95')
  assert(near((await get(kilo.id)).costPrice, 60), 'تكلفة الكيلو اتحدّثت = 6000 ÷ 100')
  assert(near(Number(await scalar('SELECT cost_price AS v FROM sales_items WHERE invoice_id = ?', [r1.invoiceId])), 60), 'تكلفة البيع المسجلة على الفاتورة 60')
  assert(Number(await scalar("SELECT COUNT(*) AS v FROM stock_movements WHERE ref_type = 'unit_break'")) === 2, 'حركتين فكّ في المخزون')

  console.log('\n3) بيع 20 كيلو والرصيد كافي → مايفتحش جركن')
  const r2 = await checkout(sale({ warehouseId, lines: [line(kilo, 20, 75)], paid: 1500 }), adminId)
  assert(r2.ok === true && near(await qty(jer.id), 2) && near(await qty(kilo.id), 75), 'الجركن 2 والكيلو 75')

  console.log('\n4) جركن + كيلو في نفس الفاتورة')
  const r3 = await checkout(sale({ warehouseId, lines: [line(jer, 1, 7000), line(kilo, 80, 75)], paid: 13000 }), adminId)
  assert(r3.ok === true, `البيع نجح (${r3.error ?? ''})`)
  assert(near(await qty(jer.id), 0) && near(await qty(kilo.id), 95), 'جركن اتباع + جركن اتفكّ → الجركن 0 والكيلو 95')

  console.log('\n5) الجركن المباع في نفس الفاتورة مايتفكّش')
  await getDb().execute({ sql: 'UPDATE stock SET quantity = 1 WHERE product_id = ?', args: [jer.id] })
  const r4 = await checkout(sale({ warehouseId, lines: [line(jer, 1, 7000), line(kilo, 120, 75)], paid: 16000 }), adminId)
  assert(r4.ok === false && /غير كافية/.test(r4.error ?? ''), 'اترفض: الكمية غير كافية')
  assert(near(await qty(jer.id), 1) && near(await qty(kilo.id), 95), 'مفيش أي تغيير في المخزون بعد الرفض')

  console.log('\n6) كمية كبيرة → يفتح أكتر من جركن')
  await getDb().execute({ sql: 'UPDATE stock SET quantity = 5 WHERE product_id = ?', args: [jer.id] })
  const r5 = await checkout(sale({ warehouseId, lines: [line(kilo, 250.5, 75)], paid: 18787.5 }), adminId)
  assert(r5.ok === true && near(await qty(jer.id), 3) && near(await qty(kilo.id), 44.5), 'فتح 2 جركن: الجركن 5→3 والكيلو 95→44.5')

  console.log('\n7) أكتر من كل المتاح → رفض')
  const r6 = await checkout(sale({ warehouseId, lines: [line(kilo, 400, 75)], paid: 30000 }), adminId)
  assert(r6.ok === false && near(await qty(jer.id), 3) && near(await qty(kilo.id), 44.5), 'اترفض والمخزون زي ما هو')

  console.log('\n8) البيع بالسالب مسموح → برضه يفكّ الأول')
  await updatePosUiSettings({ ...(await getPosUiSettings()), allowNegativeStock: true })
  const r7 = await checkout(sale({ warehouseId, lines: [line(kilo, 400, 75)], paid: 30000 }), adminId)
  assert(r7.ok === true && near(await qty(jer.id), 0) && near(await qty(kilo.id), -55.5), 'فكّ الـ3 جراكن والباقي بالسالب (−55.5)')
  const plain = await createProduct(productInput({ name: 'صنف عادي', retailPrice: 10, openingQuantity: 0, warehouseId }))
  const r8 = await checkout(sale({ warehouseId, lines: [line(plain, 2, 10)], paid: 20 }), adminId)
  assert(r8.ok === true && near(await qty(plain.id), -2), 'الصنف العادي بيتباع بالسالب زي ما كان')
  await updatePosUiSettings({ ...(await getPosUiSettings()), allowNegativeStock: false })

  console.log('\n9) قواعد الربط')
  const err = async (fn: () => Promise<unknown>): Promise<string> => fn().then(() => '', (e) => String(e?.message ?? e))
  assert(/نفسه صنف فرعي/.test(await err(() => createProduct(productInput({ name: 'ربع كيلو', parentProductId: kilo.id, unitsPerParent: 4, warehouseId })))), 'مينفعش فرعي من فرعي')
  assert(/أكبر من صفر/.test(await err(() => createProduct(productInput({ name: 'غلط', parentProductId: jer.id, unitsPerParent: 0, warehouseId })))), 'لازم معامل أكبر من صفر')
  assert(/ليه أصناف فرعية/.test(await err(() => updateProduct(jer.id, updateInput(jer, { parentProductId: plain.id, unitsPerParent: 2 })))), 'الصنف اللي ليه فروع مايبقاش فرعي')
  assert(/من نفسه/.test(await err(() => updateProduct(plain.id, updateInput(plain, { parentProductId: plain.id, unitsPerParent: 2 })))), 'مينفعش فرعي من نفسه')
  const kept = await updateProduct(kilo.id, updateInput(await get(kilo.id), { retailPrice: 80 }))
  assert(kept.parentProductId === jer.id && kept.unitsPerParent === 100 && kept.retailPrice === 80, 'تعديل من شاشة مابتبعتش الحقل → الربط يفضل')
  const cleared = await updateProduct(kilo.id, updateInput(kept, { parentProductId: null, unitsPerParent: 0 }))
  assert(cleared.parentProductId === null && cleared.unitsPerParent === 0, 'إلغاء الربط بيشتغل')

  console.log('\n10) نسخة التحميل على الجهاز')
  const snap = await createDownloadSnapshot()
  assert(existsSync(snap.filePath) && statSync(snap.filePath).size > 50_000 && /^quick-cash-plus-backup-.*\.sqlite$/.test(snap.fileName), `ملف النسخة اتعمل (${statSync(snap.filePath).size} بايت)`)
  rmSync(snap.filePath)

  console.log(`\nالنتيجة: ${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
