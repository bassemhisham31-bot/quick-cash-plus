// المرحلة 063 — التجربة المجانية 30 يوم (كانت 15) + last_seen_at لكشف الرجوع بتاريخ الجهاز للخلف

export const migration063LicenseTrial30 = `
UPDATE license SET trial_days = 30 WHERE status = 'trial';
ALTER TABLE license ADD COLUMN last_seen_at TEXT;
`
