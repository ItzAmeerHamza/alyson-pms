
import { ReactNode } from 'react';

interface SanitizedInputProps {
  children: ReactNode;
  allowHtml?: boolean;
}

export function sanitizeInput(input: string, allowHtml = false): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let sanitized = input.trim();

  if (!allowHtml) {
    // Remove HTML tags and potential script injections
    sanitized = sanitized
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  // Remove null bytes and other dangerous characters
  sanitized = sanitized.replace(/\0/g, '');

  return sanitized;
}

export function validateAndSanitizeEmail(email: string): string | null {
  const sanitized = sanitizeInput(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (emailRegex.test(sanitized) && sanitized.length <= 254) {
    return sanitized.toLowerCase();
  }
  
  return null;
}

export function SanitizedInput({ children, allowHtml = false }: SanitizedInputProps) {
  return <>{children}</>;
}
