import * as React from "react";

export function Input({
  className = "",
  type = "text",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={`bg-alan border border-white/10 h-12 rounded-2xl px-4 text-yazi outline-none focus:border-altin/50 transition-all duration-300 ${className}`}
      {...props}
    />
  );
}
