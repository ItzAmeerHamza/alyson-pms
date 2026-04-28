import { z } from 'zod';

export const emailSchema = z
  .string()
  .email({ message: 'Please enter a valid email address' });

export const passwordSchema = z
  .string()
  .min(6, { message: 'Password must be at least 6 characters' });

export const roleSchema = z.enum(['admin', 'manager', 'team_leader', 'employee'], {
  required_error: 'Please select a role',
});

export const projectFormSchema = z.object({
  name: z.string().min(2, { message: 'Project name must be at least 2 characters' }),
  description: z.string().optional(),
});

export const loginFormSchema = z.object({
  company: z.string().min(1, { message: 'Please enter your company name' }),
  email: emailSchema,
  password: passwordSchema,
  rememberMe: z.boolean().default(false),
});

export const createUserFormSchema = z.object({
  email: emailSchema,
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  password: passwordSchema,
  role: roleSchema,
  projectIds: z.array(z.string()).optional(),
});

export const editEmailFormSchema = z.object({ email: emailSchema });

export const passwordResetFormSchema = z.object({
  newPassword: passwordSchema,
});

export const pauseUserFormSchema = z.object({
  reason: z.string().min(1, 'Please provide a reason for pausing the user'),
});

export const userRoleFormSchema = z.object({ role: roleSchema });

export const forgotPasswordFormSchema = z.object({ email: emailSchema });

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;
export type EditEmailFormValues = z.infer<typeof editEmailFormSchema>;
export type PasswordResetFormValues = z.infer<typeof passwordResetFormSchema>;
export type PauseUserFormValues = z.infer<typeof pauseUserFormSchema>;
export type UserRoleFormValues = z.infer<typeof userRoleFormSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;
export type ProjectFormValues = z.infer<typeof projectFormSchema>;
export type Role = z.infer<typeof roleSchema>;
