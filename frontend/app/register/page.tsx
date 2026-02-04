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
        JSON.stringify({ state: { token: token.access_token } }),
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
        <div className="card p-10">
          <div className="text-center mb-10">
            <div className="w-12 h-12 bg-surface-900 flex items-center justify-center mx-auto mb-6">
              <span className="text-accent font-display text-2xl">L</span>
            </div>
            <h2 className="text-3xl font-display text-surface-900">
              Create Account
            </h2>
            <p className="mt-3 text-sm text-surface-500">
              Or{" "}
              <Link
                href="/login"
                className="text-accent hover:text-accent-dim transition-colors"
              >
                sign in to existing account
              </Link>
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            {error && <div className="alert-error">{error}</div>}

            <div>
              <label htmlFor="email" className="form-label">
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
                <p className="form-error">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="name" className="form-label">
                Full name
              </label>
              <input {...register("name")} type="text" className="input" />
            </div>

            <div>
              <label htmlFor="organization" className="form-label">
                Organization
              </label>
              <input
                {...register("organization")}
                type="text"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="password" className="form-label">
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
                <p className="form-error">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="form-label">
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
                <p className="form-error">{errors.confirmPassword.message}</p>
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
