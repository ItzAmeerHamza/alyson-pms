import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const CREATABLE_PULSE_ROLES = [
  'employee',
  'team_leader',
  'manager',
  'admin',
] as const;

export type CreatablePulseRole = (typeof CREATABLE_PULSE_ROLES)[number];

export class CreateUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  first_name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  last_name!: string;

  @IsIn(CREATABLE_PULSE_ROLES)
  role!: CreatablePulseRole;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  /** Optional project UUIDs to assign on invite (workspace-scoped). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  project_ids?: string[];
}
