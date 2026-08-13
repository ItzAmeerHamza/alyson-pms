import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { LEAVE_TYPES, TEAM_LEAVE_ALL_TEAMS } from '../leave-days';

export class CreateLeaveEventDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsIn([...LEAVE_TYPES])
  leaveType!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  halfDay?: boolean;
}

export class CreateTeamLeaveEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location!: string;

  /** Department / team name, or `__all_teams__`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  team!: string;

  @IsString()
  @IsIn([...LEAVE_TYPES])
  leaveType!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AssignInboxLeaveDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsOptional()
  @IsString()
  @IsIn([...LEAVE_TYPES])
  leaveType?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  halfDay?: boolean;
}

export class LeaveScanDto {
  /** 7d | 30d (default) | 60d | 90d | 6mo | 12mo | 24mo */
  @IsOptional()
  @IsString()
  @IsIn(['7d', '30d', '60d', '90d', '6mo', '12mo', '24mo'])
  period?: string;

  /** Optional Gmail query override. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  query?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxMessages?: number;
}

export { TEAM_LEAVE_ALL_TEAMS };
