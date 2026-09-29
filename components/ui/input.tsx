import * as React from "react";

export function Input({
  className = "",
  type = "text",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={`bg-white/[0.035] border border-white/[0.08] h-12 rounded-2xl px-4 text-white outline-none transition-all duration-300 placeholder:text-white/25 focus:border-[#d9b866]/40 focus:bg-white/[0.05] ${className}`}
      {...props}
    />
  );
}
