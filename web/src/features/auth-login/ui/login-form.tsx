import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolveRedirectPath } from '@/app/router/redirect';
import { appRoutes } from '@/app/router/paths';
import { discoverQueryKeys } from '@/entities/discover/model/discover-query-keys';
import { getDiscoverMeta } from '@/entities/discover/api/discover-api';
import { loginWithPassword } from '@/entities/auth/api/auth-api';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { loginSchema, type LoginFormValues } from '@/features/auth-login/model/login-schema';
import { ApiError } from '@/shared/api/http-client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

function FieldMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-error">{message}</p>;
}

const fieldClassName =
  'h-12 w-full rounded-[1.15rem] border border-line bg-white/86 px-3.5 text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-black/10';

const noteClassName =
  'rounded-[1.1rem] bg-white/78 px-4 py-3 text-sm leading-6 text-muted ring-1 ring-line';

const REMEMBERED_CREDENTIALS_STORAGE_KEY = 'huas-web.remembered-credentials';

interface RememberedCredentials {
  username: string;
  password: string;
}

function readRememberedCredentials(): RememberedCredentials | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(REMEMBERED_CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<RememberedCredentials>;
    if (!parsed.username || !parsed.password) return null;

    return {
      username: parsed.username,
      password: parsed.password,
    };
  } catch {
    return null;
  }
}

function writeRememberedCredentials(credentials: RememberedCredentials) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REMEMBERED_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
}

function clearRememberedCredentials() {
  if (typeof window === 'undefined') return;
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

  const redirectPath = resolveRedirectPath(location, appRoutes.discover);

  const finalizeLogin = async (
    result: Awaited<ReturnType<typeof loginWithPassword>>,
    credentials: RememberedCredentials
  ) => {
    if (result.type === 'captcha_required') {
      setCaptchaSessionId(result.sessionId);
      setCaptchaImage(result.captchaImage);
      setValue('captcha', '');
      setStatusMessage(result.message);
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
      queryKey: discoverQueryKeys.meta(),
      queryFn: getDiscoverMeta,
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
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-ink">登录</h2>
        <p className="text-sm leading-6 text-muted">
          输入学号和密码
        </p>
      </div>

      <form className="space-y-4 sm:space-y-[1.125rem]" onSubmit={onLogin}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">学号</span>
          <input
            autoComplete="username"
            className={fieldClassName}
            placeholder="请输入学号"
            {...register('username')}
          />
          <FieldMessage message={errors.username?.message} />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">密码</span>
          <input
            autoComplete="current-password"
            className={fieldClassName}
            placeholder="请输入密码"
            type="password"
            {...register('password')}
          />
          <FieldMessage message={errors.password?.message} />
        </label>

        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2.5 text-sm text-muted">
            <input
              checked={rememberPassword}
              className="size-4 rounded border border-line accent-black"
              type="checkbox"
              onChange={(event) => {
                const nextChecked = event.target.checked;
                setRememberPassword(nextChecked);

                if (!nextChecked) {
                  clearRememberedCredentials();
                }
              }}
            />
            <span>记住密码</span>
          </label>
          <span className="text-xs text-muted">仅当前设备</span>
        </div>

        {captchaSessionId ? (
          <div className="space-y-3 rounded-[1.25rem] bg-tint-soft p-3.5 ring-1 ring-line sm:p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">输入验证码</p>
              <p className="text-sm leading-6 text-muted">
                输入图中验证码
              </p>
            </div>
            {captchaImage ? (
              <div className="overflow-hidden rounded-[1.05rem] border border-line bg-white/90 p-3">
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
                className={fieldClassName}
                placeholder="请输入图中验证码"
                {...register('captcha')}
              />
              <FieldMessage message={errors.captcha?.message} />
            </label>
          </div>
        ) : null}

        {statusMessage ? (
          <div className={noteClassName}>
            {statusMessage}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <Button
            className={captchaSessionId ? 'min-w-[10rem]' : 'min-w-[7rem]'}
            fullWidth
            size="lg"
            type="submit"
            disabled={isSubmitting || loginMutation.isPending}
          >
            {captchaSessionId ? '提交验证码并登录' : '登录'}
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
                    setStatusMessage('正在更新验证码...');
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
                    if (result.type === 'captcha_required') {
                      setStatusMessage('验证码已更新，请输入新的内容。');
                    }
                  } catch (error) {
                    setStatusMessage(
                      error instanceof ApiError ? error.message : '验证码刷新失败，请稍后重试'
                    );
                  }
                }}
              >
                重新获取验证码
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
                取消验证码流程
              </Button>
            </>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
