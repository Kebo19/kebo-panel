import * as React from "react";

export function Input({
  className = "",
  type = "text",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={`bg-[#0d1117] border border-white/5 h-12 rounded-2xl px-4 text-white outline-none focus:border-orange-500/50 transition-all duration-300 ${className}`}
      {...props}
    />
  );
}