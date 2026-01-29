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
        <div className="card p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-litmus-base-teal to-litmus-base-blue flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-display text-2xl">L</span>
            </div>
            <h2 className="text-2xl font-display text-primary">
              Sign in to Litmus
            </h2>
            <p className="mt-2 text-sm text-surface-400">
              Or{" "}
              <Link
                href="/register"
                className="font-medium text-primary-light hover:text-primary transition-colors"
              >
                create a new account
              </Link>
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div className="bg-accent-50 border border-accent-200 text-accent px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-surface-500 mb-1">
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
                <p className="mt-1 text-sm text-accent">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-surface-500 mb-1">
                Password
              </label>
              <input
                {...register("password", { required: "Password is required" })}
                type="password"
                className="input"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-accent">{errors.password.message}</p>
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
