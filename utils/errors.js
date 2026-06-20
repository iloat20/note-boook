/**
 * errors.js — 统一错误类型
 *
 * 提供语义化的错误类，替代散落的 Error 和字符串错误码。
 * 所有业务错误继承 AppError，便于统一捕获和处理。
 */

/**
 * 应用基础错误类
 */
class AppError extends Error {
	/**
	 * @param {string} code - 错误码（如 'VALIDATION' | 'NOT_FOUND' | 'NETWORK' | 'CALCULATION'）
	 * @param {string} message - 人类可读的错误信息
	 * @param {Object} [context] - 可选的上下文信息（用于日志）
	 */
	constructor(code, message, context) {
		super(message);
		this.name = "AppError";
		this.code = code;
		this.context = context || {};
	}
}

/**
 * 数据验证错误
 */
class ValidationError extends AppError {
	constructor(model, reason) {
		super("VALIDATION", `[${model}] ${reason}`, { model, reason });
		this.name = "ValidationError";
		this.model = model;
	}
}

/**
 * 数据未找到错误
 */
class NotFoundError extends AppError {
	constructor(entity, id) {
		super("NOT_FOUND", `${entity} not found: ${id}`, { entity, id });
		this.name = "NotFoundError";
		this.entity = entity;
		this.entityId = id;
	}
}

/**
 * 网络请求错误
 */
class NetworkError extends AppError {
	constructor(url, statusCode, originalError) {
		super("NETWORK", `Request failed: ${url} (status ${statusCode})`, {
			url,
			statusCode,
			originalError,
		});
		this.name = "NetworkError";
		this.url = url;
		this.statusCode = statusCode;
	}
}

/**
 * 计算错误（XIRR 等）
 */
class CalculationError extends AppError {
	constructor(calculation, reason) {
		super("CALCULATION", `${calculation} calculation failed: ${reason}`, {
			calculation,
			reason,
		});
		this.name = "CalculationError";
		this.calculation = calculation;
	}
}

module.exports = {
	AppError,
	ValidationError,
	NotFoundError,
	NetworkError,
	CalculationError,
};
