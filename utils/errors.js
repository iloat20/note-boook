class AppError extends Error {
  constructor(message, code = 'APP_ERROR') {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

class ValidationError extends AppError {
  constructor(model, msg) {
    super('[' + model + '] ' + msg, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
    this.model = model
  }
}

class NotFoundError extends AppError {
  constructor(entity, id) {
    super(entity + ' not found: ' + id, 'NOT_FOUND')
    this.name = 'NotFoundError'
    this.entity = entity
  }
}

class NetworkError extends AppError {
  constructor(url, status, message) {
    super(message || 'Network error: ' + url + ' (' + status + ')', 'NETWORK_ERROR')
    this.name = 'NetworkError'
    this.url = url
    this.status = status
  }
}

class CalculationError extends AppError {
  constructor(description, details) {
    super(description, 'CALCULATION_ERROR')
    this.name = 'CalculationError'
    this.details = details
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  NetworkError,
  CalculationError
}
