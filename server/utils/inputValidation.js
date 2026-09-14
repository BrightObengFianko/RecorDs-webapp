function isIsoDate(value) {
    const text = String(value || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return false;
    }

    const date = new Date(`${text}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === text
    );
}

function boundedText(value, maxLength) {
    const text = String(value ?? "").trim();
    return text.length <= maxLength ? text : null;
}

module.exports = {
    boundedText,
    isIsoDate
};
