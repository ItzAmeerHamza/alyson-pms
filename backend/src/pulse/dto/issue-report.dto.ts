import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ISSUE_CATEGORIES, ISSUE_DIAGNOSTICS_MAX, ISSUE_MESSAGE_MAX } from '../issue-report';

export class CreateIssueReportDto {
  @IsIn(ISSUE_CATEGORIES)
  category!: (typeof ISSUE_CATEGORIES)[number];

  @IsString()
  @MinLength(10)
  @MaxLength(ISSUE_MESSAGE_MAX)
  message!: string;

  @IsOptional()
  @IsBoolean()
  include_diagnostics?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(ISSUE_DIAGNOSTICS_MAX)
  diagnostics?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  app_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  os_summary?: string;
}

export class ListIssueReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
