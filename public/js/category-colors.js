(function () {
    const palette = [
        "#6b5bff",
        "#ea4c89",
        "#ffb347",
        "#35b56f",
        "#4da3ff",
        "#8f97a8"
    ];

    const categoryIndexes = new Map([
        ["s-hot", 0],
        ["express", 1],
        ["standard", 2],
        ["m-birth", 3],
        ["search", 4],
        ["correction", 5],
        ["death", 1],
        ["deletion", 5],
        ["passport", 4]
    ]);

    function getColor(category, fallbackIndex = 0) {
        const normalized = String(category || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-");
        const mappedIndex = categoryIndexes.get(normalized);
        const index = mappedIndex === undefined
            ? Number(fallbackIndex) || 0
            : mappedIndex;

        return palette[index % palette.length];
    }

    window.RecordCategoryColors = { getColor };
})();
