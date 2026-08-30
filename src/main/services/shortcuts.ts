import { getDb } from '../db'
import type { KeyboardShortcut, KeyboardShortcutInput, KeyboardShortcutPatch } from '../../shared/types'

function mapRow(r: any): KeyboardShortcut {
  return {
    id: Number(r.id),
    actionKey: r.action_key,
    label: r.label,
    enabled: !!r.enabled,
    useShift: !!r.use_shift,
    useAlt: !!r.use_alt,
    useCtrl: !!r.use_ctrl,
    key: r.key,
    isCustom: !!r.is_custom
  }
}

export async function listShortcuts(): Promise<KeyboardShortcut[]> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM keyboard_shortcuts ORDER BY is_custom, id')
  return rs.rows.map(mapRow)
}

export async function updateShortcut(id: number, patch: KeyboardShortcutPatch): Promise<KeyboardShortcut> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE keyboard_shortcuts
          SET enabled = ?, use_shift = ?, use_alt = ?, use_ctrl = ?, key = ?
          WHERE id = ?`,
    args: [patch.enabled ? 1 : 0, patch.useShift ? 1 : 0, patch.useAlt ? 1 : 0, patch.useCtrl ? 1 : 0, patch.key, id]
  })
  const rs = await db.execute({ sql: 'SELECT * FROM keyboard_shortcuts WHERE id = ?', args: [id] })
  if (!rs.rows[0]) throw new Error('الاختصار غير موجود')
  return mapRow(rs.rows[0])
}

export async function createCustomShortcut(input: KeyboardShortcutInput): Promise<KeyboardShortcut> {
  const db = getDb()
  const actionKey = input.actionKey.startsWith('nav.') ? input.actionKey : `nav.${input.actionKey}`
  const info = await db.execute({
    sql: `INSERT INTO keyboard_shortcuts (action_key, label, enabled, use_shift, use_alt, use_ctrl, key, is_custom)
          VALUES (?, ?, 1, ?, ?, ?, ?, 1)`,
    args: [
      `${actionKey}:${Date.now()}`,
      input.label.trim() || actionKey,
      input.useShift ? 1 : 0,
      input.useAlt ? 1 : 0,
      input.useCtrl ? 1 : 0,
      input.key
    ]
  })
  const rs = await db.execute({ sql: 'SELECT * FROM keyboard_shortcuts WHERE id = ?', args: [info.lastInsertRowid] })
  return mapRow(rs.rows[0])
}

export async function deleteShortcut(id: number): Promise<void> {
  const db = getDb()
  const rs = await db.execute({ sql: 'SELECT is_custom FROM keyboard_shortcuts WHERE id = ?', args: [id] })
  const row = rs.rows[0] as any
  if (!row) throw new Error('الاختصار غير موجود')
  if (!row.is_custom) throw new Error('الاختصارات الأساسية لا يمكن حذفها، عطّلها فقط')
  await db.execute({ sql: 'DELETE FROM keyboard_shortcuts WHERE id = ?', args: [id] })
}
