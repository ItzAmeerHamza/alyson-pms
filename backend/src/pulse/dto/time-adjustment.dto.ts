import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTimeAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  /** Pacific work day YYYY-MM-DD */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate!: string;

  /** Signed seconds (+add / -remove). Prefer this or hours/deltaMinutes. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-86400)
  @Max(86400)
  deltaSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(-24)
  @Max(24)
  hours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1440)
  @Max(1440)
  deltaMinutes?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
