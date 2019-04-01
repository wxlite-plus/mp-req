const req = require('./prototype.js');
// fn
const errFn = require('./fn/err.js');
const cachifyFn = require('./fn/cachify.js');

/**
 * 备注：为了使err.picker正确工作，
 * 请尽量保持返回原始的err对象，避免自定义err对象
 * 若需要自定义err对象，请统一使用以下结构体：
 * { msg: string, detail: any }
 */

req.use(errFn);
req.use(cachifyFn);

module.exports = req;
