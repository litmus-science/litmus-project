"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { register as registerUser, login, getMe } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
  name?: string;
  organization?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>();

  const password = watch("password");

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    setError("");

    try {
      await registerUser({
        email: data.email,
        password: data.password,
        name: data.name,
        organization: data.organization,
      });

      // Auto-login after registration
      const token = await login(data.email, data.password);
      localStorage.setItem(
        "litmus-auth",
        JSON.stringify({ state: { token: token.access_token } })
      );
      const user = await getMe();
      setAuth(token.access_token, user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
              Create your account
            </h2>
            <p className="mt-2 text-sm text-surface-400">
              Or{" "}
              <Link
                href="/login"
                className="font-medium text-primary-light hover:text-primary transition-colors"
              >
                sign in to existing account
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
                Email address <span className="text-accent">*</span>
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
              <label htmlFor="name" className="block text-sm font-medium text-surface-500 mb-1">
                Full name
              </label>
              <input
                {...register("name")}
                type="text"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="organization" className="block text-sm font-medium text-surface-500 mb-1">
                Organization
              </label>
              <input
                {...register("organization")}
                type="text"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-surface-500 mb-1">
                Password <span className="text-accent">*</span>
              </label>
              <input
                {...register("password", {
                  required: "Password is required",
                  minLength: {
                    value: 8,
                    message: "Password must be at least 8 characters",
                  },
                })}
                type="password"
                className="input"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-accent">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-surface-500 mb-1">
                Confirm password <span className="text-accent">*</span>
              </label>
              <input
                {...register("confirmPassword", {
                  required: "Please confirm your password",
                  validate: (value) =>
                    value === password || "Passwords do not match",
                })}
                type="password"
                className="input"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-accent">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
