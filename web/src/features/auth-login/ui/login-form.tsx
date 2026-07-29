/**
 * [INPUT]: 依赖认证 API、表单校验、树洞元数据查询、站内重定向规则与本机密码记忆选项
 * [OUTPUT]: 对外提供 LoginForm，处理验证码登录、认证状态提交与登录后导航
 * [POS]: features/auth-login 的交互编排器，认证成功后预取默认树洞页元数据但不持有路由配置
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolveRedirectPath } from '@/app/router/redirect';
import { loginWithPassword } from '@/entities/auth/api/auth-api';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { getTreeholeMeta } from '@/entities/treehole/api/treehole-api';
import { treeholeQueryKeys } from '@/entities/treehole/model/treehole-query-keys';
import { loginSchema, type LoginFormValues } from '@/features/auth-login/model/login-schema';
import { ApiError } from '@/shared/api/http-client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

function FieldMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-error">{message}</p>;
}

const REMEMBERED_CREDENTIALS_STORAGE_KEY = 'huas-web.remembered-credentials';

interface RememberedCredentials {
  username: string;
  password: string;
}

function readRememberedCredentials(): RememberedCredentials | null {
  try {
    const raw = window.localStorage.getItem(REMEMBERED_CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedCredentials>;
    if (!parsed.username || !parsed.password) return null;
    return { username: parsed.username, password: parsed.password };
  } catch {
    return null;
  }
}

function writeRememberedCredentials(credentials: RememberedCredentials) {
  window.localStorage.setItem(REMEMBERED_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
}

function clearRememberedCredentials() {
  window.localStorage.removeItem(REMEMBERED_CREDENTIALS_STORAGE_KEY);
}

export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const login = useAuthStore((state) => state.login);
  const [rememberedCredentials] = useState<RememberedCredentials | null>(() => readRememberedCredentials());
  const [rememberPassword, setRememberPassword] = useState(rememberedCredentials !== null);
  const [captchaSessionId, setCaptchaSessionId] = useState<string | null>(null);
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const {
    clearErrors,
    getValues,
    register,
    handleSubmit,
    setError,
    setValue,
    resetField,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: rememberedCredentials?.username ?? '',
      password: rememberedCredentials?.password ?? '',
      captcha: '',
    },
  });

  const loginMutation = useMutation({
    mutationFn: loginWithPassword,
  });

  const redirectPath = resolveRedirectPath(location);

  const finalizeLogin = async (
    result: Awaited<ReturnType<typeof loginWithPassword>>,
    credentials: RememberedCredentials
  ) => {
    if (result.type === 'captcha_required') {
      setCaptchaSessionId(result.sessionId);
      setCaptchaImage(result.captchaImage);
      setValue('captcha', '');
      setStatusMessage(null);
      return;
    }

    if (rememberPassword) {
      writeRememberedCredentials(credentials);
    } else {
      clearRememberedCredentials();
    }

    setCaptchaSessionId(null);
    setCaptchaImage(null);
    resetField('captcha');
    clearErrors('captcha');
    login({
      token: result.token,
      userBrief: result.user,
    });

    void queryClient.prefetchQuery({
      queryKey: treeholeQueryKeys.meta(),
      queryFn: getTreeholeMeta,
    });

    navigate(redirectPath, { replace: true });
  };

  const onLogin = handleSubmit(async (values) => {
    if (captchaSessionId && !values.captcha?.trim()) {
      setError('captcha', { type: 'manual', message: '请输入验证码' });
      return;
    }

    try {
      setStatusMessage(null);
      clearErrors('captcha');
      const result = await loginMutation.mutateAsync({
        username: values.username.trim(),
        password: values.password,
        captcha: captchaSessionId ? values.captcha?.trim() || undefined : undefined,
        sessionId: captchaSessionId || undefined,
      });
      await finalizeLogin(result, {
        username: values.username.trim(),
        password: values.password,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '登录失败，请稍后重试';
      setStatusMessage(message);
      if (captchaSessionId) {
        setValue('captcha', '');
      }
    }
  });

  return (
    <Card className="space-y-5 bg-card-strong sm:space-y-6">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">登录</h2>

      <form className="space-y-4 sm:space-y-[1.125rem]" onSubmit={onLogin}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">学号</span>
          <input
            autoComplete="username"
            className="field-control"
            {...register('username')}
          />
          <FieldMessage message={errors.username?.message} />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">密码</span>
          <input
            autoComplete="current-password"
            className="field-control"
            type="password"
            {...register('password')}
          />
          <FieldMessage message={errors.password?.message} />
        </label>

        <label className="inline-flex min-h-9 items-center gap-2 text-sm text-muted">
          <input
            checked={rememberPassword}
            className="size-4 rounded border border-line accent-black"
            type="checkbox"
            onChange={(event) => {
              setRememberPassword(event.target.checked);
              if (!event.target.checked) clearRememberedCredentials();
            }}
          />
          记住密码
        </label>

        {captchaSessionId ? (
          <div className="space-y-3 rounded-[0.75rem] border border-line bg-tint-soft p-3">
            <p className="text-sm font-semibold text-ink">验证码</p>
            {captchaImage ? (
              <div className="overflow-hidden rounded-[0.625rem] border border-line bg-white p-3">
                <img
                  alt="验证码"
                  className="mx-auto h-24 w-auto"
                  src={`data:image/png;base64,${captchaImage}`}
                />
              </div>
            ) : null}
            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink">验证码</span>
              <input
                className="field-control"
                {...register('captcha')}
              />
              <FieldMessage message={errors.captcha?.message} />
            </label>
          </div>
        ) : null}

        {statusMessage ? (
          <p className="text-sm text-error">{statusMessage}</p>
        ) : null}

        <div className="flex flex-col gap-3">
          <Button
            fullWidth
            size="lg"
            type="submit"
            disabled={isSubmitting || loginMutation.isPending}
          >
            {loginMutation.isPending ? '登录中…' : '登录'}
          </Button>
          {captchaSessionId ? (
            <>
              <Button
                className="min-w-[8.5rem]"
                fullWidth
                size="sm"
                type="button"
                variant="subtle"
                disabled={loginMutation.isPending || isSubmitting}
                onClick={async () => {
                  const passed = await trigger(['username', 'password']);
                  if (!passed) return;

                  const values = getValues();

                  try {
                    setStatusMessage(null);
                    clearErrors('captcha');
                    resetField('captcha');
                    const result = await loginMutation.mutateAsync({
                      username: values.username.trim(),
                      password: values.password,
                    });
                    await finalizeLogin(result, {
                      username: values.username.trim(),
                      password: values.password,
                    });
                  } catch (error) {
                    setStatusMessage(
                      error instanceof ApiError ? error.message : '验证码刷新失败，请稍后重试'
                    );
                  }
                }}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                更换验证码
              </Button>

              <Button
                className="min-w-[8.5rem]"
                fullWidth
                size="sm"
                type="button"
                variant="subtle"
                onClick={() => {
                  setCaptchaSessionId(null);
                  setCaptchaImage(null);
                  setStatusMessage(null);
                  resetField('captcha');
                  clearErrors('captcha');
                }}
              >
                取消
              </Button>
            </>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
