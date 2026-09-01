import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class WorkspaceSettingsFieldsDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(24)
  hours_threshold?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  high_activity_threshold?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(10)
  low_activity_threshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  screenshot_interval_minutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  screenshot_count_per_window?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(120)
  screenshot_window_minutes?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  timezone?: string;
}

export class UpdateWorkspaceSettingsDto extends WorkspaceSettingsFieldsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  key?: string;
}

export class CreateWorkspaceDto extends WorkspaceSettingsFieldsDto {
  /** Bootstrap Pulse on an existing Palisade workspace instead of inserting a new one. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  existing_workspace_id?: number;

  @ValidateIf((o: CreateWorkspaceDto) => o.existing_workspace_id == null)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  key?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  project_name?: string;

  @IsEmail()
  @MaxLength(320)
  admin_email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  admin_first_name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  admin_last_name!: string;
}
