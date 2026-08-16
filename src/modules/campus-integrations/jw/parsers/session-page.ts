/**
 * [INPUT]: 依赖 JW 登录页稳定的标题、表单 action 与失效提示结构
 * [OUTPUT]: 对外提供 looksLikeJwLoginPage 与 looksLikeAuthenticatedJwMainPage，区分 HTTP 200 登录页和已登录主框架
 * [POS]: campus-integrations/jw/parsers 的共享会话页判定，被 JW 业务解析器与换票激活验证复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

const JW_LOGIN_FORM_RE = /<form\b[^>]*\baction\s*=\s*["'][^"']*\/jsxsd\/xk\/LoginToXk(?:\?[^"']*)?["'][^>]*>/i;
const JW_LOGIN_TITLE_RE = /<title[^>]*>\s*登录\s*<\/title>/i;

export function looksLikeJwLoginPage(html: string): boolean {
  const hasLoginForm = JW_LOGIN_FORM_RE.test(html);
  const loginTitle = JW_LOGIN_TITLE_RE.test(html);
  const kickedByOtherLogin = html.includes('您的账号在其它地方登录');
  const loginFormText = html.includes('用户登录') && html.includes('验证码');

  return kickedByOtherLogin || hasLoginForm || (loginTitle && loginFormText);
}

export function looksLikeAuthenticatedJwMainPage(html: string): boolean {
  if (!html.trim() || looksLikeJwLoginPage(html)) return false;

  const hasLogoutControl = /id\s*=\s*["']btn_userLogout["']/i.test(html) ||
    /安全退出|退出系统/.test(html);
  const hasMainShell = /id\s*=\s*["']mainContentPanle["']/i.test(html) ||
    html.includes('教学一体化服务平台');

  return hasLogoutControl && hasMainShell;
}
