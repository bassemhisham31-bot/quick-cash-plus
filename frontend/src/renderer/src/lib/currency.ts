import { useAppStore } from '../store/appStore'

const numberFormat = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 })

/** بيرجع الرمز الحالي من الإعدادات (بيتحدّث لحظيًا مع أي تغيير) بدون الحاجة لاستخدام hook. */
export function formatCurrency(value: number): string {
  const symbol = useAppStore.getState().currencySymbol
  return `${numberFormat.format(value)} ${symbol}`
}
