import type { PrintResult } from '../../shared/types'

/**
 * الطباعة الفعلية (حرارية/رسمية) في نسخة الأوفلاين كانت بتتم عبر Electron مباشرة
 * (webContents.print + قائمة طابعات النظام)، وده مش متاح على سيرفر ويب.
 * الحل المخطط له (خطة التحويل لأونلاين، مرحلة 4): تركيب QZ Tray على جهاز كل فرع فيه طابعة،
 * وصفحة الويب تبعتله أمر الطباعة. لسه غير مبني في هذه المرحلة (استخراج الباك إند فقط).
 */
export async function printKitchenTicket(
  _meta: unknown,
  _printerName: string | null,
  _items: { name: string; qty: number; note: string | null }[]
): Promise<PrintResult> {
  return { ok: false, error: 'الطباعة غير مدعومة بعد في نسخة الويب — تحتاج إعداد QZ Tray (مرحلة لاحقة من خطة التحويل)' }
}
