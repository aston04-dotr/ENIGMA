"use client";

import { useEffect } from "react";

export function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor =
    type === "success"
      ? "bg-[#22c55e]"
      : type === "error"
        ? "bg-danger"
        : "bg-accent";

  return (
    <div
      className={`fixed top-4 left-4 right-4 z-[200] ${bgColor} text-white px-4 py-3 rounded-xl shadow-lg transition-all duration-300 animate-fade-in`}
    >
      <p className="text-center text-sm font-medium">{message}</p>
    </div>
  );
}
