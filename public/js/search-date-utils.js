(function (global) {
    function digitsOnly(value) {
        return String(value || "").replace(/\D/g, "").slice(0, 8);
    }

    function format(value) {
        const digits = digitsOnly(value);

        if (digits.length <= 2) return digits;
        if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
        return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
    }

    function caretPosition(value, caret) {
        const source = String(value || "");
        const digitCountBeforeCaret = source
            .slice(0, Math.max(0, Number(caret) || 0))
            .replace(/\D/g, "")
            .length;

        const dashCount =
            (digitCountBeforeCaret > 2 ? 1 : 0) +
            (digitCountBeforeCaret > 4 ? 1 : 0);

        return Math.min(digitCountBeforeCaret + dashCount, format(source).length);
    }

    function toIso(value) {
        const match = String(value || "").trim().match(/^([0-9]{2})-([0-9]{2})-([0-9]{4})$/);

        if (!match) return null;

        const [, day, month, year] = match;
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

        if (
            date.getUTCFullYear() !== Number(year) ||
            date.getUTCMonth() !== Number(month) - 1 ||
            date.getUTCDate() !== Number(day)
        ) {
            return null;
        }

        return `${year}-${month}-${day}`;
    }

    global.RecordSearchDate = Object.freeze({
        digitsOnly,
        format,
        caretPosition,
        toIso
    });
})(window);
