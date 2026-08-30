// المرحلة 031 — مورد افتراضي للصنف عند تسجيله + قائمة الميزات المفعّلة داخل كود الترخيص

export const migration031ProductVendorLicenseFeatures = `
ALTER TABLE products ADD COLUMN vendor_id INTEGER REFERENCES vendors(id);
ALTER TABLE license ADD COLUMN features TEXT;
`
