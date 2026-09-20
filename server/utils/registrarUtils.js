const REGISTRAR_ALIASES = Object.freeze({
    BOSCO: "NEW MARKET",
    POLY: "POLYCLINIC",
    SAMMY: "POLYCLINIC"
});

const CANONICAL_REGISTRARS = Object.freeze({
    ADMIN: "ADMIN",
    OFFICE: "OFFICE",
    "NEW OFFICE": "NEW OFFICE",
    "NEW MARKET": "NEW MARKET",
    POLYCLINIC: "POLYCLINIC"
});

function normalizeRegistrar(value) {
    const normalized = String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();

    return REGISTRAR_ALIASES[normalized] ||
        CANONICAL_REGISTRARS[normalized] ||
        String(value || "").trim().replace(/\s+/g, " ");
}

function normalizedRegistrarSql(alias = "r") {
    const source = `UPPER(BTRIM(COALESCE(${alias}.registrar, '')))`;
    const original = `BTRIM(COALESCE(${alias}.registrar, ''))`;

    return `CASE ${source}
        WHEN 'BOSCO' THEN 'NEW MARKET'
        WHEN 'POLY' THEN 'POLYCLINIC'
        WHEN 'SAMMY' THEN 'POLYCLINIC'
        WHEN 'ADMIN' THEN 'ADMIN'
        WHEN 'OFFICE' THEN 'OFFICE'
        WHEN 'NEW OFFICE' THEN 'NEW OFFICE'
        WHEN 'NEW MARKET' THEN 'NEW MARKET'
        WHEN 'POLYCLINIC' THEN 'POLYCLINIC'
        ELSE ${original}
    END`;
}

function normalizeRecordRows(rows) {
    return rows.map(row => ({
        ...row,
        registrar: normalizeRegistrar(row.registrar)
    }));
}

module.exports = {
    normalizeRegistrar,
    normalizedRegistrarSql,
    normalizeRecordRows,
    REGISTRAR_ALIASES
};
