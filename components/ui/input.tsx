import * as React from "react";

export function Input({
  className = "",
  type = "text",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={`bg-[#f7f8fa] border border-black/10 h-12 rounded-2xl px-4 text-[#1a1f2e] outline-none focus:border-orange-500/50 transition-all duration-300 ${className}`}
      {...props}
    />
  );
}
