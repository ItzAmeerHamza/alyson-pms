import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BulkSetCountryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  country!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  user_ids!: string[];
}
