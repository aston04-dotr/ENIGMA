"use client";

import { useEffect } from "react";

type Props = {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
};

export function SimpleToast({ message, type, onClose }: Props) {
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
      className={`fixed top-4 left-4 right-4 z-[140] ${bgColor} animate-fade-in rounded-xl px-4 py-3 text-center text-white shadow-lg transition-all duration-300`}
    >
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
