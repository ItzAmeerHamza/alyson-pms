
export function isValidUUID(uuid: string): boolean {
  if (typeof uuid !== 'string') {
    return false;
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export function validateProjectId(projectId: string | null | undefined): string | null {
  if (!projectId || typeof projectId !== 'string') {
    console.warn('Invalid project ID type:', typeof projectId, projectId);
    return null;
  }
  
  // Sanitize input - remove any potential injection attempts
  const sanitized = projectId.trim();
  
  // Check for common invalid values and potential security issues
  if (sanitized === 'activity-tracking' || 
      sanitized === 'proj-001' || 
      sanitized.length < 36 ||
      sanitized.includes('<') ||
      sanitized.includes('>') ||
      sanitized.includes('"') ||
      sanitized.includes("'")) {
    console.warn('Invalid or potentially malicious project ID format:', projectId);
    return null;
  }
  
  if (isValidUUID(sanitized)) {
    return sanitized;
  }
  
  console.warn(`Invalid project ID format: ${projectId}`);
  return null;
}

export function validateUserId(userId: string | null | undefined): string | null {
  if (!userId || typeof userId !== 'string') {
    console.warn('Invalid user ID type:', typeof userId, userId);
    return null;
  }
  
  // Sanitize input - remove any potential injection attempts
  const sanitized = userId.trim();
  
  // Check for common invalid values and potential security issues
  if (sanitized === 'activity-tracking' || 
      sanitized === 'proj-001' || 
      sanitized.length < 36 ||
      sanitized.includes('<') ||
      sanitized.includes('>') ||
      sanitized.includes('"') ||
      sanitized.includes("'")) {
    console.warn('Invalid or potentially malicious user ID format:', userId);
    return null;
  }
  
  if (isValidUUID(sanitized)) {
    return sanitized;
  }
  
  console.warn(`Invalid user ID format: ${userId}`);
  return null;
}

export function sanitizeUUID(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  
  // Remove any non-UUID characters and normalize
  const cleaned = value.trim().replace(/[^0-9a-f-]/gi, '');
  
  if (isValidUUID(cleaned)) {
    return cleaned;
  }
  
  return null;
}

// Rate limiting for validation functions
const validationAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_VALIDATION_ATTEMPTS = 100;
const VALIDATION_WINDOW_MS = 60000; // 1 minute

export function rateLimit(identifier: string): boolean {
  const now = Date.now();
  const attempts = validationAttempts.get(identifier);
  
  if (!attempts) {
    validationAttempts.set(identifier, { count: 1, lastAttempt: now });
    return true;
  }
  
  // Reset counter if window has passed
  if (now - attempts.lastAttempt > VALIDATION_WINDOW_MS) {
    validationAttempts.set(identifier, { count: 1, lastAttempt: now });
    return true;
  }
  
  // Check if rate limit exceeded
  if (attempts.count >= MAX_VALIDATION_ATTEMPTS) {
    console.warn(`Rate limit exceeded for identifier: ${identifier}`);
    return false;
  }
  
  // Increment counter
  attempts.count++;
  attempts.lastAttempt = now;
  return true;
}

// Generate a valid fallback UUID if needed
export function generateFallbackUUID(): string {
  return '00000000-0000-4000-8000-000000000001';
}

// Safe database operation wrapper
export function withUUIDValidation<T>(
  operation: () => Promise<T>,
  entityType: string,
  entityId: string | null | undefined
): Promise<T | null> {
  // Validate the UUID before proceeding
  const validId = sanitizeUUID(entityId);
  
  if (!validId) {
    console.error(`Invalid ${entityType} ID provided: ${entityId}`);
    return Promise.resolve(null);
  }
  
  // Rate limit the operation
  if (!rateLimit(`${entityType}:${validId}`)) {
    console.error(`Rate limit exceeded for ${entityType} operation`);
    return Promise.resolve(null);
  }
  
  return operation().catch((error) => {
    console.error(`Database operation failed for ${entityType}:`, error);
    return null;
  });
}
