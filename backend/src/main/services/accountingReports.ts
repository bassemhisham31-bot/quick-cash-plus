import { getDb } from '../db'
import { branchesEnabled, branchFilter, currentBranchId } from './branchScope'
import { listTreasuries, getTreasuryStatement } from './treasuries'
import { defaultLedgerAccountCode } from './accountsChart'
import { salePayShareSql } from './salePayments'
import { accountLedgerReport, balanceSheetReport, incomeStatementReport, journalReport, trialBalanceReport } from './ledger'
import type { ReportResult } from '../../shared/types'

export type AccountingReportType =
  | 'daily_sales'
  | 'sales_returns'
  | 'purchase_returns'
  | 'discounts'
  | 'expenses_by_category'
  | 'vouchers'
  | 'treasuries_summary'
  | 'customers_aging'
  | 'vendors_aging'
  | 'inventory_valuation'
  | 'customer_balances'
  | 'vendor_balances'
  | 'trial_balance'
  | 'income_statement'
  | 'balance_sheet'
  | 'journal'
  | 'account_ledger'

export const ACCOUNTING_REPORTS: { type: AccountingReportType; icon: string; label: string; needsWarehouse?: boolean; noDates?: boolean; needsAccount?: boolean }[] = [
  { type: 'trial_balance', icon: '⚖️', label: 'ميزان المراجعة' },
  { type: 'income_statement', icon: '📈', label: 'قائمة الدخل' },
  { type: 'balance_sheet', icon: '🏛️', label: 'الميزانية العمومية (حتى تاريخ)' },
  { type: 'journal', icon: '📓', label: 'دفتر اليومية (القيود)' },
  { type: 'account_ledger', icon: '📖', label: 'الأستاذ (حساب الأستاذ)', needsAccount: true },
  { type: 'daily_sales', icon: '📅', label: 'يومية المبيعات (بالأيام وطرق الدفع)' },
  { type: 'sales_returns', icon: '↩️', label: 'مرتجعات المبيعات' },
  { type: 'purchase_returns', icon: '🔙', label: 'مرتجعات المشتريات' },
  { type: 'discounts', icon: '🏷️', label: 'تقرير الخصومات (فاتورة + أصناف)' },
  { type: 'expenses_by_category', icon: '💸', label: 'المصروفات حسب التصنيف' },
  { type: 'vouchers', icon: '🧾', label: 'سندات القبض والصرف' },
  { type: 'treasuries_summary', icon: '🏦', label: 'ملخص الخزائن (أول المدة/وارد/منصرف/الرصيد)' },
  { type: 'customers_aging', icon: '⏳', label: 'أعمار ديون العملاء', noDates: true },
  { type: 'vendors_aging', icon: '⏳', label: 'أعمار ديون الموردين', noDates: true },
  { type: 'customer_balances', icon: '👥', label: 'أرصدة العملاء', noDates: true },
  { type: 'vendor_balances', icon: '🚚', label: 'أرصدة الموردين', noDates: true },
  { type: 'inventory_valuation', icon: '📦', label: 'تقييم المخزون بالتكلفة وسعر البيع', needsWarehouse: true, noDates: true }
]

export interface AccountingReportFilter {
  from?: string
  to?: string
  warehouseId?: number | null
  accountCode?: string
}

const n = (v: unknown): number => Math.round((Number(v) || 0) * 100) / 100

/** وضع "كل الفروع": التقارير التفصيلية بتضيف عمود الفرع */
const withBranchColumn = (): boolean => branchesEnabled() && currentBranchId() == null
const BRANCH_COLUMN = { key: 'branch', label: 'الفرع' }

/** شرط التاريخ + (لو اتمرّر branchCol والفروع مفعّلة وفيه فرع محدد) شرط الفرع — بيدفع الـargs بنفس ترتيب الـplaceholders */
function dateCond(col: string, f: AccountingReportFilter, args: unknown[], branchCol?: string): string {
  const parts: string[] = []
  if (branchCol) {
    const bf = branchFilter(branchCol)
    if (bf.args.length) {
      parts.push(bf.sql)
      args.push(...bf.args)
    }
  }
  if (f.from) {
    parts.push(`date(${col}) >= ?`)
    args.push(f.from)
  }
  if (f.to) {
    parts.push(`date(${col}) <= ?`)
    args.push(f.to)
  }
  return parts.length ? parts.join(' AND ') : '1 = 1'
}

function range(f: AccountingReportFilter): string {
  return `${f.from ?? 'البداية'} → ${f.to ?? 'اليوم'}`
}

function sumTotals(rows: Record<string, string | number>[], keys: string[]): Record<string, number> {
  const t: Record<string, number> = {}
  for (const k of keys) t[k] = n(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0))
  return t
}

const cur = (key: string, label: string): { key: string; label: string; align: 'end'; format: 'currency' } => ({ key, label, align: 'end', format: 'currency' })

export async function runAccountingReport(type: AccountingReportType, f: AccountingReportFilter): Promise<ReportResult> {
  const db = getDb()
  const args: unknown[] = []

  switch (type) {
    case 'trial_balance':
      return trialBalanceReport(f.from, f.to)
    case 'income_statement':
      return incomeStatementReport(f.from, f.to)
    case 'balance_sheet':
      return balanceSheetReport(f.to)
    case 'journal':
      return journalReport(f.from, f.to)
    case 'account_ledger':
      return accountLedgerReport(f.accountCode ?? (await defaultLedgerAccountCode()), f.from, f.to)
    case 'daily_sales': {
      const rs = await db.execute({
        sql: `SELECT date(i.created_at) AS day, COUNT(*) AS cnt,
                     SUM(i.subtotal) AS subtotal, SUM(i.discount_total) AS discount, SUM(i.tax_total) AS tax,
                     COALESCE(SUM((SELECT SUM(si.discount) FROM sales_items si WHERE si.invoice_id = i.id)), 0) AS itemsDiscount,
                     SUM(i.delivery_fee) AS delivery, SUM(i.service_charge_total) AS service, SUM(i.total) AS total,
                     SUM(${salePayShareSql('i', ['cash'])}) AS cash,
                     SUM(${salePayShareSql('i', ['card'])}) AS card,
                     SUM(${salePayShareSql('i', ['wallet', 'vodafone_cash', 'instapay'])}) AS wallet,
                     SUM(${salePayShareSql('i', ['credit'])}) AS credit
              FROM sales_invoices i WHERE i.deleted_at IS NULL AND ${dateCond('i.created_at', f, args, 'i.branch_id')}
              GROUP BY date(i.created_at) ORDER BY day`,
        args: args as any
      })
      const rows = (rs.rows as any[]).map((r) => ({
        day: r.day,
        cnt: Number(r.cnt),
        subtotal: n(Number(r.subtotal) + Number(r.itemsDiscount)),
        itemsDiscount: n(r.itemsDiscount),
        discount: n(r.discount),
        tax: n(r.tax),
        delivery: n(r.delivery),
        service: n(r.service),
        total: n(r.total),
        cash: n(r.cash),
        card: n(r.card),
        wallet: n(r.wallet),
        credit: n(r.credit)
      }))
      return {
        title: `يومية المبيعات ${range(f)}`,
        columns: [
          { key: 'day', label: 'اليوم' },
          { key: 'cnt', label: 'عدد الفواتير', align: 'end', format: 'number' },
          cur('subtotal', 'الإجمالي قبل الخصم'),
          cur('itemsDiscount', 'خصم الأصناف'),
          cur('discount', 'خصم الفاتورة'),
          cur('tax', 'الضريبة'),
          cur('delivery', 'التوصيل'),
          cur('service', 'الخدمة'),
          cur('total', 'صافي المبيعات'),
          cur('cash', 'نقدي'),
          cur('card', 'بنكي'),
          cur('wallet', 'محافظ'),
          cur('credit', 'آجل')
        ],
        rows,
        totals: sumTotals(rows, ['cnt', 'subtotal', 'itemsDiscount', 'discount', 'tax', 'delivery', 'service', 'total', 'cash', 'card', 'wallet', 'credit'])
      }
    }

    case 'sales_returns': {
      const rs = await db.execute({
        sql: `SELECT r.id, r.created_at, r.type, r.amount, i.number, c.name AS customerName, i.payment_method, u.full_name AS userName, COALESCE(br.name, '') AS branchName
              FROM sales_returns r JOIN sales_invoices i ON i.id = r.invoice_id JOIN customers c ON c.id = i.customer_id
              LEFT JOIN branches br ON br.id = r.branch_id
              LEFT JOIN users u ON u.id = r.user_id WHERE ${dateCond('r.created_at', f, args, 'r.branch_id')} ORDER BY r.id`,
        args: args as any
      })
      const rows = (rs.rows as any[]).map((r) => ({
        branch: r.branchName,
        date: r.created_at,
        number: r.number,
        customer: r.customerName,
        kind: r.type === 'full' ? 'كلي' : 'جزئي',
        method: r.payment_method,
        user: r.userName ?? '',
        amount: n(r.amount)
      }))
      return {
        title: `مرتجعات المبيعات ${range(f)}`,
        columns: [
          ...(withBranchColumn() ? [BRANCH_COLUMN] : []),
          { key: 'date', label: 'التاريخ' },
          { key: 'number', label: 'رقم الفاتورة' },
          { key: 'customer', label: 'العميل' },
          { key: 'kind', label: 'النوع' },
          { key: 'method', label: 'طريقة دفع الفاتورة' },
          { key: 'user', label: 'المستخدم' },
          cur('amount', 'قيمة المرتجع')
        ],
        rows,
        totals: sumTotals(rows, ['amount'])
      }
    }

    case 'purchase_returns': {
      const rs = await db.execute({
        sql: `SELECT r.id, r.created_at, r.type, r.amount, pi.number, v.name AS vendorName, u.full_name AS userName, COALESCE(br.name, '') AS branchName
              FROM purchase_returns r JOIN purchase_invoices pi ON pi.id = r.purchase_invoice_id LEFT JOIN vendors v ON v.id = pi.vendor_id
              LEFT JOIN branches br ON br.id = r.branch_id
              LEFT JOIN users u ON u.id = r.user_id WHERE ${dateCond('r.created_at', f, args, 'r.branch_id')} ORDER BY r.id`,
        args: args as any
      })
      const rows = (rs.rows as any[]).map((r) => ({
        branch: r.branchName,
        date: r.created_at,
        number: r.number,
        vendor: r.vendorName ?? '',
        kind: r.type === 'full' ? 'كلي' : 'جزئي',
        user: r.userName ?? '',
        amount: n(r.amount)
      }))
      return {
        title: `مرتجعات المشتريات ${range(f)}`,
        columns: [
          ...(withBranchColumn() ? [BRANCH_COLUMN] : []),
          { key: 'date', label: 'التاريخ' },
          { key: 'number', label: 'رقم فاتورة الشراء' },
          { key: 'vendor', label: 'المورد' },
          { key: 'kind', label: 'النوع' },
          { key: 'user', label: 'المستخدم' },
          cur('amount', 'قيمة المرتجع')
        ],
        rows,
        totals: sumTotals(rows, ['amount'])
      }
    }

    case 'discounts': {
      const rs = await db.execute({
        sql: `SELECT i.number, i.created_at, c.name AS customerName, u.full_name AS cashier,
                     i.subtotal, i.discount_total AS invoiceDiscount,
                     COALESCE((SELECT SUM(si.discount) FROM sales_items si WHERE si.invoice_id = i.id), 0) AS itemsDiscount, i.total,
                     COALESCE(br.name, '') AS branchName
              FROM sales_invoices i LEFT JOIN branches br ON br.id = i.branch_id JOIN customers c ON c.id = i.customer_id JOIN users u ON u.id = i.cashier_id
              WHERE i.deleted_at IS NULL AND ${dateCond('i.created_at', f, args, 'i.branch_id')}
                AND (i.discount_total > 0 OR EXISTS (SELECT 1 FROM sales_items si WHERE si.invoice_id = i.id AND si.discount > 0))
              ORDER BY i.id`,
        args: args as any
      })
      const rows = (rs.rows as any[]).map((r) => ({
        branch: r.branchName,
        date: r.created_at,
        number: r.number,
        cashier: r.cashier,
        customer: r.customerName,
        itemsDiscount: n(r.itemsDiscount),
        invoiceDiscount: n(r.invoiceDiscount),
        totalDiscount: n(Number(r.itemsDiscount) + Number(r.invoiceDiscount)),
        total: n(r.total)
      }))
      return {
        title: `تقرير الخصومات ${range(f)}`,
        columns: [
          ...(withBranchColumn() ? [BRANCH_COLUMN] : []),
          { key: 'date', label: 'التاريخ' },
          { key: 'number', label: 'رقم الفاتورة' },
          { key: 'cashier', label: 'الكاشير' },
          { key: 'customer', label: 'العميل' },
          cur('itemsDiscount', 'خصم الأصناف'),
          cur('invoiceDiscount', 'خصم الفاتورة'),
          cur('totalDiscount', 'إجمالي الخصم'),
          cur('total', 'صافي الفاتورة')
        ],
        rows,
        totals: sumTotals(rows, ['itemsDiscount', 'invoiceDiscount', 'totalDiscount', 'total'])
      }
    }

    case 'expenses_by_category': {
      const rs = await db.execute({
        sql: `SELECT COALESCE(ec.name, 'بدون تصنيف') AS category, COUNT(*) AS cnt, SUM(e.amount) AS total,
                     SUM(CASE WHEN e.method = 'cash' THEN e.amount ELSE 0 END) AS cash
              FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
              WHERE e.deleted_at IS NULL AND ${dateCond('e.created_at', f, args, 'e.branch_id')}
              GROUP BY ec.id ORDER BY total DESC`,
        args: args as any
      })
      const rows = (rs.rows as any[]).map((r) => ({ category: r.category, cnt: Number(r.cnt), cash: n(r.cash), other: n(Number(r.total) - Number(r.cash)), total: n(r.total) }))
      return {
        title: `المصروفات حسب التصنيف ${range(f)}`,
        columns: [{ key: 'category', label: 'التصنيف' }, { key: 'cnt', label: 'العدد', align: 'end', format: 'number' }, cur('cash', 'نقدي'), cur('other', 'بنكي/محافظ'), cur('total', 'الإجمالي')],
        rows,
        totals: sumTotals(rows, ['cnt', 'cash', 'other', 'total'])
      }
    }

    case 'vouchers': {
      const rs = await db.execute({
        sql: `SELECT v.id, v.type, v.created_at, v.amount, v.party_name, v.note, t.name AS treasuryName, u.full_name AS userName, COALESCE(br.name, '') AS branchName
              FROM vouchers v LEFT JOIN branches br ON br.id = v.branch_id JOIN treasuries t ON t.id = v.treasury_id LEFT JOIN users u ON u.id = v.user_id
              WHERE v.deleted_at IS NULL AND ${dateCond('v.created_at', f, args, 'v.branch_id')} ORDER BY v.id`,
        args: args as any
      })
      const rows = (rs.rows as any[]).map((r) => ({
        branch: r.branchName,
        number: `${r.type === 'receipt' ? 'RV' : 'PV'}-${String(r.id).padStart(6, '0')}`,
        date: r.created_at,
        kind: r.type === 'receipt' ? 'قبض' : 'صرف',
        treasury: r.treasuryName,
        party: r.party_name ?? '',
        note: r.note ?? '',
        user: r.userName ?? '',
        receipt: r.type === 'receipt' ? n(r.amount) : 0,
        payment: r.type === 'payment' ? n(r.amount) : 0
      }))
      return {
        title: `سندات القبض والصرف ${range(f)}`,
        columns: [
          ...(withBranchColumn() ? [BRANCH_COLUMN] : []),
          { key: 'number', label: 'رقم السند' },
          { key: 'date', label: 'التاريخ' },
          { key: 'kind', label: 'النوع' },
          { key: 'treasury', label: 'الخزينة' },
          { key: 'party', label: 'الطرف' },
          { key: 'note', label: 'البيان' },
          { key: 'user', label: 'المستخدم' },
          cur('receipt', 'قبض'),
          cur('payment', 'صرف')
        ],
        rows,
        totals: sumTotals(rows, ['receipt', 'payment'])
      }
    }

    case 'treasuries_summary': {
      const treasuries = await listTreasuries()
      const rows: Record<string, string | number>[] = []
      for (const t of treasuries) {
        const st = await getTreasuryStatement(t.id, f.from, f.to)
        const opening = Number(st.rows[0]?.balance ?? 0)
        rows.push({ treasury: t.name, opening, inAmount: n(st.totals?.inAmount), outAmount: n(st.totals?.outAmount), closing: n(st.totals?.balance) })
      }
      return {
        title: `ملخص الخزائن ${range(f)}`,
        columns: [{ key: 'treasury', label: 'الخزينة' }, cur('opening', 'رصيد أول المدة'), cur('inAmount', 'وارد'), cur('outAmount', 'منصرف'), cur('closing', 'رصيد آخر المدة')],
        rows,
        totals: sumTotals(rows, ['opening', 'inAmount', 'outAmount', 'closing'])
      }
    }

    case 'customers_aging':
    case 'vendors_aging': {
      const isCustomer = type === 'customers_aging'
      const parties = await db.execute(
        isCustomer
          ? 'SELECT id, name, balance FROM customers WHERE deleted_at IS NULL AND is_walk_in = 0 AND balance > 0.005 ORDER BY name'
          : 'SELECT id, name, balance FROM vendors WHERE deleted_at IS NULL AND balance > 0.005 ORDER BY name'
      )
      const rows: Record<string, string | number>[] = []
      const today = Date.now()
      for (const p of parties.rows as any[]) {
        // الرصيد المستحق بيتوزّع على أحدث الفواتير الآجلة رجوعًا (الأحدث هو اللي لسه ما اتسددش)
        const inv = await db.execute({
          sql: isCustomer
            ? `SELECT created_at, total - paid AS due FROM sales_invoices WHERE customer_id = ? AND deleted_at IS NULL AND payment_method IN ('credit', 'mixed') ORDER BY created_at DESC`
            : `SELECT created_at, total - paid AS due FROM purchase_invoices WHERE vendor_id = ? ORDER BY created_at DESC`,
          args: [p.id]
        })
        let remaining = Number(p.balance)
        const buckets = [0, 0, 0, 0]
        for (const r of inv.rows as any[]) {
          if (remaining <= 0) break
          const due = Math.max(0, Number(r.due))
          if (due <= 0) continue
          const take = Math.min(due, remaining)
          remaining -= take
          const days = Math.floor((today - new Date(String(r.created_at).replace(' ', 'T') + 'Z').getTime()) / 86400000)
          buckets[days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3] += take
        }
        buckets[3] += remaining // رصيد افتتاحي/غير مرتبط بفواتير = الأقدم
        rows.push({ name: p.name, b0: n(buckets[0]), b1: n(buckets[1]), b2: n(buckets[2]), b3: n(buckets[3]), total: n(p.balance) })
      }
      return {
        title: isCustomer ? 'أعمار ديون العملاء' : 'أعمار ديون الموردين',
        columns: [{ key: 'name', label: isCustomer ? 'العميل' : 'المورد' }, cur('b0', '0 - 30 يوم'), cur('b1', '31 - 60 يوم'), cur('b2', '61 - 90 يوم'), cur('b3', 'أكتر من 90 يوم'), cur('total', 'إجمالي المستحق')],
        rows,
        totals: sumTotals(rows, ['b0', 'b1', 'b2', 'b3', 'total'])
      }
    }

    case 'customer_balances':
    case 'vendor_balances': {
      const isCustomer = type === 'customer_balances'
      const rs = await db.execute(
        isCustomer
          ? 'SELECT name, phone, balance FROM customers WHERE deleted_at IS NULL AND is_walk_in = 0 AND ABS(balance) > 0.005 ORDER BY balance DESC'
          : 'SELECT name, phone, balance FROM vendors WHERE deleted_at IS NULL AND ABS(balance) > 0.005 ORDER BY balance DESC'
      )
      const rows = (rs.rows as any[]).map((r) => ({
        name: r.name,
        phone: r.phone ?? '',
        debit: n(isCustomer ? Math.max(0, Number(r.balance)) : 0),
        credit: n(isCustomer ? Math.max(0, -Number(r.balance)) : Math.max(0, Number(r.balance)))
      }))
      return {
        title: isCustomer ? 'أرصدة العملاء' : 'أرصدة الموردين',
        columns: [
          { key: 'name', label: isCustomer ? 'العميل' : 'المورد' },
          { key: 'phone', label: 'الهاتف' },
          cur('debit', isCustomer ? 'مدين (عليه)' : 'مدين (لنا عنده)'),
          cur('credit', isCustomer ? 'دائن (له)' : 'دائن (له علينا)')
        ],
        rows,
        totals: sumTotals(rows, ['debit', 'credit'])
      }
    }

    case 'inventory_valuation': {
      const warehouse = f.warehouseId ?? null
      const rs = await db.execute({
        sql: `SELECT p.name, p.barcode, w.name AS warehouseName, s.quantity AS qty, p.cost_price AS cost, p.retail_price AS price
              FROM stock s JOIN products p ON p.id = s.product_id JOIN warehouses w ON w.id = s.warehouse_id
              WHERE p.deleted_at IS NULL AND ABS(s.quantity) > 0.0001 ${warehouse ? 'AND s.warehouse_id = ?' : ''}
              ORDER BY w.name, p.name`,
        args: warehouse ? [warehouse] : []
      })
      const rows = (rs.rows as any[]).map((r) => ({
        warehouse: r.warehouseName,
        name: r.name,
        barcode: r.barcode ?? '',
        qty: Number(r.qty),
        cost: n(r.cost),
        costValue: n(Number(r.qty) * Number(r.cost)),
        sellValue: n(Number(r.qty) * Number(r.price))
      }))
      return {
        title: 'تقييم المخزون',
        columns: [
          { key: 'warehouse', label: 'المخزن' },
          { key: 'name', label: 'الصنف' },
          { key: 'barcode', label: 'الباركود' },
          { key: 'qty', label: 'الكمية', align: 'end', format: 'number' },
          cur('cost', 'تكلفة الوحدة'),
          cur('costValue', 'قيمة التكلفة'),
          cur('sellValue', 'قيمة البيع')
        ],
        rows,
        totals: sumTotals(rows, ['qty', 'costValue', 'sellValue'])
      }
    }
  }
}
