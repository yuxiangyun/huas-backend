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
import { getUserInfo } from '@/entities/user/api/user-api';
import { userQueryKeys } from '@/entities/user/api/user-queries';
import { ApiError } from '@/shared/api/http-client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

function FieldMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-[#9e2e22]">{message}</p>;
}

export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const login = useAuthStore((state) => state.login);
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
      username: '',
      password: '',
      captcha: '',
    },
  });

  const loginMutation = useMutation({
    mutationFn: loginWithPassword,
  });

  const redirectPath = resolveRedirectPath(location, appRoutes.discover);

  const finalizeLogin = async (result: Awaited<ReturnType<typeof loginWithPassword>>) => {
    if (result.type === 'captcha_required') {
      setCaptchaSessionId(result.sessionId);
      setCaptchaImage(result.captchaImage);
      setValue('captcha', '');
      setStatusMessage(result.message);
      return;
    }

    setCaptchaSessionId(null);
    setCaptchaImage(null);
    resetField('captcha');
    clearErrors('captcha');
    login({
      token: result.token,
      userBrief: result.user,
    });

    void Promise.allSettled([
      queryClient.prefetchQuery({
        queryKey: discoverQueryKeys.meta(),
        queryFn: getDiscoverMeta,
      }),
      queryClient.prefetchQuery({
        queryKey: userQueryKeys.detail(false),
        queryFn: () => getUserInfo(false),
      }),
    ]);

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
      await finalizeLogin(result);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '登录失败，请稍后重试';
      setStatusMessage(message);
      if (captchaSessionId) {
        setValue('captcha', '');
      }
    }
  });

  return (
    <Card className="space-y-5 p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-ink">统一认证登录</h2>
        <p className="text-sm leading-6 text-muted">
          输入学号和密码即可登录，若需要验证码会自动切换到对应步骤。
        </p>
      </div>

      <form className="space-y-4" onSubmit={onLogin}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">学号</span>
          <input
            className="h-12 w-full rounded-[1.25rem] border border-line bg-white/75 px-4 text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-tint/20"
            placeholder="请输入学号"
            {...register('username')}
          />
          <FieldMessage message={errors.username?.message} />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">密码</span>
          <input
            className="h-12 w-full rounded-[1.25rem] border border-line bg-white/75 px-4 text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-tint/20"
            placeholder="请输入密码"
            type="password"
            {...register('password')}
          />
          <FieldMessage message={errors.password?.message} />
        </label>

        {captchaSessionId ? (
          <div className="space-y-3 rounded-[1.5rem] bg-tint-soft/70 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#7e3925]">输入验证码</p>
              <p className="text-sm leading-6 text-[#8b503f]">
                请根据图片内容补全验证码，学号和密码会自动保留。
              </p>
            </div>
            {captchaImage ? (
              <div className="overflow-hidden rounded-[1.25rem] border border-white/70 bg-white p-3">
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
                className="h-12 w-full rounded-[1.25rem] border border-line bg-white/75 px-4 text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-tint/20"
                placeholder="请输入图中验证码"
                {...register('captcha')}
              />
              <FieldMessage message={errors.captcha?.message} />
            </label>
          </div>
        ) : null}

        {statusMessage ? (
          <div className="rounded-[1.25rem] bg-tint-soft px-4 py-3 text-sm leading-6 text-[#7e3925]">
            {statusMessage}
          </div>
        ) : null}

        {redirectPath !== appRoutes.discover ? (
          <div className="rounded-[1.25rem] bg-white/75 px-4 py-3 text-sm leading-6 text-muted ring-1 ring-line">
            登录成功后会返回到 <span className="font-medium text-ink">{redirectPath}</span>
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
                size="md"
                type="button"
                variant="ghost"
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
                    await finalizeLogin(result);
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
                size="md"
                type="button"
                variant="ghost"
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
