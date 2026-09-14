function validateIdParam(req, res, next) {
    const id = String(req.params.id || "").trim();

    if (!/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({
            success: false,
            message: "Invalid resource identifier."
        });
    }

    req.params.id = id;
    return next();
}

module.exports = validateIdParam;
