/**
 * ميتاداتا "مين نفّذ العملية" — بيضيفها preload تلقائيًا كآخر argument لأي نداء على قناة
 * موجودة في MUTATING_CHANNELS، عشان main يقدر يسجّلها في سجل نشاط المستخدمين من غير
 * ما يحتاج كل نداء API في preload يبعتها يدويًا. بتتحط كآخر عنصر في الـargs عشان
 * الـhandlers الحالية (كلها بمعاملات مسمّاة صريحة) تتجاهلها تلقائيًا من غير ما تتأثر.
 */
export const ACTOR_META_KEY = '__qcpActor'

export interface ActorMeta {
  [ACTOR_META_KEY]: true
  userId: number | null
  username: string | null
}

export function isActorMeta(value: unknown): value is ActorMeta {
  return !!value && typeof value === 'object' && (value as any)[ACTOR_META_KEY] === true
}
