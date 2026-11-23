/**
 * Middleware factory for validating request body, query, or params using Joi schema
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const dataToValidate = req[source];
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      error.isJoi = true;
      return next(error);
    }

    req[source] = value;
    next();
  };
}

module.exports = {
  validate
};
