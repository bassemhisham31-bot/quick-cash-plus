import bwipjs from 'bwip-js'
import type { BarcodeLabelType, DeviceSettings, WeightBarcodeResult } from '../../shared/types'

/** حساب رقم التحقق (Check Digit) لباركود EAN-13 */
function ean13CheckDigit(twelveDigits: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const digit = Number(twelveDigits[i])
    sum += i % 2 === 0 ? digit : digit * 3
  }
  return (10 - (sum % 10)) % 10
}

/** حساب رقم التحقق لباركود EAN-8 */
function ean8CheckDigit(sevenDigits: string): number {
  let sum = 0
  for (let i = 0; i < 7; i++) {
    const digit = Number(sevenDigits[i])
    sum += i % 2 === 0 ? digit * 3 : digit
  }
  return (10 - (sum % 10)) % 10
}

function isValidEan13(value: string): boolean {
  return /^\d{13}$/.test(value) && ean13CheckDigit(value.slice(0, 12)) === Number(value[12])
}

function isValidEan8(value: string): boolean {
  return /^\d{8}$/.test(value) && ean8CheckDigit(value.slice(0, 7)) === Number(value[7])
}

function resolveBcid(type: BarcodeLabelType, value: string): string {
  if (type === 'QR') return 'qrcode'
  if (type === 'EAN8') return isValidEan8(value) ? 'ean8' : 'code128'
  if (type === 'EAN13') return isValidEan13(value) ? 'ean13' : 'code128'
  if (type === 'CODE128') return 'code128'
  // auto: EAN فقط لو الباركود مستوفي رقم التحقق الصحيح، وإلا CODE128 كخيار آمن يقبل أي نص
  if (isValidEan13(value)) return 'ean13'
  if (isValidEan8(value)) return 'ean8'
  return 'code128'
}

export async function generateBarcodeDataUrl(value: string, type: BarcodeLabelType = 'auto'): Promise<string> {
  const bcid = resolveBcid(type, value)
  const buffer = await bwipjs.toBuffer({
    bcid,
    text: value,
    scale: 3,
    height: bcid === 'qrcode' ? 20 : 10,
    includetext: bcid !== 'qrcode',
    textxalign: 'center'
  })
  return `data:image/png;base64,${buffer.toString('base64')}`
}

/**
 * فك تشفير باركود الميزان: {بادئة}{كود الصنف}{الوزن بالجرام}{رقم تحقق} = 13 رقم إجمالاً.
 * مثال بادئة "20" وكود صنف 5 أرقام: 20 12345 00250 X (250 جرام).
 */
export function decodeWeightBarcode(barcode: string, settings: DeviceSettings): WeightBarcodeResult {
  if (!settings.scaleBarcodeEnabled) return { matched: false }
  if (!/^\d{13}$/.test(barcode)) return { matched: false }
  if (!barcode.startsWith(settings.scalePrefix)) return { matched: false }

  const prefixLen = settings.scalePrefix.length
  const codeLen = settings.scaleCodeLength
  const weightLen = 13 - prefixLen - codeLen - 1
  if (weightLen <= 0) return { matched: false }

  const body = barcode.slice(0, 12)
  const checkDigit = Number(barcode[12])
  if (ean13CheckDigit(body) !== checkDigit) return { matched: false }

  const productCode = barcode.slice(prefixLen, prefixLen + codeLen)
  const weightPart = barcode.slice(prefixLen + codeLen, prefixLen + codeLen + weightLen)

  return { matched: true, productCode, weightGrams: Number(weightPart) }
}

/** بناء باركود ميزان صحيح — يُستخدم في توليد باركودات تجريبية وفي الاختبارات. */
export function encodeWeightBarcode(productCode: string, weightGrams: number, settings: DeviceSettings): string {
  const prefixLen = settings.scalePrefix.length
  const codeLen = settings.scaleCodeLength
  const weightLen = 13 - prefixLen - codeLen - 1

  const paddedCode = productCode.padStart(codeLen, '0').slice(0, codeLen)
  const paddedWeight = String(Math.round(weightGrams)).padStart(weightLen, '0').slice(0, weightLen)
  const body = `${settings.scalePrefix}${paddedCode}${paddedWeight}`
  const checkDigit = ean13CheckDigit(body)
  return `${body}${checkDigit}`
}
