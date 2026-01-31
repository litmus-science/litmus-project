"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { login, getMe } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError("");

    try {
      const token = await login(data.email, data.password);
      // Temporarily store token to fetch user
      localStorage.setItem(
        "litmus-auth",
        JSON.stringify({ state: { token: token.access_token } })
      );
      const user = await getMe();
      setAuth(token.access_token, user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="card p-10">
          <div className="text-center mb-10">
            <div className="w-12 h-12 bg-surface-900 flex items-center justify-center mx-auto mb-6">
              <span className="text-accent font-display text-2xl">L</span>
            </div>
            <h2 className="text-3xl font-display text-surface-900">
              Sign In
            </h2>
            <p className="mt-3 text-sm text-surface-500">
              Or{" "}
              <Link
                href="/register"
                className="text-accent hover:text-accent-dim transition-colors"
              >
                create a new account
              </Link>
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div className="alert-error">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="form-label">
                Email address
              </label>
              <input
                {...register("email", {
                  required: "Email is required",
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: "Invalid email address",
                  },
                })}
                type="email"
                className="input"
              />
              {errors.email && (
                <p className="form-error">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                {...register("password", { required: "Password is required" })}
                type="password"
                className="input"
              />
              {errors.password && (
                <p className="form-error">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
