import { getDb } from '../db'
import { getWalkInCustomerId } from '../db/seed'
import { runLocalBackup } from './backup'
import type { DataResetResult } from '../../shared/types'

async function verifyAdmin(userId: number): Promise<string | null> {
  const db = getDb()
  const rs = await db.execute({ sql: "SELECT role FROM users WHERE id = ?", args: [userId] })
  const row = rs.rows[0] as any
  if (!row || row.role !== 'admin') return 'العملية دي متاحة للأدمن فقط'
  return null
}

async function withMandatoryBackupAndTransaction(
  userId: number,
  run: (tx: Awaited<ReturnType<ReturnType<typeof getDb>['transaction']>>) => Promise<void>
): Promise<DataResetResult> {
  const adminError = await verifyAdmin(userId)
  if (adminError) return { ok: false, error: adminError }

  const backup = await runLocalBackup()
  if (!backup.ok) {
    return { ok: false, error: `تعذّر إنشاء نسخة احتياطية إجبارية قبل الحذف، فاتوقفت العملية: ${backup.error}` }
  }

  const db = getDb()
  // SQLite بيرفض تغيير PRAGMA foreign_keys وإحنا جوه transaction — لازم يتعطّل قبل ما تبدأ ويترجّع بعد ما تخلص
  await db.execute('PRAGMA foreign_keys = OFF')
  const tx = await db.transaction('write')
  try {
    await run(tx)
    await tx.commit()
    return { ok: true, backupFilePath: backup.filePath }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'حدث خطأ أثناء الحذف — تم التراجع عن كل التغييرات' }
  } finally {
    await db.execute('PRAGMA foreign_keys = ON')
  }
}

export async function resetCustomers(userId: number): Promise<DataResetResult> {
  return withMandatoryBackupAndTransaction(userId, async (tx) => {
    const walkInId = await getWalkInCustomerId(getDb())
    await tx.execute({ sql: 'UPDATE sales_invoices SET customer_id = ? WHERE customer_id != ?', args: [walkInId, walkInId] })
    await tx.execute('DELETE FROM party_settlements')
    await tx.execute("DELETE FROM payments WHERE party_type = 'customer'")
    await tx.execute('DELETE FROM customers WHERE is_walk_in = 0')
  })
}

export async function resetProducts(userId: number): Promise<DataResetResult> {
  return withMandatoryBackupAndTransaction(userId, async (tx) => {
    await tx.execute('DELETE FROM product_prices')
    await tx.execute('DELETE FROM stock')
    await tx.execute('DELETE FROM stock_movements')
    await tx.execute('DELETE FROM products')
  })
}

export async function resetSales(userId: number): Promise<DataResetResult> {
  return withMandatoryBackupAndTransaction(userId, async (tx) => {
    await tx.execute('DELETE FROM sales_return_items')
    await tx.execute('DELETE FROM sales_returns')
    await tx.execute('DELETE FROM sales_items')
    await tx.execute('DELETE FROM sales_invoices')
    await tx.execute('UPDATE quotations SET converted_invoice_id = NULL WHERE converted_invoice_id IS NOT NULL')
    // أرصدة العملاء ونقاط الولاء كانت ناتجة بالكامل من تاريخ المبيعات اللي اتمسح، فبترجع للصفر عشان محدش يفضل عليه دين وهمي بدون فواتير تفسّره
    await tx.execute('UPDATE customers SET balance = 0, loyalty_points = 0')
  })
}

export async function resetVendors(userId: number): Promise<DataResetResult> {
  return withMandatoryBackupAndTransaction(userId, async (tx) => {
    await tx.execute('UPDATE purchase_invoices SET vendor_id = NULL')
    await tx.execute('UPDATE customers SET linked_vendor_id = NULL WHERE linked_vendor_id IS NOT NULL')
    await tx.execute("DELETE FROM payments WHERE party_type = 'vendor'")
    await tx.execute('DELETE FROM party_settlements')
    await tx.execute('DELETE FROM vendors')
  })
}

export async function resetCategories(userId: number): Promise<DataResetResult> {
  return withMandatoryBackupAndTransaction(userId, async (tx) => {
    await tx.execute('UPDATE products SET category_id = NULL WHERE category_id IS NOT NULL')
    await tx.execute('DELETE FROM categories')
  })
}

export async function resetExpenses(userId: number): Promise<DataResetResult> {
  return withMandatoryBackupAndTransaction(userId, async (tx) => {
    await tx.execute('DELETE FROM expenses')
  })
}

export async function resetAssistantChat(userId: number): Promise<DataResetResult> {
  return withMandatoryBackupAndTransaction(userId, async (tx) => {
    await tx.execute('DELETE FROM assistant_chat_messages')
  })
}

export async function factoryReset(userId: number): Promise<DataResetResult> {
  return withMandatoryBackupAndTransaction(userId, async (tx) => {
    const walkInId = await getWalkInCustomerId(getDb())

    // مبيعات ومرتجعاتها
    await tx.execute('DELETE FROM sales_return_items')
    await tx.execute('DELETE FROM sales_returns')
    await tx.execute('DELETE FROM sales_items')
    await tx.execute('DELETE FROM sales_invoices')

    // عروض أسعار
    await tx.execute('DELETE FROM quotation_items')
    await tx.execute('DELETE FROM quotations')

    // موردين ومدفوعاتهم
    await tx.execute('UPDATE purchase_invoices SET vendor_id = NULL')
    await tx.execute('DELETE FROM party_settlements')
    await tx.execute("DELETE FROM payments")
    await tx.execute('DELETE FROM vendors')

    // عملاء
    await tx.execute({ sql: 'UPDATE sales_invoices SET customer_id = ? WHERE customer_id != ?', args: [walkInId, walkInId] })
    await tx.execute('DELETE FROM customers WHERE is_walk_in = 0')

    // مناديب
    await tx.execute('UPDATE sales_invoices SET sales_rep_id = NULL WHERE sales_rep_id IS NOT NULL')
    await tx.execute('DELETE FROM sales_reps')

    // منتجات ومخزون
    await tx.execute('DELETE FROM product_prices')
    await tx.execute('DELETE FROM stock')
    await tx.execute('DELETE FROM stock_movements')
    await tx.execute('DELETE FROM products')
    await tx.execute('DELETE FROM categories')

    // سجل دردشة المساعد الذكي
    await tx.execute('DELETE FROM assistant_chat_messages')

    // مصروفات وموظفين
    await tx.execute('DELETE FROM expenses')
    await tx.execute('DELETE FROM employee_transactions')
    await tx.execute('DELETE FROM employee_pay_periods')
    await tx.execute('DELETE FROM employees')

    // جلسات الخزنة (بعد ما اتشالت كل الفواتير المرتبطة بيها)
    await tx.execute('DELETE FROM cash_sessions')

    // تصفير الأرصدة المتبقية (زي walk-in لو كان عليه رصيد لأي سبب)
    await tx.execute('UPDATE customers SET balance = 0, loyalty_points = 0')
  })
}
