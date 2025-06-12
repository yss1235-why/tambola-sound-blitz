// src/hooks/use-toast.ts - Cleaned up version (minimal implementation)
import * as React from "react"

interface ToastProps {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
}

// Minimal implementation that does nothing (no actual toast notifications)
export const useToast = () => {
  return {
    toast: (props: ToastProps) => {
      // Do nothing - toast notifications removed
      console.log('Toast (disabled):', props.title, props.description);
    },
    dismiss: (toastId?: string) => {
      // Do nothing
    },
    toasts: []
  };
};

export const toast = (props: ToastProps) => {
  // Do nothing - toast notifications removed
  console.log('Toast (disabled):', props.title, props.description);
};
